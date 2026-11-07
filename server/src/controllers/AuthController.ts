// spiderman
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthService, UsuarioPublico } from "../services/AuthService";
import { PerfilService, DadosPerfil } from "../services/PerfilService";
import { ContatoService } from "../services/ContatoService";
import { PayloadJwt, NOME_COOKIE_SESSAO } from "../plugins/autenticacao";
import { ErroNaoAutenticado } from "../errors";

type Assinar = (payload: PayloadJwt) => string;

export interface OpcoesSessao {
  sessaoSegundos: number;
  sessaoMaximaSegundos: number;
  /** Cookie com o atributo Secure (producao/HTTPS). */
  cookieSeguro: boolean;
}

/**
 * Controller de autenticacao e conta: so traduz HTTP <-> servico. Nao tem
 * regra de negocio e nunca acessa o banco.
 */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly perfis: PerfilService,
    private readonly contato: ContatoService,
    private readonly assinar: Assinar,
    private readonly opcoes: OpcoesSessao
  ) {}

  /**
   * Abre (ou renova) a sessao: o token vai num cookie HttpOnly + SameSite=Strict (o JavaScript da
   * pagina nunca o le, entao um XSS nao consegue roubar a sessao). O token tambem vem no corpo
   * para clientes de API (Authorization: Bearer).
   */
  private async sessao(u: UsuarioPublico, reply: FastifyReply, inicio = Math.floor(Date.now() / 1000)) {
    const token = this.assinar({ sub: u.id, papel: u.papel, sv: await this.service.impressaoDaSessao(u.id), inicio });
    const attrs = ["HttpOnly", "SameSite=Strict", "Path=/api", `Max-Age=${this.opcoes.sessaoSegundos}`];
    if (this.opcoes.cookieSeguro) attrs.push("Secure");
    reply.header("Set-Cookie", `${NOME_COOKIE_SESSAO}=${token}; ${attrs.join("; ")}`);
    reply.header("Cache-Control", "no-store");
    return { token, tipo: "Bearer", expiraEm: new Date(Date.now() + this.opcoes.sessaoSegundos * 1000).toISOString(), usuario: u };
  }

  /** Encerra a sessao do navegador (apaga o cookie). Rota publica: funciona mesmo com a sessao ja expirada. */
  sair = async (_req: FastifyRequest, reply: FastifyReply) => {
    const attrs = ["HttpOnly", "SameSite=Strict", "Path=/api", "Max-Age=0"];
    if (this.opcoes.cookieSeguro) attrs.push("Secure");
    return reply.header("Set-Cookie", `${NOME_COOKIE_SESSAO}=; ${attrs.join("; ")}`).status(204).send();
  };

  cadastro = async (
    req: FastifyRequest<{ Body: { nome: string; sobrenome: string; email: string; senha: string; tipo: "comprador" | "fotografo"; nomeArtistico?: string } }>,
    reply: FastifyReply
  ) => reply.status(201).send(await this.sessao(await this.service.cadastrar(req.body), reply));

  login = async (req: FastifyRequest<{ Body: { email: string; senha: string } }>, reply: FastifyReply) =>
    this.sessao(await this.service.login(req.body.email, req.body.senha), reply);

  recuperar = async (req: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) => {
    await this.service.solicitarRecuperacao(req.body.email);
    // Resposta identica exista a conta ou nao.
    return reply.status(202).send({ mensagem: "Se existir uma conta com este e-mail, enviamos as instrucoes." });
  };

  redefinir = async (req: FastifyRequest<{ Body: { token: string; novaSenha: string } }>, reply: FastifyReply) => {
    await this.service.redefinirSenha(req.body.token, req.body.novaSenha);
    return reply.status(204).send();
  };

  /** Sessao deslizante: com um token ainda valido emite outro de 30 min (o front chama enquanto ha atividade). */
  renovar = async (req: FastifyRequest, reply: FastifyReply) => {
    // Teto absoluto: mesmo com atividade constante, a sessao nao passa de 12 h sem nova senha.
    if (Date.now() / 1000 - req.sessao.inicio > this.opcoes.sessaoMaximaSegundos) throw new ErroNaoAutenticado("Sessao expirada. Entre novamente.");
    return this.sessao(await this.service.obterMeusDados(req.ator), reply, req.sessao.inicio);
  };

  eu = async (req: FastifyRequest) => {
    const usuario = await this.service.obterMeusDados(req.ator);
    const perfil = req.ator.papel === "fotografo" ? await this.perfis.obterMeu(req.ator) : null;
    return { usuario, perfil };
  };

  atualizarEu = async (req: FastifyRequest<{ Body: { nome?: string; sobrenome?: string; versao?: number } }>) =>
    this.service.atualizarMeusDados(req.ator, req.body);

  alterarSenha = async (req: FastifyRequest<{ Body: { senhaAtual: string; novaSenha: string } }>, reply: FastifyReply) => {
    await this.service.alterarSenha(req.ator, req.body.senhaAtual, req.body.novaSenha);
    // Todas as outras sessoes morrem (a impressao da senha mudou); esta recebe um cookie novo.
    await this.sessao(await this.service.obterMeusDados(req.ator), reply);
    return reply.status(204).send();
  };

  atualizarPerfil = async (req: FastifyRequest<{ Body: DadosPerfil }>) => this.perfis.atualizar(req.ator, req.body);

  contatar = async (req: FastifyRequest<{ Body: { nome: string; email: string; mensagem: string; site?: string } }>, reply: FastifyReply) => {
    // Campo-isca (honeypot): humanos nao o veem; se vier preenchido, e robo. Respondemos igual, sem gravar.
    if (!req.body.site) await this.contato.enviar(req.body);
    return reply.status(202).send({ mensagem: "Mensagem recebida. Entraremos em contato em breve." });
  };
}
