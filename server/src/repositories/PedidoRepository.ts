// spiderman
import { Db, Prisma } from "../db/prisma";
import { MetodoPagamento, StatusPagamento } from "../generated/prisma/enums";
import { incluirFoto } from "./FotoRepository";

const incluirPedido = {
  itens: { include: { foto: { include: incluirFoto } }, orderBy: { id: "asc" as const } },
  pagamentos: { orderBy: { criadoEm: "desc" as const } },
} satisfies Prisma.PedidoInclude;

export type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof incluirPedido }>;

export interface NovoItem {
  fotoId: string;
  fotografoId: string;
  precoCentavos: number;
  taxaPlataformaCentavos: number;
}

/** Repositorio de pedidos, itens, pagamentos e consultas financeiras. Sem regra de negocio. */
export class PedidoRepository {
  constructor(private readonly db: Db) {}

  criar(compradorId: string, itens: NovoItem[], totalCentavos: number, expiraEm: Date) {
    return this.db.pedido.create({
      data: { compradorId, totalCentavos, expiraEm, itens: { create: itens } },
      include: incluirPedido,
    });
  }

  buscarPorId(id: string) {
    return this.db.pedido.findUnique({ where: { id }, include: incluirPedido });
  }

  /** Bloqueia a linha do pedido ate o fim da transacao (serializa pagamento x cancelamento x webhook). */
  async bloquear(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT "id" FROM "Pedido" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }

  async listarDoComprador(compradorId: string, skip: number, take: number) {
    const where = { compradorId };
    const [itens, total] = await Promise.all([
      this.db.pedido.findMany({ where, orderBy: { criadoEm: "desc" }, skip, take, include: incluirPedido }),
      this.db.pedido.count({ where }),
    ]);
    return { itens, total };
  }

  /** Quais destas fotos o comprador ja possui (pedido pago)? */
  async fotoIdsJaCompradas(compradorId: string, fotoIds: string[]): Promise<Set<string>> {
    const itens = await this.db.itemPedido.findMany({
      where: { fotoId: { in: fotoIds }, pedido: { compradorId, status: "pago" } },
      select: { fotoId: true },
    });
    return new Set(itens.map((i) => i.fotoId));
  }

  /** Transicao de status condicionada ao status atual (idempotente: so aplica se ainda estiver no estado esperado). */
  async transicionar(id: string, de: "pendente", para: "pago" | "cancelado" | "expirado", extra: Prisma.PedidoUpdateManyMutationInput = {}) {
    const r = await this.db.pedido.updateMany({
      where: { id, status: de },
      data: { status: para, versao: { increment: 1 }, atualizadoEm: new Date(), ...extra },
    });
    return r.count === 1;
  }

  /** Expira pedidos pendentes vencidos e cancela os pagamentos pendentes deles. Devolve quantos expiraram. */
  async expirarVencidos(agora: Date): Promise<number> {
    const vencidos = await this.db.pedido.findMany({ where: { status: "pendente", expiraEm: { lt: agora } }, select: { id: true } });
    if (vencidos.length === 0) return 0;
    const ids = vencidos.map((v) => v.id);
    const r = await this.db.pedido.updateMany({
      where: { id: { in: ids }, status: "pendente" },
      data: { status: "expirado", versao: { increment: 1 }, atualizadoEm: agora },
    });
    await this.db.pagamento.updateMany({ where: { pedidoId: { in: ids }, status: "pendente" }, data: { status: "cancelado" } });
    return r.count;
  }

  criarPagamento(dados: {
    pedidoId: string;
    metodo: MetodoPagamento;
    status: StatusPagamento;
    valorCentavos: number;
    referenciaGateway: string;
    pixCopiaECola?: string | null;
    gatewayPedidoId?: string | null;
    cartaoBandeira?: string | null;
    cartaoFinal?: string | null;
    motivoRecusa?: string | null;
    confirmadoEm?: Date | null;
  }) {
    return this.db.pagamento.create({ data: dados });
  }

