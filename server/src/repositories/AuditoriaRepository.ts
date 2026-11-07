// spiderman
import { Db, Prisma } from "../db/prisma";

/** Repositorio da trilha de auditoria (somente INSERT; o banco bloqueia UPDATE/DELETE). */
export class AuditoriaRepository {
  constructor(private readonly db: Db) {}

  registrar(usuarioId: string | null, acao: string, detalhes: Prisma.InputJsonValue = {}) {
    return this.db.auditoria.create({ data: { usuarioId, acao, detalhes } });
  }

  async listar(filtro: { acao?: string; usuarioId?: string }, skip: number, take: number) {
    const where: Prisma.AuditoriaWhereInput = {};
    if (filtro.acao) where.acao = filtro.acao;
    if (filtro.usuarioId) where.usuarioId = filtro.usuarioId;
    const [itens, total] = await Promise.all([
      this.db.auditoria.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take,
        include: { usuario: { select: { email: true, nome: true, sobrenome: true } } },
      }),
      this.db.auditoria.count({ where }),
    ]);
    return { itens, total };
  }
}
