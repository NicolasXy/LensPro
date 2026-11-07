// spiderman
import * as path from "path";
import sharp from "sharp";
import { ErroValidacao } from "../errors";

/**
 * Processamento de imagens do LensPro: valida o arquivo enviado e gera as
 * versoes PUBLICAS (com marca d'agua) a partir do original.
 *
 * Por que isso protege o fotografo:
 *  - a marca d'agua e GRAVADA nos pixels do preview (nao e um overlay de
 *    CSS que se remove no navegador) e cobre toda a imagem em diagonal, alem
 *    de um logotipo grande no centro, o que torna a remocao automatica inviavel;
 *  - o preview e reduzido (maximo de 1200 px no lado maior) e recomprimido,
 *    entao nao serve para impressao nem uso comercial;
 *  - metadados (EXIF/GPS) sao descartados do preview;
 *  - o original nunca e servido por rota publica: so existe cifrado em disco
 *    e e entregue apenas ao comprador depois do pagamento confirmado.
 */

export const LADO_PREVIEW = 1200;
/** Sobe quando o desenho da marca muda; `npm run previews:regenerar` refaz as fotos ja publicadas. */
export const MARCA_VERSAO = 2;
export const LADO_MINIATURA = 480;
const MIN_LADO = 600; // fotos menores que isso nao tem valor comercial
const MAX_PIXELS = 100_000_000; // protecao contra "decompression bombs"
const FORMATOS_ACEITOS = new Set(["jpeg", "png", "webp"]);

const DIR_ASSETS = path.join(__dirname, "..", "..", "assets");
const ARQ_LADRILHO = path.join(DIR_ASSETS, "marca-ladrilho.png");
const ARQ_LADRILHO2 = path.join(DIR_ASSETS, "marca-ladrilho2.png");
const ARQ_CENTRAL = path.join(DIR_ASSETS, "marca-central.png");

export interface ImagemProcessada {
  largura: number;
  altura: number;
  formato: string;
  preview: Buffer; // JPEG com marca d'agua, ate 1400 px
  miniatura: Buffer; // JPEG com marca d'agua, ate 480 px
}

const escapar = (t: string) => t.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Faixa translucida na base com o credito do fotografo: marca de autoria dificil de recortar sem perder a foto. */
async function faixaDeCredito(largura: number, altura: number, autor?: string): Promise<Buffer> {
  const h = Math.max(30, Math.round(Math.min(largura, altura) * 0.075));
  const nome = escapar((autor ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 60));
  const texto = nome ? `© ${nome} · LensPro · Prévia protegida` : "LensPro · Prévia protegida";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${h}">
    <rect width="${largura}" height="${h}" fill="#000" fill-opacity="0.55"/>
    <text x="${largura / 2}" y="${h * 0.68}" font-family="Poppins, DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${Math.round(h * 0.5)}" font-weight="600" text-anchor="middle" fill="#fff" fill-opacity="0.92">${texto}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Le as dimensoes reais e o formato, decodificando de fato o arquivo (nao confia em extensao nem Content-Type). */
export async function inspecionarImagem(original: Buffer): Promise<{ largura: number; altura: number; formato: string }> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(original, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new ErroValidacao("O arquivo enviado nao e uma imagem valida (aceitos: JPEG, PNG e WebP).");
  }
  if (!meta.format || !FORMATOS_ACEITOS.has(meta.format) || !meta.width || !meta.height) {
    throw new ErroValidacao("Formato de imagem nao aceito. Envie JPEG, PNG ou WebP.");
  }
  // Orientacoes EXIF 5-8 indicam imagem girada em 90 graus: largura e altura se invertem.
  const girada = (meta.orientation ?? 1) >= 5;
  const largura = girada ? meta.height : meta.width;
  const altura = girada ? meta.width : meta.height;
  if (Math.min(largura, altura) < MIN_LADO) {
    throw new ErroValidacao(`A imagem e muito pequena: o menor lado deve ter ao menos ${MIN_LADO} px.`);
  }
  return { largura, altura, formato: meta.format };
}

/** Gera preview e miniatura com marca d'agua a partir do arquivo original. */
export async function gerarVersoesMarcadas(original: Buffer, autor?: string): Promise<ImagemProcessada> {
  const info = await inspecionarImagem(original);

  // 1) Reduz (aplicando a orientacao EXIF) para o tamanho do preview.
  const base = await sharp(original, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: LADO_PREVIEW, height: LADO_PREVIEW, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const w = base.info.width;

  // 2) Prepara as marcas proporcionais ao tamanho da imagem.
  const larguraLadrilho = Math.max(180, Math.min(420, Math.round(w / 3.4)));
  const ladrilho = await sharp(ARQ_LADRILHO).resize({ width: larguraLadrilho }).png().toBuffer();
  const ladrilho2 = await sharp(ARQ_LADRILHO2).resize({ width: Math.max(150, Math.round(larguraLadrilho * 0.8)) }).png().toBuffer();
  const faixa = await faixaDeCredito(w, base.info.height, autor);
  const central = await sharp(ARQ_CENTRAL).resize({ width: Math.round(w * 0.58) }).png().toBuffer();

  // 3) Aplica as marcas e grava como JPEG (sem metadados: EXIF/GPS descartados).
  const preview = await sharp(base.data)
    .composite([
      { input: ladrilho, tile: true, blend: "over" },
      { input: ladrilho2, tile: true, blend: "over" },
      { input: central, gravity: "center", blend: "over" },
      { input: faixa, gravity: "south", blend: "over" },
    ])
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer();

  // 4) A miniatura e derivada do preview JA marcado (a marca acompanha a reducao).
  const miniatura = await sharp(preview)
    .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  return { largura: info.largura, altura: info.altura, formato: info.formato, preview, miniatura };
}
