// spiderman
import * as fs from "fs";
import * as path from "path";
import { cifrarBuffer, decifrarBuffer } from "./crypto";

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Armazenamento de arquivos de fotos em disco (em producao, o mesmo contrato
 * pode ser implementado sobre S3/GCS; ver docs/API.md):
 *
 *   <DATA_DIR>/originais/<id>.enc  -> ORIGINAL cifrado com AES-256-GCM (privado)
 *   <DATA_DIR>/previews/<id>.jpg   -> preview com marca d'agua (publico)
 *   <DATA_DIR>/previews/<id>.mini.jpg
 *
 * Todas as gravacoes sao ATOMICAS (arquivo temporario + rename), como no
 * storage.ts do greencode: uma queda no meio da escrita nunca deixa um
 * arquivo pela metade. O id e sempre validado como UUID antes de virar
 * caminho, o que impede path traversal ("../").
 */
export class Armazenamento {
  private readonly dirOriginais: string;
  private readonly dirPreviews: string;

  constructor(diretorioDados: string, private readonly chave: Buffer) {
    this.dirOriginais = path.join(diretorioDados, "originais");
    this.dirPreviews = path.join(diretorioDados, "previews");
    fs.mkdirSync(this.dirOriginais, { recursive: true });
    fs.mkdirSync(this.dirPreviews, { recursive: true });
  }

  private caminho(dir: string, id: string, sufixo: string): string {
    if (!REGEX_UUID.test(id)) throw new Error("Identificador de arquivo invalido.");
    return path.join(dir, id + sufixo);
  }

  private async gravarAtomico(destino: string, dados: Buffer): Promise<void> {
    const tmp = `${destino}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, dados, { mode: 0o600 });
    await fs.promises.rename(tmp, destino);
  }

  async salvarOriginal(id: string, original: Buffer): Promise<void> {
    await this.gravarAtomico(this.caminho(this.dirOriginais, id, ".enc"), cifrarBuffer(this.chave, original));
  }

  /** Decifra o original. Lanca erro se o arquivo foi adulterado (auth tag do GCM). */
  async lerOriginal(id: string): Promise<Buffer> {
    const bruto = await fs.promises.readFile(this.caminho(this.dirOriginais, id, ".enc"));
    return decifrarBuffer(this.chave, bruto);
  }

  async salvarPreviews(id: string, preview: Buffer, miniatura: Buffer): Promise<void> {
    await this.gravarAtomico(this.caminho(this.dirPreviews, id, ".jpg"), preview);
    await this.gravarAtomico(this.caminho(this.dirPreviews, id, ".mini.jpg"), miniatura);
  }

  async lerPreview(id: string, tamanho: "grande" | "mini"): Promise<Buffer | null> {
    try {
      return await fs.promises.readFile(this.caminho(this.dirPreviews, id, tamanho === "mini" ? ".mini.jpg" : ".jpg"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  /** Remove todos os arquivos de uma foto (usado ao descartar um upload que falhou). */
  async remover(id: string): Promise<void> {
    const alvos = [
      this.caminho(this.dirOriginais, id, ".enc"),
      this.caminho(this.dirPreviews, id, ".jpg"),
      this.caminho(this.dirPreviews, id, ".mini.jpg"),
    ];
    await Promise.all(alvos.map((a) => fs.promises.rm(a, { force: true })));
  }
}
