// spiderman
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { PedidoCompleto } from "../repositories/PedidoRepository";
import { StatusPedido } from "../generated/prisma/enums";
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from "../errors";
import { Ator, FotoPublica, Paginacao, Pagina, fotoPublica, paraSkipTake } from "./tipos";

export const MAX_ITENS_PEDIDO = 30;

export interface PedidoDto {
  id: string;
  status: StatusPedido;
  totalCentavos: number;
  expiraEm: Date;
  pagoEm: Date | null;
  criadoEm: Date;
  itens: { id: string; precoCentavos: number; foto: FotoPublica }[];
  pagamentos: {
    id: string;
    metodo: string;
    status: string;
    valorCentavos: number;
    pixCopiaECola: string | null;
    cartaoBandeira: string | null;
    cartaoFinal: string | null;
    motivoRecusa: string | null;
    criadoEm: Date;
  }[];
}

export function pedidoDto(p: PedidoCompleto): PedidoDto {
  return {
    id: p.id,
    status: p.status,
    totalCentavos: p.totalCentavos,
    expiraEm: p.expiraEm,
    pagoEm: p.pagoEm,
    criadoEm: p.criadoEm,
    itens: p.itens.map((i) => ({ id: i.id, precoCentavos: i.precoCentavos, foto: fotoPublica(i.foto) })),
    pagamentos: p.pagamentos.map((g) => ({
      id: g.id,
      metodo: g.metodo,
      status: g.status,
      valorCentavos: g.valorCentavos,
      pixCopiaECola: g.status === "pendente" ? g.pixCopiaECola : null,
      cartaoBandeira: g.cartaoBandeira,
      cartaoFinal: g.cartaoFinal,
      motivoRecusa: g.motivoRecusa,
      criadoEm: g.criadoEm,
    })),
  };
}

/**
 * Pedidos de compra. Um pedido "reserva" os precos por pedidoExpiraMin
 * minutos (snapshot em ItemPedido). Regras: so fotos publicadas, sem
 * repetir foto ja comprada, no maximo 30 por pedido, e um unico pedido
 * pendente por comprador (um novo cancela o anterior).
 */
export class PedidoService {
  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly opcoes: { taxaPlataformaPercent: number; pedidoExpiraMin: number }
  ) {}

  async criar(ator: Ator, fotoIdsBrutos: string[]): Promise<PedidoDto> {
    const fotoIds = Array.from(new Set(fotoIdsBrutos));
    if (fotoIds.length === 0) throw new ErroValidacao("Escolha ao menos uma foto.");
    if (fotoIds.length > MAX_ITENS_PEDIDO) throw new ErroValidacao(`Um pedido aceita no maximo ${MAX_ITENS_PEDIDO} fotos.`);

    const pedido = await this.uow.transacao(async (r) => {
      // Serializa pedidos do mesmo comprador (evita dois pedidos simultaneos com a mesma foto).
      await r.usuarios.bloquear(ator.id);
      const fotos = await r.fotos.buscarVarias(fotoIds);
      const porId = new Map(fotos.map((f) => [f.id, f]));
      for (const id of fotoIds) {
        const f = porId.get(id);
        if (!f || f.status !== "publicada") throw new ErroValidacao("Uma das fotos escolhidas nao esta mais disponivel.");
      }
      const jaTem = await r.pedidos.fotoIdsJaCompradas(ator.id, fotoIds);
      if (jaTem.size > 0) {
        const nomes = Array.from(jaTem).map((id) => porId.get(id)?.titulo ?? id);
        throw new ErroConflito(`Voce ja possui: ${nomes.join(", ")}. Remova do carrinho.`);
      }

      // Um comprador mantem so um pedido pendente: cancela os anteriores.
      const anteriores = await r.pedidos.listarDoComprador(ator.id, 0, 50);
      for (const p of anteriores.itens.filter((x) => x.status === "pendente")) {
        await r.pedidos.transicionar(p.id, "pendente", "cancelado");
        await r.pedidos.cancelarPagamentosPendentes(p.id);
      }

      const itens = fotoIds.map((id) => {
        const f = porId.get(id)!;
        const taxa = Math.min(f.precoCentavos, Math.round((f.precoCentavos * this.opcoes.taxaPlataformaPercent) / 100));
        return { fotoId: f.id, fotografoId: f.fotografoId, precoCentavos: f.precoCentavos, taxaPlataformaCentavos: taxa };
      });
      const total = itens.reduce((s, i) => s + i.precoCentavos, 0);
      const p = await r.pedidos.criar(ator.id, itens, total, new Date(Date.now() + this.opcoes.pedidoExpiraMin * 60_000));
      await r.auditoria.registrar(ator.id, "PEDIDO_CRIADO", { pedidoId: p.id, itens: itens.length, totalCentavos: total });
      return p;
    });
    return pedidoDto(pedido);
  }

  /** Carrega o pedido do comprador; se estiver pendente e vencido, expira na hora. */
  async carregarDoComprador(ator: Ator, id: string): Promise<PedidoCompleto> {
    const r = this.uow.simples();
    let p = await r.pedidos.buscarPorId(id);
    if (!p || p.compradorId !== ator.id) throw new ErroNaoEncontrado("Pedido nao encontrado.");
    if (p.status === "pendente" && p.expiraEm.getTime() < Date.now()) {
      await this.expirarVencidos();
      p = (await r.pedidos.buscarPorId(id)) as PedidoCompleto;
    }
    return p;
  }

  async obter(ator: Ator, id: string): Promise<PedidoDto> {
    return pedidoDto(await this.carregarDoComprador(ator, id));
  }

  async listar(ator: Ator, pag: Paginacao): Promise<Pagina<PedidoDto>> {
    await this.expirarVencidos();
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().pedidos.listarDoComprador(ator.id, skip, take);
    return { itens: r.itens.map(pedidoDto), total: r.total };
  }

  async cancelar(ator: Ator, id: string): Promise<PedidoDto> {
    await this.uow.transacao(async (r) => {
      const p = await r.pedidos.buscarPorId(id);
      if (!p || p.compradorId !== ator.id) throw new ErroNaoEncontrado("Pedido nao encontrado.");
      await r.pedidos.bloquear(id);
      if (!(await r.pedidos.transicionar(id, "pendente", "cancelado"))) {
        throw new ErroConflito("So e possivel cancelar pedidos pendentes.");
      }
      await r.pedidos.cancelarPagamentosPendentes(id);
      await r.auditoria.registrar(ator.id, "PEDIDO_CANCELADO", { pedidoId: id });
    });
    return this.obter(ator, id);
  }

  /** Expira pedidos pendentes vencidos (chamado sob demanda e por uma varredura periodica no servidor). */
  expirarVencidos(): Promise<number> {
    return this.uow.transacao((r) => r.pedidos.expirarVencidos(new Date()));
  }
}
