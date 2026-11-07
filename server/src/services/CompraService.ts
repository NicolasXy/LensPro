// spiderman
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { Armazenamento } from "../core/armazenamento";
import { sha256Hex } from "../core/crypto";
import { ErroNaoEncontrado } from "../errors";
import { Ator, FotoPublica, Paginacao, Pagina, fotoPublica, paraSkipTake } from "./tipos";

export interface CompraDto {
  itemId: string;
  pedidoId: string;
  pagoEm: Date | null;
  precoCentavos: number;
  downloads: number;
  foto: FotoPublica;
}

export interface ArquivoParaDownload {
  conteudo: Buffer;
  nomeArquivo: string;
  mime: string;
}

const MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function slug(texto: string): string {
  const s = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 60) || "foto";
}

/**
 * Biblioteca do comprador e entrega dos ORIGINAIS. Este e o unico caminho
 * que decifra um original: exige pedido PAGO do proprio usuario, confere o
 * SHA-256 gravado na publicacao (integridade) e registra o download na auditoria.
 */
export class CompraService {
  constructor(private readonly uow: UnidadeDeTrabalho, private readonly arquivos: Armazenamento) {}

  async listar(ator: Ator, pag: Paginacao): Promise<Pagina<CompraDto>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().pedidos.listarCompras(ator.id, skip, take);
    return {
      total: r.total,
      itens: r.itens.map((i) => ({
        itemId: i.id,
        pedidoId: i.pedido.id,
        pagoEm: i.pedido.pagoEm,
        precoCentavos: i.precoCentavos,
        downloads: i.downloads,
        foto: fotoPublica(i.foto),
      })),
    };
  }

  async baixar(ator: Ator, itemId: string): Promise<ArquivoParaDownload> {
    const r = this.uow.simples();
    const item = await r.pedidos.buscarItem(itemId);
    // 404 (e nao 403) tanto para item inexistente quanto de outro comprador: nao revela o que existe.
    if (!item || item.pedido.compradorId !== ator.id || item.pedido.status !== "pago") {
      throw new ErroNaoEncontrado("Compra nao encontrada.");
    }
    // Decifra com AES-256-GCM: arquivo adulterado/corrompido lanca erro aqui.
    const conteudo = await this.arquivos.lerOriginal(item.fotoId);
    if (sha256Hex(conteudo) !== item.foto.sha256Original) throw new Error("Falha de integridade no arquivo original.");
    await r.pedidos.registrarDownload(itemId);
    await r.auditoria.registrar(ator.id, "DOWNLOAD_ORIGINAL", { itemId, fotoId: item.fotoId });
    return {
      conteudo,
      nomeArquivo: `${slug(item.foto.titulo)}-${item.fotoId.slice(0, 8)}.${item.foto.formato === "jpeg" ? "jpg" : item.foto.formato}`,
      mime: MIME[item.foto.formato] ?? "application/octet-stream",
    };
  }
}
