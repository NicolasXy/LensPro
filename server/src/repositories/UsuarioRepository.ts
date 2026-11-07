// spiderman
import { Db, Prisma } from "../db/prisma";
import { Papel } from "../generated/prisma/enums";
import { ErroConflito } from "../errors";

/**
 * Repositorio de usuarios: unica camada que conversa com a tabela Usuario.
 * Nao contem regra de negocio (ela fica em AuthService); apenas consultas
 * e gravacoes, incluindo o controle de versao otimista.
 */
export class UsuarioRepository {
  constructor(private readonly db: Db) {}


  buscarPorId(id: string) {
    return this.db.usuario.findUnique({ where: { id }, include: { perfil: true } });
  }

  buscarPorEmail(email: string) {
    return this.db.usuario.findUnique({ where: { email } });
  }

  buscarPorResetHash(resetTokenHash: string) {
    return this.db.usuario.findUnique({ where: { resetTokenHash } });
  }

  /** Bloqueia a linha do usuario ate o fim da transacao (serializa operacoes concorrentes do mesmo usuario). */
  async bloquear(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }

  async listar(filtro: { papel?: Papel; q?: string }, skip: number, take: number) {
    const where: Prisma.UsuarioWhereInput = {};
    if (filtro.papel) where.papel = filtro.papel;
    if (filtro.q) {
      where.OR = [
        { nome: { contains: filtro.q, mode: "insensitive" } },
        { sobrenome: { contains: filtro.q, mode: "insensitive" } },
        { email: { contains: filtro.q, mode: "insensitive" } },
      ];
    }
    const [itens, total] = await Promise.all([
      this.db.usuario.findMany({ where, orderBy: { criadoEm: "desc" }, skip, take }),
      this.db.usuario.count({ where }),
    ]);
    return { itens, total };
  }

  contarPorPapel() {
    return this.db.usuario.groupBy({ by: ["papel"], _count: { _all: true } });
  }

  criar(dados: { nome: string; sobrenome: string; email: string; senhaHash: string; papel: Papel }) {
    return this.db.usuario.create({ data: dados });
  }

  /**
   * Atualizacao com versionamento otimista: o UPDATE so afeta a linha se a
   * versao ainda for a esperada (WHERE id = ? AND versao = ?). Se outra
   * requisicao alterou o registro antes, `count` retorna 0 e sinalizamos
   * conflito (HTTP 409) em vez de sobrescrever silenciosamente.
   */
  async atualizarComVersao(id: string, versaoEsperada: number, dados: Prisma.UsuarioUpdateManyMutationInput) {
    const r = await this.db.usuario.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 }, atualizadoEm: new Date() },
    });
    if (r.count === 0) {
      throw new ErroConflito("O usuario foi alterado por outra operacao. Recarregue e tente novamente.");
    }
    return this.db.usuario.findUniqueOrThrow({ where: { id }, include: { perfil: true } });
  }

  /** Registra uma falha de login; ao atingir o limite, bloqueia a conta temporariamente e zera o contador. */
  async registrarFalhaLogin(id: string, maxFalhas: number, bloqueioMin: number): Promise<boolean> {
    const u = await this.db.usuario.update({ where: { id }, data: { tentativasFalhas: { increment: 1 } } });
    if (u.tentativasFalhas >= maxFalhas) {
      await this.db.usuario.update({
        where: { id },
        data: { tentativasFalhas: 0, bloqueadoAte: new Date(Date.now() + bloqueioMin * 60_000) },
      });
      return true;
    }
    return false;
  }

  zerarFalhasLogin(id: string) {
    return this.db.usuario.update({ where: { id }, data: { tentativasFalhas: 0, bloqueadoAte: null } });
  }

  definirResetToken(id: string, resetTokenHash: string, resetExpiraEm: Date) {
    return this.db.usuario.update({ where: { id }, data: { resetTokenHash, resetExpiraEm } });
  }

  /** Troca a senha, invalida o token de recuperacao e libera bloqueios (uso unico do token). */
  definirSenha(id: string, senhaHash: string) {
    return this.db.usuario.update({
      where: { id },
      data: { senhaHash, resetTokenHash: null, resetExpiraEm: null, tentativasFalhas: 0, bloqueadoAte: null, versao: { increment: 1 }, atualizadoEm: new Date() },
    });
  }
}
