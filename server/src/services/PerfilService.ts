// spiderman
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { cifrarTexto } from "../core/crypto";
import { textoOpcional, validarNome } from "../core/validadores";
import { ErroNaoEncontrado, ErroValidacao } from "../errors";
import { Ator, Paginacao, Pagina, paraSkipTake, versaoEfetiva } from "./tipos";

/** Perfil como o PROPRIO fotografo ve (inclui a mascara da chave Pix, nunca a chave). */
export interface PerfilPrivado {
  nomeArtistico: string;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  especialidade: string | null;
  pixMascara: string | null;
  /** Conta PagBank (ACCO_...) que recebe a parte do fotografo em cada venda (split). */
  pagbankContaId: string | null;
  versao: number;
}

/** Perfil como a vitrine publica ve. */
export interface PerfilPublico {
  id: string;
  nomeArtistico: string;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  especialidade: string | null;
  totalFotos: number;
}

export interface DadosPerfil {
  nomeArtistico?: string;
  bio?: string | null;
  cidade?: string | null;
  estado?: string | null;
  especialidade?: string | null;
  /** Chave Pix para repasse: string = definir/trocar, null = remover, undefined = manter. */
  pixChave?: string | null;
  /** Id da conta PagBank: string = vincular/trocar, null = desvincular, undefined = manter. */
  pagbankContaId?: string | null;
  versao?: number;
}

function privado(p: { nomeArtistico: string; bio: string | null; cidade: string | null; estado: string | null; especialidade: string | null; pixMascara: string | null; pagbankContaId: string | null; versao: number }): PerfilPrivado {
  return {
    nomeArtistico: p.nomeArtistico,
    bio: p.bio,
    cidade: p.cidade,
    estado: p.estado,
    especialidade: p.especialidade,
    pixMascara: p.pixMascara,
    pagbankContaId: p.pagbankContaId,
    versao: p.versao,
  };
}

/** Mostra so o final da chave ("••••1234"); o restante existe apenas cifrado. */
function mascarar(chave: string): string {
  return "••••" + chave.slice(-4);
}

/**
 * Perfil publico do fotografo. A chave Pix (dado sensivel de repasse) e
 * guardada CIFRADA com AES-256-GCM (coluna pixChaveCifrada); a API nunca a
 * devolve, apenas a mascara. O proprio servico de repasse (futuro) e quem
 * decifraria usando a chave mestra.
 */
export class PerfilService {
  constructor(private readonly uow: UnidadeDeTrabalho, private readonly chaveMestra: Buffer) {}

  async obterMeu(ator: Ator): Promise<PerfilPrivado> {
    const p = await this.uow.simples().perfis.buscar(ator.id);
    if (!p) throw new ErroNaoEncontrado("Perfil de fotografo nao encontrado.");
    return privado(p);
  }

  async atualizar(ator: Ator, dados: DadosPerfil): Promise<PerfilPrivado> {
    const mudancas: Record<string, string | null> = {};
    if (dados.nomeArtistico !== undefined) mudancas.nomeArtistico = validarNome(dados.nomeArtistico, "Nome artistico");
    if (dados.bio !== undefined) mudancas.bio = textoOpcional(dados.bio, "Bio", 1000);
    if (dados.cidade !== undefined) mudancas.cidade = textoOpcional(dados.cidade, "Cidade", 80);
    if (dados.especialidade !== undefined) mudancas.especialidade = textoOpcional(dados.especialidade, "Especialidade", 80);
    if (dados.estado !== undefined) {
      const uf = textoOpcional(dados.estado, "Estado", 2);
      if (uf !== null && !/^[A-Za-z]{2}$/.test(uf)) throw new ErroValidacao("Estado deve ser a sigla com 2 letras (ex.: SP).");
      mudancas.estado = uf ? uf.toUpperCase() : null;
    }
    if (dados.pixChave !== undefined) {
      if (dados.pixChave === null || dados.pixChave.trim() === "") {
        mudancas.pixChaveCifrada = null;
        mudancas.pixMascara = null;
      } else {
        const chave = dados.pixChave.trim();
        if (chave.length < 5 || chave.length > 77 || /\s/.test(chave)) throw new ErroValidacao("Chave Pix invalida.");
        mudancas.pixChaveCifrada = cifrarTexto(this.chaveMestra, chave);
        mudancas.pixMascara = mascarar(chave);
      }
    }
    if (dados.pagbankContaId !== undefined) {
      const id = dados.pagbankContaId === null ? "" : dados.pagbankContaId.trim();
      if (id === "") mudancas.pagbankContaId = null;
      else if (!/^ACCO_[A-Za-z0-9-]{4,36}$/.test(id)) throw new ErroValidacao("ID da conta PagBank invalido. Ele comeca com ACCO_ (ex.: ACCO_1A2B3C...).");
      else mudancas.pagbankContaId = id;
    }
    return this.uow.transacao(async (r) => {
      const atual = await r.perfis.buscar(ator.id);
      if (!atual) throw new ErroNaoEncontrado("Perfil de fotografo nao encontrado.");
      const novo = await r.perfis.atualizarComVersao(ator.id, versaoEfetiva(dados.versao, atual.versao), mudancas);
      await r.auditoria.registrar(ator.id, dados.pixChave !== undefined ? "PERFIL_ATUALIZADO_COM_PIX" : "PERFIL_ATUALIZADO", { contaPagbank: dados.pagbankContaId === undefined ? "mantida" : mudancas.pagbankContaId ? "vinculada" : "removida" });
      return privado(novo);
    });
  }

  async listarPublicos(q: string | undefined, pag: Paginacao): Promise<Pagina<PerfilPublico>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().perfis.listarPublicos(q, skip, take);
    return {
      total: r.total,
      itens: r.itens.map((p) => ({
        id: p.usuarioId,
        nomeArtistico: p.nomeArtistico,
        bio: p.bio,
        cidade: p.cidade,
        estado: p.estado,
        especialidade: p.especialidade,
        totalFotos: p.usuario._count.fotos,
      })),
    };
  }

  async obterPublico(id: string): Promise<PerfilPublico> {
    const p = await this.uow.simples().perfis.buscarPublico(id);
    if (!p) throw new ErroNaoEncontrado("Fotografo nao encontrado.");
    return {
      id: p.usuarioId,
      nomeArtistico: p.nomeArtistico,
      bio: p.bio,
      cidade: p.cidade,
      estado: p.estado,
      especialidade: p.especialidade,
      totalFotos: p.usuario._count.fotos,
    };
  }
}
