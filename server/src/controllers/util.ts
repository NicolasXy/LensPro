// spiderman
import { Paginacao } from "../services/tipos";

/** Fatia a paginacao pedida na query string com valores padrao e limites. */
export function lerPaginacao(q: { pagina?: number; tamanhoPagina?: number }, tamanhoPadrao = 20): Paginacao {
  const tamanho = Math.min(Math.max(q.tamanhoPagina ?? tamanhoPadrao, 1), 100);
  return { pagina: Math.max(q.pagina ?? 1, 1), tamanhoPagina: tamanho };
}

export function paginado<T>(r: { itens: T[]; total: number }, p: Paginacao) {
  return {
    itens: r.itens,
    total: r.total,
    pagina: p.pagina,
    tamanhoPagina: p.tamanhoPagina,
    totalPaginas: Math.max(1, Math.ceil(r.total / p.tamanhoPagina)),
  };
}

export const schemaPaginacao = {
  pagina: { type: "integer", minimum: 1, default: 1 },
  tamanhoPagina: { type: "integer", minimum: 1, maximum: 100, default: 20 },
} as const;

export const schemaId = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export type Pag = { pagina?: number; tamanhoPagina?: number };
