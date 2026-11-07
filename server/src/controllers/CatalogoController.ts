// spiderman
import { FastifyReply, FastifyRequest } from "fastify";
import { FotoService } from "../services/FotoService";
import { EventoService } from "../services/EventoService";
import { PerfilService } from "../services/PerfilService";
import { OrdemFoto } from "../repositories/FotoRepository";
import { ErroPermissao } from "../errors";
import { TamanhoPreview, verificarUrlFoto } from "../core/urlAssinada";
import { Pag, lerPaginacao, paginado } from "./util";

/** Vitrine publica (sem login): fotos, eventos e fotografos. Previews sempre com marca d'agua. */
export class CatalogoController {
  constructor(private readonly fotos: FotoService, private readonly eventos: EventoService, private readonly perfis: PerfilService) {}

  listarFotos = async (
    req: FastifyRequest<{ Querystring: Pag & { q?: string; tag?: string; eventoId?: string; fotografoId?: string; ordem?: OrdemFoto; precoMin?: number; precoMax?: number } }>
  ) => {
    const p = lerPaginacao(req.query, 24);
    const { pagina: _p, tamanhoPagina: _t, ...filtro } = req.query;
    return paginado(await this.fotos.listarPublicas(filtro, p), p);
  };

  obterFoto = async (req: FastifyRequest<{ Params: { id: string } }>) => this.fotos.obterPublica(req.params.id);

  destaques = async () => this.fotos.destaquesDaHome();

  tags = async () => ({ tags: await this.fotos.tagsPopulares() });

  /**
   * Entrega de previews. Alem da assinatura (URL com validade), recusa pedidos que o
   * navegador identifica como: abrir a imagem direto numa aba (Sec-Fetch-Dest != image)
   * ou incorpora-la em OUTRO site (Sec-Fetch-Site: cross-site = hotlink).
   * Isso barra o uso casual; quem tem um script ainda pode copiar o preview, que e
   * pequeno e tem a marca d'agua gravada nos pixels.
   */
  private async enviarImagem(
    req: FastifyRequest<{ Params: { id: string }; Querystring: { e?: number; s?: string } }>,
    reply: FastifyReply,
    tamanho: TamanhoPreview
  ) {
    const dest = req.headers["sec-fetch-dest"];
    const site = req.headers["sec-fetch-site"];
    if ((typeof dest === "string" && dest !== "image") || site === "cross-site") {
      throw new ErroPermissao("Imagem disponivel apenas dentro do site.");
    }
    const v = verificarUrlFoto(req.params.id, tamanho, req.query.e, req.query.s);
    if (v !== "ok") throw new ErroPermissao(v === "expirada" ? "Link da imagem expirado. Recarregue a pagina." : "Link da imagem invalido.");
    const buf = await this.fotos.lerPreview(req.params.id, tamanho === "preview" ? "grande" : "mini");
    return reply
      .header("Content-Type", "image/jpeg")
      .header("Cache-Control", "private, max-age=1800")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Robots-Tag", "noindex, noimageindex, noarchive")
      .header("Content-Disposition", 'inline; filename="previa.jpg"')
      .send(buf);
  }

  preview = async (req: FastifyRequest<{ Params: { id: string }; Querystring: { e?: number; s?: string } }>, reply: FastifyReply) =>
    this.enviarImagem(req, reply, "preview");

  miniatura = async (req: FastifyRequest<{ Params: { id: string }; Querystring: { e?: number; s?: string } }>, reply: FastifyReply) =>
    this.enviarImagem(req, reply, "miniatura");

  listarEventos = async (req: FastifyRequest<{ Querystring: Pag & { q?: string } }>) => {
    const p = lerPaginacao(req.query, 12);
    return paginado(await this.eventos.listarPublicos(req.query.q, p), p);
  };

  obterEvento = async (req: FastifyRequest<{ Params: { id: string } }>) => this.eventos.obterPublico(req.params.id);

  listarFotografos = async (req: FastifyRequest<{ Querystring: Pag & { q?: string } }>) => {
    const p = lerPaginacao(req.query, 12);
    return paginado(await this.perfis.listarPublicos(req.query.q, p), p);
  };

  obterFotografo = async (req: FastifyRequest<{ Params: { id: string } }>) => this.perfis.obterPublico(req.params.id);
}
