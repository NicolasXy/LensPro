// spiderman
import * as bcrypt from "bcrypt";
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { Papel } from "../generated/prisma/enums";
import { validarForcaSenha, normalizarEmail, validarNome } from "../core/validadores";
import { gerarToken, iguaisEmTempoConstante, sha256Hex } from "../core/crypto";
import { ErroConflito, ErroMuitasTentativas, ErroNaoAutenticado, ErroNaoEncontrado, ErroPermissao, ErroValidacao } from "../errors";
import { Ator, Paginacao, Pagina, paraSkipTake, versaoEfetiva } from "./tipos";
import { EnviadorEmail } from "./Mailer";

/** Resultado sem dados sensiveis (nunca expomos senhaHash, tokens ou contadores internos). */
export interface UsuarioPublico {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  versao: number;
  criadoEm: Date;
  nomeArtistico?: string | null;
}

type UsuarioDb = {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  versao: number;
  criadoEm: Date;
  perfil?: { nomeArtistico: string } | null;
};

export function usuarioPublico(u: UsuarioDb): UsuarioPublico {
  const r: UsuarioPublico = {
    id: u.id,
    nome: u.nome,
    sobrenome: u.sobrenome,
    email: u.email,
    papel: u.papel,
    ativo: u.ativo,
    versao: u.versao,
    criadoEm: u.criadoEm,
  };
  if (u.perfil !== undefined) r.nomeArtistico = u.perfil?.nomeArtistico ?? null;
  return r;
}

export interface DadosCadastro {
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
  /** Tipo de conta escolhido no cadastro publico: so "comprador" ou "fotografo" (admin nunca e criado por aqui). */
  tipo: "comprador" | "fotografo";
  nomeArtistico?: string;
}

export interface OpcoesAuth {
  bcryptRounds: number;
  loginMaxFalhas: number;
  loginBloqueioMin: number;
  urlPublica: string;
}

const VALIDADE_RESET_MS = 60 * 60 * 1000; // 1 hora, como no sistema original

/**
 * Regras de negocio de identidade e contas. Em API stateless nao ha sessao em
 * memoria: o login apenas VERIFICA credenciais; a emissao do JWT acontece no
 * controller (que conhece o Fastify). O hash de senha usa bcrypt (salt
 * aleatorio embutido e custo configuravel).
 */
/** 12 hex derivados do hash da senha: muda sempre que a senha muda e nao revela nada util do hash. */
function impressaoDaSenha(senhaHash: string): string {
  return sha256Hex("sv|" + senhaHash).slice(0, 12);
}

