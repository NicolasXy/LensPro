// spiderman
const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, public erro: string, message: string) {
    super(message);
  }
}

let aoExpirar: (() => void) | null = null;
/** Ha sessao ativa (o token em si fica num cookie HttpOnly: o JavaScript da pagina nunca o ve). */
let temSessao = false;

export function marcarSessao(ativa: boolean) {
  temSessao = ativa;
}
export function aoSessaoInvalida(fn: () => void) {
  aoExpirar = fn;
}

/**
 * Cabecalho exigido pelo servidor em toda escrita feita com o cookie de sessao (protecao CSRF):
 * um site de terceiros nao consegue envia-lo, pois o CORS da API e fechado.
 */
const CSRF = { "X-Lenspro-Csrf": "1" };

type Query = Record<string, string | number | boolean | undefined | null>;

function montarUrl(caminho: string, query?: Query) {
  const qs = new URLSearchParams();
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return BASE + caminho + (s ? "?" + s : "");
}

async function tratar(res: Response, autenticada: boolean): Promise<Response> {
  if (res.ok) return res;
  let corpo: { erro?: string; mensagem?: string } = {};
  try {
    corpo = await res.json();
  } catch {
    /* sem corpo JSON */
  }
  // Token expirado/revogado: derruba a sessao (mas nao em login, onde 401 = senha errada).
  if (res.status === 401 && autenticada && temSessao) aoExpirar?.();
  throw new ApiError(res.status, corpo.erro ?? "Erro", corpo.mensagem ?? "Nao foi possivel concluir a operacao.");
}

export async function api<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; form?: FormData; query?: Query; semAuth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...CSRF };
  let body: BodyInit | undefined;
  if (opcoes.form) body = opcoes.form;
  else if (opcoes.corpo !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opcoes.corpo);
  }
  let res: Response;
  try {
    res = await fetch(montarUrl(caminho, opcoes.query), { method: opcoes.metodo ?? (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, "Rede", "Sem conexao com o servidor. Verifique sua internet.");
  }
  await tratar(res, !opcoes.semAuth);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Baixa um arquivo protegido (via fetch com o cookie de sessao; o arquivo chega como blob e e salvo pelo navegador). */
export async function baixarArquivo(caminho: string): Promise<void> {
  const res = await tratar(await fetch(BASE + caminho, { headers: CSRF }), true);
  const cd = res.headers.get("Content-Disposition") ?? "";
  const nome = /filename="([^"]+)"/.exec(cd)?.[1] ?? "foto.jpg";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const mensagemDeErro = (e: unknown) => (e instanceof ApiError ? e.message : "Ocorreu um erro inesperado.");
