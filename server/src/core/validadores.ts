// spiderman
import { ErroValidacao } from "../errors";

/**
 * Politica de forca de senha (a mesma do greencode): minimo de 8
 * caracteres, ao menos uma letra maiuscula, uma minuscula e um digito.
 * O limite superior (72 bytes) existe porque o bcrypt ignora o que passar disso.
 */
export function validarForcaSenha(senha: string): void {
  if (typeof senha !== "string" || senha.length < 8) throw new ErroValidacao("A senha deve ter no minimo 8 caracteres.");
  if (Buffer.byteLength(senha, "utf8") > 72) throw new ErroValidacao("A senha deve ter no maximo 72 bytes.");
  if (!/[A-Z]/.test(senha)) throw new ErroValidacao("A senha deve conter ao menos uma letra maiuscula.");
  if (!/[a-z]/.test(senha)) throw new ErroValidacao("A senha deve conter ao menos uma letra minuscula.");
  if (!/[0-9]/.test(senha)) throw new ErroValidacao("A senha deve conter ao menos um numero.");
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza (minusculas, sem espacos nas pontas) e valida um e-mail. */
export function normalizarEmail(email: string): string {
  const e = (email ?? "").trim().toLowerCase();
  if (e.length > 150 || !REGEX_EMAIL.test(e)) throw new ErroValidacao("E-mail invalido.");
  return e;
}

export function validarNome(valor: string, rotulo: string, max = 100): string {
  const v = (valor ?? "").trim().replace(/\s+/g, " ");
  if (v.length < 2) throw new ErroValidacao(`${rotulo} deve ter no minimo 2 caracteres.`);
  if (v.length > max) throw new ErroValidacao(`${rotulo} deve ter no maximo ${max} caracteres.`);
  return v;
}

/** Texto opcional: vazio vira null; excesso de tamanho e erro. */
export function textoOpcional(valor: string | null | undefined, rotulo: string, max: number): string | null {
  if (valor === undefined || valor === null) return null;
  const v = valor.trim();
  if (v === "") return null;
  if (v.length > max) throw new ErroValidacao(`${rotulo} deve ter no maximo ${max} caracteres.`);
  return v;
}

export const PRECO_MIN_CENTAVOS = 100; // R$ 1,00
export const PRECO_MAX_CENTAVOS = 1_000_000; // R$ 10.000,00

export function validarPreco(centavos: number): number {
  if (!Number.isInteger(centavos) || centavos < PRECO_MIN_CENTAVOS || centavos > PRECO_MAX_CENTAVOS) {
    throw new ErroValidacao("O preco deve estar entre R$ 1,00 e R$ 10.000,00 (informado em centavos).");
  }
  return centavos;
}

/** Normaliza as tags: minusculas, sem duplicadas, ate 10 tags de ate 30 caracteres. */
export function normalizarTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const limpas = tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter((t) => t.length > 0);
  for (const t of limpas) if (t.length > 30) throw new ErroValidacao("Cada tag deve ter no maximo 30 caracteres.");
  return Array.from(new Set(limpas)).slice(0, 10);
}

/** Valida data AAAA-MM-DD (data de calendario real, sem hora). */
export function validarDataIso(valor: string, rotulo: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor ?? "")) throw new ErroValidacao(`${rotulo} deve estar no formato AAAA-MM-DD.`);
  const d = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) throw new ErroValidacao(`${rotulo} e uma data invalida.`);
  return d;
}

/** Algoritmo de Luhn: validacao do numero do cartao (so detecta digitacao errada, nao autoriza nada). */
export function luhnValido(numero: string): boolean {
  const d = numero.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let soma = 0;
  let dobrar = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dobrar) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

export function bandeiraDoCartao(numero: string): string {
  const d = numero.replace(/\D/g, "");
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  if (/^(606282|3841)/.test(d)) return "hipercard";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return "elo";
  return "outra";
}

/** Valida um CPF (digitos verificadores) e devolve so os 11 digitos. Lanca ErroValidacao se invalido. */
export function validarCpf(cpf: unknown): string {
  const d = String(cpf ?? "").replace(/\D/g, "");
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d) || dv(d.slice(0, 9)) !== Number(d[9]) || dv(d.slice(0, 10)) !== Number(d[10])) {
    throw new ErroValidacao("CPF invalido.");
  }
  return d;
}
