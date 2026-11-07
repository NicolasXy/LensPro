// spiderman
import * as crypto from "crypto";

/**
 * Modulo de criptografia do LensPro (evolucao do crypto.ts do greencode).
 *
 * Responsabilidades:
 *  - Cifrar/decifrar dados em repouso com AES-256-GCM: os ARQUIVOS ORIGINAIS
 *    das fotos (sem marca d'agua) e campos sensiveis do banco (chave Pix).
 *  - Gerar tokens aleatorios e seus hashes (recuperacao de senha).
 *  - Assinar/verificar webhooks (HMAC-SHA256) com comparacao em tempo constante.
 *
 * Nenhuma outra parte do sistema chama diretamente `crypto` para esses fins:
 * isso permite auditar e trocar algoritmos em um unico lugar.
 *
 * Diferenca em relacao ao greencode: la o hash de senha era SHA-256 iterado
 * (exigencia da AV1). Aqui as senhas usam bcrypt (ver AuthService), que e a
 * escolha adequada para senhas, como ja ocorria na API da AV2.
 */

// Algoritmo AUTENTICADO: alem de confidencialidade, detecta adulteracao.
const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96 bits, tamanho recomendado para GCM
const TAG_LEN = 16;
// Cabecalho dos arquivos cifrados: identifica o formato e permite migracoes futuras.
const MAGIC = Buffer.from("LPE1", "ascii");

function validarChave(chave: Buffer): void {
  if (chave.length !== 32) throw new Error("Chave de criptografia invalida: esperado 32 bytes (AES-256).");
}

/** Gera uma chave de dados aleatoria de 256 bits. */
export function gerarChaveDados(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Cifra um Buffer (ex.: arquivo de imagem). Formato do resultado:
 * "LPE1" | IV (12) | auth tag (16) | texto cifrado. Um IV novo e gerado a
 * CADA chamada: reutilizar (chave, IV) em GCM quebraria a confidencialidade.
 */
export function cifrarBuffer(chave: Buffer, dados: Buffer): Buffer {
  validarChave(chave);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, chave, iv);
  const enc = Buffer.concat([cipher.update(dados), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

/** Decifra o resultado de cifrarBuffer. Lanca erro se o arquivo foi adulterado, truncado ou a chave esta errada. */
export function decifrarBuffer(chave: Buffer, pacote: Buffer): Buffer {
  validarChave(chave);
  if (pacote.length < MAGIC.length + IV_LEN + TAG_LEN || !pacote.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Arquivo cifrado em formato invalido.");
  }
  const iv = pacote.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = pacote.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const enc = pacote.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, chave, iv);
  decipher.setAuthTag(tag);
  // final() e quem verifica a auth tag: se algo mudou, lanca excecao aqui.
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

/** Cifra um texto para guardar em coluna do banco: "v1.<iv>.<tag>.<dados>" (base64url). */
export function cifrarTexto(chave: Buffer, texto: string): string {
  const bin = cifrarBuffer(chave, Buffer.from(texto, "utf8"));
  const iv = bin.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = bin.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const dados = bin.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrarTexto(chave: Buffer, valor: string): string {
  const partes = valor.split(".");
  if (partes.length !== 4 || partes[0] !== "v1") throw new Error("Campo cifrado em formato invalido.");
  const bin = Buffer.concat([
    MAGIC,
    Buffer.from(partes[1], "base64url"),
    Buffer.from(partes[2], "base64url"),
    Buffer.from(partes[3], "base64url"),
  ]);
  return decifrarBuffer(chave, bin).toString("utf8");
}

/** SHA-256 em hexadecimal (checksums de integridade e hash de tokens de uso unico). */
export function sha256Hex(dado: Buffer | string): string {
  return crypto.createHash("sha256").update(dado).digest("hex");
}

/** Token aleatorio (256 bits) em base64url, seguro para uso em links. */
export function gerarToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Comparacao em tempo constante (evita ataques de timing) para strings de qualquer tamanho. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Assinatura HMAC-SHA256 (hex) usada nos webhooks do gateway de pagamento. */
export function assinarHmac(segredo: string, corpo: string): string {
  return crypto.createHmac("sha256", segredo).update(corpo).digest("hex");
}

export function verificarHmac(segredo: string, corpo: string, assinaturaHex: string): boolean {
  return iguaisEmTempoConstante(assinarHmac(segredo, corpo), (assinaturaHex ?? "").toLowerCase());
}
