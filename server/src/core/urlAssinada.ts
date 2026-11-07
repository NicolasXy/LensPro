// spiderman
import { createHmac, createHash } from "crypto";
import { iguaisEmTempoConstante } from "./crypto";

/**
 * URLs assinadas e com validade para os previews. Sem a assinatura valida
 * (HMAC-SHA256 de "id|tamanho|expiracao") o servidor nao entrega a imagem, entao:
 *  - nao da para "adivinhar" ou varrer URLs de fotos pelo id;
 *  - um link copiado deixa de funcionar quando expira (algumas horas);
 *  - o tempo de expiracao e arredondado para a hora seguinte, de modo que a URL de
 *    uma foto e a mesma durante a hora (o cache do navegador continua funcionando).
 * A chave e derivada do JWT_SECRET, em dominio separado do dos tokens.
 */
export type TamanhoPreview = "preview" | "miniatura";

const BUCKET_S = 3600;
const VALIDADE_S = 4 * 3600;

export class AssinadorUrls {
  private readonly chave: Buffer;

  constructor(segredo: string, private readonly agora: () => number = () => Date.now()) {
    this.chave = createHash("sha256").update("lenspro|previews|" + segredo).digest();
  }

  private mac(id: string, tamanho: TamanhoPreview, exp: number): string {
    return createHmac("sha256", this.chave).update(`${id}|${tamanho}|${exp}`).digest("base64url");
  }

  /** Caminho completo (com ?e=&s=) do preview ou da miniatura de uma foto. */
  assinar(id: string, tamanho: TamanhoPreview): string {
    const exp = (Math.ceil(this.agora() / 1000 / BUCKET_S) * BUCKET_S) + VALIDADE_S;
    return `/api/v1/fotos/${id}/${tamanho}?e=${exp}&s=${this.mac(id, tamanho, exp)}`;
  }

  verificar(id: string, tamanho: TamanhoPreview, e: unknown, s: unknown): "ok" | "expirada" | "invalida" {
    const exp = Number(e);
    if (!Number.isInteger(exp) || typeof s !== "string" || s.length !== 43) return "invalida";
    if (!iguaisEmTempoConstante(this.mac(id, tamanho, exp), s)) return "invalida";
    return exp * 1000 < this.agora() ? "expirada" : "ok";
  }
}

let atual: AssinadorUrls | null = null;

/** Chamado uma vez na montagem do app (todas as respostas de foto passam por `urlsDaFoto`). */
export function configurarAssinadorUrls(a: AssinadorUrls): void {
  atual = a;
}

export function urlsDaFoto(id: string): { urlPreview: string; urlMiniatura: string } {
  if (!atual) throw new Error("Assinador de URLs nao configurado.");
  return { urlPreview: atual.assinar(id, "preview"), urlMiniatura: atual.assinar(id, "miniatura") };
}

export function verificarUrlFoto(id: string, tamanho: TamanhoPreview, e: unknown, s: unknown): "ok" | "expirada" | "invalida" {
  if (!atual) throw new Error("Assinador de URLs nao configurado.");
  return atual.verificar(id, tamanho, e, s);
}