  /** Grava o resultado da chamada ao gateway, somente se o pagamento ainda estiver pendente. */
  async atualizarPagamentoPendente(
    id: string,
    dados: { gatewayPedidoId?: string | null; pixCopiaECola?: string | null; cartaoBandeira?: string | null; cartaoFinal?: string | null }
  ) {
    const r = await this.db.pagamento.updateMany({ where: { id, status: "pendente" }, data: dados });
    return r.count === 1;
  }

  buscarPagamentoPendenteDoPedido(pedidoId: string) {
    return this.db.pagamento.findFirst({ where: { pedidoId, status: "pendente" }, orderBy: { criadoEm: "desc" } });
  }

  buscarPagamentoPorReferencia(referenciaGateway: string) {
    return this.db.pagamento.findUnique({ where: { referenciaGateway }, include: { pedido: true } });
  }

  /** Atualiza o pagamento somente se ainda estiver pendente (idempotencia do webhook). */
  async resolverPagamentoPendente(id: string, status: "aprovado" | "recusado" | "cancelado", motivoRecusa?: string) {
    const r = await this.db.pagamento.updateMany({
      where: { id, status: "pendente" },
      data: { status, motivoRecusa: motivoRecusa ?? null, confirmadoEm: status === "aprovado" ? new Date() : null },
    });
    return r.count === 1;
  }

  cancelarPagamentosPendentes(pedidoId: string) {
    return this.db.pagamento.updateMany({ where: { pedidoId, status: "pendente" }, data: { status: "cancelado" } });
  }

  // ---------- Compras (biblioteca do comprador) ----------

  async listarCompras(compradorId: string, skip: number, take: number) {
    const where: Prisma.ItemPedidoWhereInput = { pedido: { compradorId, status: "pago" } };
    const [itens, total] = await Promise.all([
      this.db.itemPedido.findMany({
        where,
        orderBy: { pedido: { pagoEm: "desc" } },
        skip,
        take,
        include: { foto: { include: incluirFoto }, pedido: { select: { id: true, pagoEm: true } } },
      }),
      this.db.itemPedido.count({ where }),
    ]);
    return { itens, total };
  }

  buscarItem(id: string) {
    return this.db.itemPedido.findUnique({ where: { id }, include: { pedido: true, foto: true } });
  }

  registrarDownload(id: string) {
    return this.db.itemPedido.update({ where: { id }, data: { downloads: { increment: 1 } } });
  }

  // ---------- Financeiro ----------

  async resumoDoFotografo(fotografoId: string) {
    const where: Prisma.ItemPedidoWhereInput = { fotografoId, pedido: { status: "pago" } };
    const soma = await this.db.itemPedido.aggregate({ where, _sum: { precoCentavos: true, taxaPlataformaCentavos: true }, _count: { _all: true } });
    return {
      vendas: soma._count._all,
      brutoCentavos: soma._sum.precoCentavos ?? 0,
      taxaCentavos: soma._sum.taxaPlataformaCentavos ?? 0,
    };
  }

  async listarVendasDoFotografo(fotografoId: string, skip: number, take: number) {
    const where: Prisma.ItemPedidoWhereInput = { fotografoId, pedido: { status: "pago" } };
    const [itens, total] = await Promise.all([
      this.db.itemPedido.findMany({
        where,
        orderBy: { pedido: { pagoEm: "desc" } },
        skip,
        take,
        include: {
          foto: { select: { id: true, titulo: true } },
          pedido: { select: { id: true, pagoEm: true, comprador: { select: { nome: true, sobrenome: true } } } },
        },
      }),
      this.db.itemPedido.count({ where }),
    ]);
    return { itens, total };
  }

  async resumoPlataforma() {
    const soma = await this.db.itemPedido.aggregate({
      where: { pedido: { status: "pago" } },
      _sum: { precoCentavos: true, taxaPlataformaCentavos: true },
      _count: { _all: true },
    });
    const porStatus = await this.db.pedido.groupBy({ by: ["status"], _count: { _all: true } });
    return {
      itensVendidos: soma._count._all,
      brutoCentavos: soma._sum.precoCentavos ?? 0,
      taxaCentavos: soma._sum.taxaPlataformaCentavos ?? 0,
      pedidosPorStatus: Object.fromEntries(porStatus.map((p) => [p.status, p._count._all])),
    };
  }
}
