// spiderman
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { normalizarEmail, validarNome } from "../core/validadores";
import { ErroValidacao } from "../errors";
import { Paginacao, Pagina, paraSkipTake } from "./tipos";

/** Formulario "Fale conosco" e consulta das mensagens pelo admin. */
export class ContatoService {
  constructor(private readonly uow: UnidadeDeTrabalho) {}

  async enviar(d: { nome: string; email: string; mensagem: string }): Promise<void> {
    const nome = validarNome(d.nome, "Nome");
    const email = normalizarEmail(d.email);
    const mensagem = (d.mensagem ?? "").trim();
    if (mensagem.length < 10) throw new ErroValidacao("A mensagem deve ter no minimo 10 caracteres.");
    if (mensagem.length > 3000) throw new ErroValidacao("A mensagem deve ter no maximo 3000 caracteres.");
    await this.uow.simples().contatos.criar({ nome, email, mensagem });
  }

  async listar(pag: Paginacao): Promise<Pagina<{ id: string; nome: string; email: string; mensagem: string; criadoEm: Date }>> {
    const { skip, take } = paraSkipTake(pag);
    return this.uow.simples().contatos.listar(skip, take);
  }
}

/** Trilha de auditoria (leitura pelo admin). */
export class AuditoriaService {
  constructor(private readonly uow: UnidadeDeTrabalho) {}

  async listar(filtro: { acao?: string; usuarioId?: string }, pag: Paginacao) {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().auditoria.listar(filtro, skip, take);
    return {
      total: r.total,
      itens: r.itens.map((a) => ({
        id: a.id.toString(),
        acao: a.acao,
        detalhes: a.detalhes,
        criadoEm: a.criadoEm,
        usuario: a.usuario ? { email: a.usuario.email, nome: `${a.usuario.nome} ${a.usuario.sobrenome}` } : null,
      })),
    };
  }
}
