// spiderman
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { Ator, Paginacao, Pagina, paraSkipTake } from "./tipos";

export interface ResumoEstudio {
  fotosPublicadas: number;
  fotosOcultas: number;
  eventos: number;
  vendas: number;
  brutoCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
}

export interface VendaDto {
  itemId: string;
  fotoId: string;
  tituloFoto: string;
  pagoEm: Date | null;
  precoCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
  /** Privacidade: o fotografo ve apenas nome e inicial do sobrenome do comprador. */
  comprador: string;
}

/** Indicadores: painel do fotografo (estudio) e painel do administrador. */
export class PainelService {
  constructor(private readonly uow: UnidadeDeTrabalho) {}

  async resumoEstudio(ator: Ator): Promise<ResumoEstudio> {
    const r = this.uow.simples();
    const [pub, oculta, eventos, fin] = await Promise.all([
      r.fotos.listar({ fotografoId: ator.id, status: "publicada" }, 0, 1),
      r.fotos.listar({ fotografoId: ator.id, status: "oculta" }, 0, 1),
      r.eventos.listar({ fotografoId: ator.id }, 0, 1),
      r.pedidos.resumoDoFotografo(ator.id),
    ]);
    return {
      fotosPublicadas: pub.total,
      fotosOcultas: oculta.total,
      eventos: eventos.total,
      vendas: fin.vendas,
      brutoCentavos: fin.brutoCentavos,
      taxaCentavos: fin.taxaCentavos,
      liquidoCentavos: fin.brutoCentavos - fin.taxaCentavos,
    };
  }

  async listarVendas(ator: Ator, pag: Paginacao): Promise<Pagina<VendaDto>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().pedidos.listarVendasDoFotografo(ator.id, skip, take);
    return {
      total: r.total,
      itens: r.itens.map((i) => ({
        itemId: i.id,
        fotoId: i.foto.id,
        tituloFoto: i.foto.titulo,
        pagoEm: i.pedido.pagoEm,
        precoCentavos: i.precoCentavos,
        taxaCentavos: i.taxaPlataformaCentavos,
        liquidoCentavos: i.precoCentavos - i.taxaPlataformaCentavos,
        comprador: `${i.pedido.comprador.nome} ${i.pedido.comprador.sobrenome.charAt(0)}.`,
      })),
    };
  }

  async resumoAdmin() {
    const r = this.uow.simples();
    const [usuarios, fotos, fin] = await Promise.all([r.usuarios.contarPorPapel(), r.fotos.contarPorStatus(), r.pedidos.resumoPlataforma()]);
    return {
      usuariosPorPapel: Object.fromEntries(usuarios.map((u) => [u.papel, u._count._all])),
      fotosPorStatus: Object.fromEntries(fotos.map((f) => [f.status, f._count._all])),
      ...fin,
    };
  }
}
