// spiderman
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { EventoCompleto } from "../repositories/EventoRepository";
import { textoOpcional, validarDataIso } from "../core/validadores";
import { ErroNaoEncontrado, ErroValidacao } from "../errors";
import { Ator, Paginacao, Pagina, nomeExibicao, paraSkipTake, versaoEfetiva } from "./tipos";

export interface EventoDto {
  id: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  dataEvento: string; // AAAA-MM-DD
  ativo: boolean;
  versao: number;
  totalFotos: number;
  fotografo: { id: string; nome: string };
  urlCapa: string | null;
}

function dto(e: EventoCompleto, capa?: string): EventoDto {
  return {
    id: e.id,
    titulo: e.titulo,
    descricao: e.descricao,
    local: e.local,
    dataEvento: e.dataEvento.toISOString().slice(0, 10),
    ativo: e.ativo,
    versao: e.versao,
    totalFotos: e._count.fotos,
    fotografo: { id: e.fotografo.id, nome: nomeExibicao(e.fotografo) },
    urlCapa: capa ? `/api/v1/fotos/${capa}/miniatura` : null,
  };
}

export interface DadosEvento {
  titulo?: string;
  descricao?: string | null;
  local?: string | null;
  dataEvento?: string;
  ativo?: boolean;
  versao?: number;
}

/** Eventos (coberturas): o fotografo agrupa suas fotos por evento; o publico navega por eles. */
export class EventoService {
  constructor(private readonly uow: UnidadeDeTrabalho) {}

  private async comCapas(itens: EventoCompleto[]): Promise<EventoDto[]> {
    const capas = await this.uow.simples().fotos.capasDeEventos(itens.map((e) => e.id));
    return itens.map((e) => dto(e, capas.get(e.id)));
  }

  async criar(ator: Ator, d: Required<Pick<DadosEvento, "titulo" | "dataEvento">> & DadosEvento): Promise<EventoDto> {
    const titulo = (d.titulo ?? "").trim();
    if (titulo.length < 3) throw new ErroValidacao("O titulo do evento deve ter no minimo 3 caracteres.");
    const dataEvento = validarDataIso(d.dataEvento, "Data do evento");
    return this.uow.transacao(async (r) => {
      const e = await r.eventos.criar({
        fotografoId: ator.id,
        titulo,
        descricao: textoOpcional(d.descricao, "Descricao", 1000),
        local: textoOpcional(d.local, "Local", 150),
        dataEvento,
      });
      await r.auditoria.registrar(ator.id, "EVENTO_CRIADO", { eventoId: e.id });
      return dto(e);
    });
  }

  async atualizar(ator: Ator, id: string, d: DadosEvento): Promise<EventoDto> {
    const mudancas: Record<string, unknown> = {};
    if (d.titulo !== undefined) {
      const t = d.titulo.trim();
      if (t.length < 3) throw new ErroValidacao("O titulo do evento deve ter no minimo 3 caracteres.");
      mudancas.titulo = t;
    }
    if (d.descricao !== undefined) mudancas.descricao = textoOpcional(d.descricao, "Descricao", 1000);
    if (d.local !== undefined) mudancas.local = textoOpcional(d.local, "Local", 150);
    if (d.dataEvento !== undefined) mudancas.dataEvento = validarDataIso(d.dataEvento, "Data do evento");
    if (d.ativo !== undefined) mudancas.ativo = d.ativo;
    const atualizado = await this.uow.transacao(async (r) => {
      const e = await r.eventos.buscarPorId(id);
      if (!e || e.fotografoId !== ator.id) throw new ErroNaoEncontrado("Evento nao encontrado.");
      const novo = await r.eventos.atualizarComVersao(id, versaoEfetiva(d.versao, e.versao), mudancas);
      await r.auditoria.registrar(ator.id, "EVENTO_ATUALIZADO", { eventoId: id });
      return novo;
    });
    return (await this.comCapas([atualizado]))[0];
  }

  /** Exclui o evento; as fotos continuam publicadas, apenas sem evento (FK SET NULL). */
  async excluir(ator: Ator, id: string): Promise<void> {
    await this.uow.transacao(async (r) => {
      const e = await r.eventos.buscarPorId(id);
      if (!e || e.fotografoId !== ator.id) throw new ErroNaoEncontrado("Evento nao encontrado.");
      await r.eventos.excluir(id);
      await r.auditoria.registrar(ator.id, "EVENTO_EXCLUIDO", { eventoId: id });
    });
  }

  async listarPublicos(q: string | undefined, pag: Paginacao): Promise<Pagina<EventoDto>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().eventos.listar({ publico: true, q }, skip, take);
    return { itens: await this.comCapas(r.itens), total: r.total };
  }

  async listarDoFotografo(ator: Ator, pag: Paginacao): Promise<Pagina<EventoDto>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().eventos.listar({ fotografoId: ator.id }, skip, take);
    return { itens: await this.comCapas(r.itens), total: r.total };
  }

  async obterPublico(id: string): Promise<EventoDto> {
    const e = await this.uow.simples().eventos.buscarPorId(id);
    if (!e || !e.ativo) throw new ErroNaoEncontrado("Evento nao encontrado.");
    return (await this.comCapas([e]))[0];
  }
}
