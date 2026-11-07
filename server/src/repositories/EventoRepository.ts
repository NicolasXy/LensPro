// spiderman
import { Db, Prisma } from "../db/prisma";
import { ErroConflito } from "../errors";

const incluirEvento = {
  fotografo: { select: { id: true, nome: true, sobrenome: true, perfil: { select: { nomeArtistico: true } } } },
  _count: { select: { fotos: { where: { status: "publicada" as const } } } },
} satisfies Prisma.EventoInclude;

export type EventoCompleto = Prisma.EventoGetPayload<{ include: typeof incluirEvento }>;

/** Repositorio de eventos (coberturas) dos fotografos. */
export class EventoRepository {
  constructor(private readonly db: Db) {}

  criar(dados: Prisma.EventoUncheckedCreateInput) {
    return this.db.evento.create({ data: dados, include: incluirEvento });
  }

  buscarPorId(id: string) {
    return this.db.evento.findUnique({ where: { id }, include: incluirEvento });
  }

  async listar(filtro: { fotografoId?: string; publico?: boolean; q?: string }, skip: number, take: number) {
    const where: Prisma.EventoWhereInput = {};
    if (filtro.fotografoId) where.fotografoId = filtro.fotografoId;
    if (filtro.publico) {
      where.ativo = true;
      where.fotografo = { ativo: true };
    }
    if (filtro.q) {
      where.OR = [
        { titulo: { contains: filtro.q, mode: "insensitive" } },
        { local: { contains: filtro.q, mode: "insensitive" } },
        { descricao: { contains: filtro.q, mode: "insensitive" } },
      ];
    }
    const [itens, total] = await Promise.all([
      this.db.evento.findMany({ where, orderBy: { dataEvento: "desc" }, skip, take, include: incluirEvento }),
      this.db.evento.count({ where }),
    ]);
    return { itens, total };
  }

  async atualizarComVersao(id: string, versaoEsperada: number, dados: Prisma.EventoUncheckedUpdateManyInput) {
    const r = await this.db.evento.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 }, atualizadoEm: new Date() },
    });
    if (r.count === 0) throw new ErroConflito("O evento foi alterado por outra operacao. Recarregue e tente novamente.");
    return this.db.evento.findUniqueOrThrow({ where: { id }, include: incluirEvento });
  }

  /** As fotos do evento NAO sao apagadas: a FK usa ON DELETE SET NULL. */
  excluir(id: string) {
    return this.db.evento.delete({ where: { id } });
  }
}
