// spiderman
import * as fs from "fs";
import * as path from "path";
import { gerarChaveDados } from "./crypto";

/**
 * Carrega (ou cria) a chave mestra AES-256 usada para cifrar os originais das
 * fotos e os campos sensiveis. Ordem de precedencia:
 *  1. variavel ENCRYPTION_KEY (64 hex): recomendado em producao, injetada por
 *     um cofre de segredos / variavel do orquestrador;
 *  2. arquivo <DATA_DIR>/master.key (criado na primeira execucao com
 *     permissoes 600 em POSIX), no mesmo espirito do master.config.json do
 *     greencode.
 *
 * ATENCAO: perder a chave significa perder o acesso aos originais cifrados.
 * Faca backup da chave SEPARADO dos backups dos dados (ver docs/SECURITY.md).
 */
export function carregarChaveMestra(diretorioDados: string, chaveHex: string): Buffer {
  if (chaveHex) return Buffer.from(chaveHex, "hex");

  fs.mkdirSync(diretorioDados, { recursive: true });
  const caminho = path.join(diretorioDados, "master.key");
  if (fs.existsSync(caminho)) {
    const hex = fs.readFileSync(caminho, "utf8").trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`Arquivo de chave invalido: ${caminho}`);
    return Buffer.from(hex, "hex");
  }
  const chave = gerarChaveDados();
  // flag "wx" falha se o arquivo ja existir (evita sobrescrever a chave por corrida entre processos).
  fs.writeFileSync(caminho, chave.toString("hex"), { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    fs.chmodSync(caminho, 0o600);
  } catch {
    // No Windows o chmod tem efeito limitado; restrinja a ACL da pasta data/ (docs/SECURITY.md).
  }
  return chave;
}
