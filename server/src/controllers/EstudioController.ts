// spiderman
import { FastifyReply, FastifyRequest } from "fastify";
import { DadosEdicaoFoto, FotoService } from "../services/FotoService";
import { DadosEvento, EventoService } from "../services/EventoService";
import { PainelService } from "../services/PainelService";
import { ErroValidacao } from "../errors";
import { Pag, lerPaginacao, paginado } from "./util";

/** Area do fotografo (estudio): publicar fotos, eventos e acompanhar vendas. */
export class EstudioController {
  constructor(private readonly fotos: FotoService, private readonly eventos: EventoService, private readonly painel: PainelService) {}

  /** Upload multipart: campos de texto + 1 arquivo. O limite de tamanho e imposto pelo @fastify/multipart. */
  publicarFoto = async (req: FastifyRequest, reply: FastifyReply) => {
    const campos: Record<string, string> = {};
    let arquivo: Buffer | null = null;
    for await (const parte of req.parts()) {
      if (parte.type === "file") {
        if (arquivo) throw new ErroValidacao("Envie apenas um arquivo por vez.");
        arquivo = await parte.toBuffer(); // lanca 413 se passar do limite
      } else {
        campos[parte.fieldname] = String(parte.value ?? "");
      }
    }
    if (!arquivo) throw new ErroValidacao("Envie o arquivo da foto (campo 'arquivo').");
    const preco = Number(campos.precoCentavos);
    const foto = await this.fotos.publicar(
      req.ator,
      {
        titulo: campos.titulo ?? "",
        descricao: campos.descricao,
        precoCentavos: preco,
        eventoId: campos.eventoId || null,
        tags: (campos.tags ?? "").split(",").filter((t) => t.trim() !== ""),
      },
      arquivo
    );
    return reply.status(201).send(foto);
  };

  listarFotos = async (req: FastifyRequest<{ Querystring: Pag & { status?: "publicada" | "oculta"; q?: string; eventoId?: string } }>) => {
    const p = lerPaginacao(req.query, 24);
    return paginado(await this.fotos.listarDoFotografo(req.ator, { status: req.query.status, q: req.query.q, eventoId: req.query.eventoId }, p), p);
  };

  atualizarFoto = async (req: FastifyRequest<{ Params: { id: string }; Body: DadosEdicaoFoto }>) =>
    this.fotos.atualizar(req.ator, req.params.id, req.body);

  excluirFoto = async (req: FastifyRequest<{ Params: { id: string } }>) => ({ modo: await this.fotos.excluir(req.ator, req.params.id) });

  resumo = async (req: FastifyRequest) => this.painel.resumoEstudio(req.ator);

  vendas = async (req: FastifyRequest<{ Querystring: Pag }>) => {
    const p = lerPaginacao(req.query);
    return paginado(await this.painel.listarVendas(req.ator, p), p);
  };

  listarEventos = async (req: FastifyRequest<{ Querystring: Pag }>) => {
    const p = lerPaginacao(req.query, 50);
    return paginado(await this.eventos.listarDoFotografo(req.ator, p), p);
  };

  criarEvento = async (req: FastifyRequest<{ Body: DadosEvento & { titulo: string; dataEvento: string } }>, reply: FastifyReply) =>
    reply.status(201).send(await this.eventos.criar(req.ator, req.body));

  atualizarEvento = async (req: FastifyRequest<{ Params: { id: string }; Body: DadosEvento }>) =>
    this.eventos.atualizar(req.ator, req.params.id, req.body);

  excluirEvento = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await this.eventos.excluir(req.ator, req.params.id);
    return reply.status(204).send();
  };
}
