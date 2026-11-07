// spiderman
import { Db } from "../db/prisma";

/** Mensagens enviadas pelo formulario de contato. */
export class ContatoRepository {
  constructor(private readonly db: Db) {}

  criar(dados: { nome: string; email: string; mensagem: string }) {
    return this.db.mensagemContato.create({ data: dados });
  }

  async listar(skip: number, take: number) {
    const [itens, total] = await Promise.all([
      this.db.mensagemContato.findMany({ orderBy: { criadoEm: "desc" }, skip, take }),
      this.db.mensagemContato.count(),
    ]);
    return { itens, total };
  }
}
