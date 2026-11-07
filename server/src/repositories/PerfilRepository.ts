// spiderman
import { Db, Prisma } from "../db/prisma";
import { ErroConflito } from "../errors";

/** Repositorio do perfil publico do fotografo (tabela PerfilFotografo). */
export class PerfilRepository {
  constructor(private readonly db: Db) {}

  criar(dados: Prisma.PerfilFotografoUncheckedCreateInput) {
    return this.db.perfilFotografo.create({ data: dados });
  }

  buscar(usuarioId: string) {
    return this.db.perfilFotografo.findUnique({ where: { usuarioId } });
  }

  async atualizarComVersao(usuarioId: string, versaoEsperada: number, dados: Prisma.PerfilFotografoUpdateManyMutationInput) {
    const r = await this.db.perfilFotografo.updateMany({
      where: { usuarioId, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 }, atualizadoEm: new Date() },
    });
    if (r.count === 0) throw new ErroConflito("O perfil foi alterado por outra operacao. Recarregue e tente novamente.");
    return this.db.perfilFotografo.findUniqueOrThrow({ where: { usuarioId } });
  }

  /** Fotografos ativos para a vitrine publica, com a contagem de fotos publicadas. */
  async listarPublicos(q: string | undefined, skip: number, take: number) {
    const where: Prisma.PerfilFotografoWhereInput = { usuario: { ativo: true, papel: "fotografo" } };
    if (q) {
      where.OR = [
        { nomeArtistico: { contains: q, mode: "insensitive" } },
        { cidade: { contains: q, mode: "insensitive" } },
        { especialidade: { contains: q, mode: "insensitive" } },
      ];
    }
    const [itens, total] = await Promise.all([
      this.db.perfilFotografo.findMany({
        where,
        orderBy: { nomeArtistico: "asc" },
        skip,
        take,
        include: { usuario: { select: { id: true, _count: { select: { fotos: { where: { status: "publicada" } } } } } } },
      }),
      this.db.perfilFotografo.count({ where }),
    ]);
    return { itens, total };
  }

  buscarPublico(usuarioId: string) {
    return this.db.perfilFotografo.findFirst({
      where: { usuarioId, usuario: { ativo: true, papel: "fotografo" } },
      include: { usuario: { select: { id: true, _count: { select: { fotos: { where: { status: "publicada" } } } } } } },
    });
  }
}