export class AuthService {
  // Hash "isca" usado quando o e-mail nao existe, para que o tempo de
  // resposta nao revele se a conta existe (mitiga enumeracao de contas).
  private readonly hashIsca: string;

  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly opcoes: OpcoesAuth,
    private readonly email: EnviadorEmail
  ) {
    this.hashIsca = bcrypt.hashSync("senha-isca-lenspro", opcoes.bcryptRounds);
  }

  private hash(senha: string): Promise<string> {
    return bcrypt.hash(senha, this.opcoes.bcryptRounds);
  }

  /** Cria a conta e, para fotografos, o perfil publico, tudo na mesma transacao. */
  private async criarConta(dados: DadosCadastro & { papel: Papel }, autorId: string | null): Promise<UsuarioPublico> {
    const nome = validarNome(dados.nome, "Nome");
    const sobrenome = validarNome(dados.sobrenome, "Sobrenome");
    const email = normalizarEmail(dados.email);
    validarForcaSenha(dados.senha);
    const nomeArtistico = dados.papel === "fotografo" ? validarNome(dados.nomeArtistico ?? `${nome} ${sobrenome}`, "Nome artistico") : null;
    const senhaHash = await this.hash(dados.senha);

    return this.uow.transacao(async (r) => {
      if (await r.usuarios.buscarPorEmail(email)) throw new ErroConflito("E-mail ja cadastrado.");
      const u = await r.usuarios.criar({ nome, sobrenome, email, senhaHash, papel: dados.papel });
      if (nomeArtistico) await r.perfis.criar({ usuarioId: u.id, nomeArtistico });
      await r.auditoria.registrar(autorId ?? u.id, "USUARIO_CRIADO", { usuarioId: u.id, papel: dados.papel, porAdmin: autorId !== null });
      return usuarioPublico({ ...u, perfil: nomeArtistico ? { nomeArtistico } : null });
    });
  }

  /** Cadastro publico (tela de "Criar conta"): comprador ou fotografo. */
  cadastrar(dados: DadosCadastro): Promise<UsuarioPublico> {
    if (dados.tipo !== "comprador" && dados.tipo !== "fotografo") throw new ErroValidacao("Tipo de conta invalido.");
    return this.criarConta({ ...dados, papel: dados.tipo }, null);
  }

  /**
   * Cadastro feito por um administrador: qualquer papel, inclusive outro admin.
   * `ator` nulo = provisionamento (seed/primeira instalacao), sem autor na auditoria.
   */
  criarPeloAdmin(ator: Ator | null, dados: DadosCadastro & { papel: Papel }): Promise<UsuarioPublico> {
    return this.criarConta(dados, ator ? ator.id : null);
  }

  async login(emailInformado: string, senha: string): Promise<UsuarioPublico> {
    const r = this.uow.simples();
    const email = (emailInformado ?? "").trim().toLowerCase();
    const u = await r.usuarios.buscarPorEmail(email);

    if (u?.bloqueadoAte && u.bloqueadoAte.getTime() > Date.now()) {
      await r.auditoria.registrar(u.id, "LOGIN_BLOQUEADO", {});
      throw new ErroMuitasTentativas(`Muitas tentativas de login. Tente novamente em ${this.opcoes.loginBloqueioMin} minutos.`);
    }

    // Sempre compara contra algum hash (o da conta ou a isca): tempo de resposta constante.
    const senhaOk = await bcrypt.compare(senha ?? "", u ? u.senhaHash : this.hashIsca);
    if (!u || !senhaOk || !u.ativo) {
      if (u) {
        const bloqueou = await r.usuarios.registrarFalhaLogin(u.id, this.opcoes.loginMaxFalhas, this.opcoes.loginBloqueioMin);
        if (bloqueou) await r.auditoria.registrar(u.id, "CONTA_BLOQUEADA_TEMPORARIAMENTE", {});
      }
      await r.auditoria.registrar(u?.id ?? null, "LOGIN_FALHA", { email: /^[^\s@]{1,64}@[^\s@]{1,100}$/.test(email) ? email : "(formato invalido)" });
      // Mensagem generica: nao revela se a conta existe, esta desativada ou a senha errou.
      throw new ErroNaoAutenticado("E-mail ou senha invalidos.");
    }
    await r.usuarios.zerarFalhasLogin(u.id);
    await r.auditoria.registrar(u.id, "LOGIN_SUCESSO", {});
    const completo = await r.usuarios.buscarPorId(u.id);
    return usuarioPublico(completo ?? u);
  }

  /**
   * Resolve o ator de uma requisicao autenticada: relê o usuario no banco e
   * confirma que a conta continua ativa. Por isso desativar uma conta ou
   * trocar o papel vale IMEDIATAMENTE, sem esperar o JWT expirar.
   */
  async obterAtor(id: string, sv: string): Promise<Ator> {
    const u = await this.uow.simples().usuarios.buscarPorId(id);
    if (!u || !u.ativo) throw new ErroNaoAutenticado("Conta inexistente ou desativada.");
    // Senha trocada/redefinida desde a emissao do token: a sessao antiga morre.
    if (!iguaisEmTempoConstante(impressaoDaSenha(u.senhaHash), sv ?? "")) throw new ErroNaoAutenticado("Sessao encerrada. Entre novamente.");
    return { id: u.id, email: u.email, nome: u.nome, papel: u.papel };
  }

  /** Impressao da senha atual do usuario (vai dentro do token; ver obterAtor). */
  async impressaoDaSessao(id: string): Promise<string> {
    const u = await this.uow.simples().usuarios.buscarPorId(id);
    if (!u) throw new ErroNaoAutenticado("Conta inexistente.");
    return impressaoDaSenha(u.senhaHash);
  }

  async obterMeusDados(ator: Ator): Promise<UsuarioPublico> {
    const u = await this.uow.simples().usuarios.buscarPorId(ator.id);
    if (!u) throw new ErroNaoEncontrado("Usuario nao encontrado.");
    return usuarioPublico(u);
  }

  async atualizarMeusDados(ator: Ator, dados: { nome?: string; sobrenome?: string; versao?: number }): Promise<UsuarioPublico> {
    const nome = dados.nome !== undefined ? validarNome(dados.nome, "Nome") : undefined;
    const sobrenome = dados.sobrenome !== undefined ? validarNome(dados.sobrenome, "Sobrenome") : undefined;
    return this.uow.transacao(async (r) => {
      const u = await r.usuarios.buscarPorId(ator.id);
      if (!u) throw new ErroNaoEncontrado("Usuario nao encontrado.");
      const novo = await r.usuarios.atualizarComVersao(u.id, versaoEfetiva(dados.versao, u.versao), { nome, sobrenome });
      await r.auditoria.registrar(ator.id, "USUARIO_DADOS_ALTERADOS", {});
      return usuarioPublico(novo);
    });
  }

  async alterarSenha(ator: Ator, senhaAtual: string, novaSenha: string): Promise<void> {
    validarForcaSenha(novaSenha);
    const r = this.uow.simples();
    const u = await r.usuarios.buscarPorId(ator.id);
    if (!u || !(await bcrypt.compare(senhaAtual ?? "", u.senhaHash))) {
      await r.auditoria.registrar(ator.id, "TROCA_SENHA_FALHA", {});
      throw new ErroValidacao("A senha atual esta incorreta.");
    }
    await r.usuarios.definirSenha(u.id, await this.hash(novaSenha));
    await r.auditoria.registrar(ator.id, "SENHA_ALTERADA", {});
  }

  /**
   * Recuperacao de senha (fluxo do sistema original, endurecido): gera um
   * token aleatorio de 256 bits, guarda apenas o SHA-256 dele (se o banco
   * vazar, os links nao podem ser reaproveitados), validade de 1 hora e uso
   * unico. A resposta e SEMPRE a mesma, exista a conta ou nao.
   */
  async solicitarRecuperacao(emailInformado: string): Promise<void> {
    const email = (emailInformado ?? "").trim().toLowerCase();
    const r = this.uow.simples();
    const u = await r.usuarios.buscarPorEmail(email);
    if (!u || !u.ativo) return;
    const token = gerarToken();
    await r.usuarios.definirResetToken(u.id, sha256Hex(token), new Date(Date.now() + VALIDADE_RESET_MS));
    await r.auditoria.registrar(u.id, "RECUPERACAO_SENHA_SOLICITADA", {});
    await this.email.enviar(
      u.email,
      "Recuperacao de senha - LensPro",
      `Ola, ${u.nome}!\n\nPara criar uma nova senha acesse (valido por 1 hora):\n${this.opcoes.urlPublica}/redefinir-senha/${token}\n\nSe voce nao pediu isso, ignore este e-mail.`
    );
  }

  async redefinirSenha(token: string, novaSenha: string): Promise<void> {
    validarForcaSenha(novaSenha);
    const r = this.uow.simples();
    const u = await r.usuarios.buscarPorResetHash(sha256Hex(token ?? ""));
    if (!u || !u.resetExpiraEm || u.resetExpiraEm.getTime() < Date.now() || !u.ativo) {
      throw new ErroValidacao("Link de recuperacao invalido ou expirado. Solicite um novo.");
    }
    await r.usuarios.definirSenha(u.id, await this.hash(novaSenha));
    await r.auditoria.registrar(u.id, "SENHA_REDEFINIDA", {});
  }

  // ---------- Administracao ----------

  async listar(filtro: { papel?: Papel; q?: string }, pag: Paginacao): Promise<Pagina<UsuarioPublico>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().usuarios.listar(filtro, skip, take);
    return { itens: r.itens.map(usuarioPublico), total: r.total };
  }

  async alterarAtivo(ator: Ator, id: string, ativo: boolean, versao?: number): Promise<UsuarioPublico> {
    if (ator.id === id && !ativo) throw new ErroPermissao("Voce nao pode desativar a propria conta.");
    return this.uow.transacao(async (r) => {
      const u = await r.usuarios.buscarPorId(id);
      if (!u) throw new ErroNaoEncontrado("Usuario nao encontrado.");
      const novo = await r.usuarios.atualizarComVersao(id, versaoEfetiva(versao, u.versao), { ativo });
      await r.auditoria.registrar(ator.id, ativo ? "USUARIO_REATIVADO" : "USUARIO_DESATIVADO", { usuarioId: id });
      return usuarioPublico(novo);
    });
  }

  async renomear(ator: Ator, id: string, dados: { nome: string; sobrenome: string; versao?: number }): Promise<UsuarioPublico> {
    const nome = validarNome(dados.nome, "Nome");
    const sobrenome = validarNome(dados.sobrenome, "Sobrenome");
    return this.uow.transacao(async (r) => {
      const u = await r.usuarios.buscarPorId(id);
      if (!u) throw new ErroNaoEncontrado("Usuario nao encontrado.");
      const novo = await r.usuarios.atualizarComVersao(id, versaoEfetiva(dados.versao, u.versao), { nome, sobrenome });
      await r.auditoria.registrar(ator.id, "USUARIO_RENOMEADO", { usuarioId: id });
      return usuarioPublico(novo);
    });
  }

  async redefinirSenhaPeloAdmin(ator: Ator, id: string, novaSenha: string): Promise<void> {
    validarForcaSenha(novaSenha);
    const r = this.uow.simples();
    const u = await r.usuarios.buscarPorId(id);
    if (!u) throw new ErroNaoEncontrado("Usuario nao encontrado.");
    await r.usuarios.definirSenha(id, await this.hash(novaSenha));
    await r.auditoria.registrar(ator.id, "SENHA_REDEFINIDA_PELO_ADMIN", { usuarioId: id });
  }
}
