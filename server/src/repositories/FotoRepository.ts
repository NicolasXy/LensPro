// spiderman
import { Db, Prisma } from "../db/prisma";
import { StatusFoto } from "../generated/prisma/enums";
import { ErroConflito } from "../errors";

/** Dados do fotografo e do evento que acompanham toda foto retornada pela API. */
export const incluirFoto = {
  fotografo: { select: { id: true, nome: true, sobrenome: true, perfil: { select: { nomeArtistico: true } } } },
  evento: { select: { id: true, titulo: true } },
} satisfies Prisma.FotoInclude;

export type FotoCompleta = Prisma.FotoGetPayload<{ include: typeof incluirFoto }>;

export type OrdemFoto = "recentes" | "preco_asc" | "preco_desc";

export interface FiltroFoto {
  q?: string;
  tag?: string;
  eventoId?: string;
  fotografoId?: string;
  status?: StatusFoto;
  /** Quando true, restringe a fotos publicadas de fotografos ativos (vitrine publica). */
  vitrine?: boolean;
  precoMin?: number;
  precoMax?: number;
  ordem?: OrdemFoto;
}

function orderBy(ordem: OrdemFoto | undefined): Prisma.FotoOrderByWithRelationInput[] {
  if (ordem === "preco_asc") return [{ precoCentavos: "asc" }, { criadoEm: "desc" }];
  if (ordem === "preco_desc") return [{ precoCentavos: "desc" }, { criadoEm: "desc" }];
  return [{ criadoEm: "desc" }];
}

/** Repositorio de fotos: consultas e gravacoes da tabela Foto, sem regra de negocio. */
export class FotoRepository {
  constructor(private readonly db: Db) {}

  criar(dados: Prisma.FotoUncheckedCreateInput) {
    return this.db.foto.create({ data: dados, include: incluirFoto });
  }

  buscarPorId(id: string) {
    return this.db.foto.findUnique({ where: { id }, include: incluirFoto });
  }

  buscarVarias(ids: string[]) {
    return this.db.foto.findMany({ where: { id: { in: ids } }, include: incluirFoto });
  }

  /** Bloqueia a linha da foto ate o fim da transacao. */
  async bloquear(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT "id" FROM "Foto" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }

  async listar(filtro: FiltroFoto, skip: number, take: number) {
    const where: Prisma.FotoWhereInput = {};
    if (filtro.vitrine) {
      where.status = "publicada";
      where.fotografo = { ativo: true };
    } else if (filtro.status) {
      where.status = filtro.status;
    }
    if (filtro.fotografoId) where.fotografoId = filtro.fotografoId;
    if (filtro.eventoId) where.eventoId = filtro.eventoId;
    if (filtro.tag) where.tags = { has: filtro.tag.toLowerCase() };
    if (filtro.precoMin !== undefined || filtro.precoMax !== undefined) {
      where.precoCentavos = { gte: filtro.precoMin, lte: filtro.precoMax };
    }
    if (filtro.q) {
      where.OR = [
        { titulo: { contains: filtro.q, mode: "insensitive" } },
        { descricao: { contains: filtro.q, mode: "insensitive" } },
        { tags: { has: filtro.q.toLowerCase() } },
        { fotografo: { perfil: { nomeArtistico: { contains: filtro.q, mode: "insensitive" } } } },
        { evento: { titulo: { contains: filtro.q, mode: "insensitive" } } },
      ];
    }
    const [itens, total] = await Promise.all([
      this.db.foto.findMany({ where, orderBy: orderBy(filtro.ordem), skip, take, include: incluirFoto }),
      this.db.foto.count({ where }),
    ]);
    return { itens, total };
  }

  async atualizarComVersao(id: string, versaoEsperada: number, dados: Prisma.FotoUncheckedUpdateManyInput) {
    const r = await this.db.foto.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 }, atualizadoEm: new Date() },
    });
    if (r.count === 0) throw new ErroConflito("A foto foi alterada por outra operacao. Recarregue e tente novamente.");
    return this.db.foto.findUniqueOrThrow({ where: { id }, include: incluirFoto });
  }

  /** Delete definitivo. O banco recusa (FK RESTRICT) se a foto ja foi vendida. */
  excluir(id: string) {
    return this.db.foto.delete({ where: { id } });
  }

  /** Fotos candidatas a destaque da home (vitrine publica) com o numero de vendas pagas de cada uma. */
  async candidatasDestaque(take: number) {
    const fotos = await this.db.foto.findMany({
      where: { status: "publicada", fotografo: { ativo: true } },
      orderBy: { criadoEm: "desc" },
      take,
      include: { ...incluirFoto, _count: { select: { itens: { where: { pedido: { status: "pago" } } } } } },
    });
    return fotos.map(({ _count, ...f }) => ({ foto: f as FotoCompleta, vendas: _count.itens }));
  }

  /** Numeros da vitrine publica (home). */
  async estatisticasVitrine() {
    const [fotos, fotografos, eventos] = await Promise.all([
      this.db.foto.count({ where: { status: "publicada", fotografo: { ativo: true } } }),
      this.db.usuario.count({ where: { papel: "fotografo", ativo: true, fotos: { some: { status: "publicada" } } } }),
      this.db.evento.count({ where: { ativo: true, fotografo: { ativo: true } } }),
    ]);
    return { fotos, fotografos, eventos };
  }

  contarVendas(fotoId: string) {
    return this.db.itemPedido.count({ where: { fotoId } });
  }

  contarPorStatus() {
    return this.db.foto.groupBy({ by: ["status"], _count: { _all: true } });
  }

  /** Tags mais usadas nas fotos da vitrine (para os filtros do front). */
  async tagsPopulares(limite: number): Promise<string[]> {
    const linhas = await this.db.$queryRaw<{ tag: string }[]>`
      SELECT t AS tag FROM "Foto" f, unnest(f."tags") AS t
      WHERE f."status" = 'publicada'
      GROUP BY t ORDER BY count(*) DESC, t ASC LIMIT ${limite}`;
    return linhas.map((l) => l.tag);
  }

  /** Quantas vendas (itens de pedidos pagos) cada foto teve. */
  async vendasPorFoto(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const linhas = await this.db.itemPedido.groupBy({
      by: ["fotoId"],
      where: { fotoId: { in: ids }, pedido: { status: "pago" } },
      _count: { _all: true },
    });
    return new Map(linhas.map((l) => [l.fotoId, l._count._all]));
  }

  /** Foto de capa (a mais recente publicada) de cada evento. */
  async capasDeEventos(eventoIds: string[]): Promise<Map<string, string>> {
    if (eventoIds.length === 0) return new Map();
    const fotos = await this.db.foto.findMany({
      where: { eventoId: { in: eventoIds }, status: "publicada" },
      orderBy: { criadoEm: "desc" },
      distinct: ["eventoId"],
      select: { id: true, eventoId: true },
    });
    return new Map(fotos.map((f) => [f.eventoId as string, f.id]));
  }
}
