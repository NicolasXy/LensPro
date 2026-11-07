// spiderman
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Foto } from "./types";

interface CartCtx {
  itens: Foto[];
  total: number;
  tem: (id: string) => boolean;
  adicionar: (f: Foto) => void;
  remover: (id: string) => void;
  limpar: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const CHAVE = "lp_carrinho";

function ler(): Foto[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Carrinho no navegador (so ids e dados de exibicao). Os PRECOS sao sempre reconferidos no servidor ao criar o pedido. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Foto[]>(ler);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch {
      /* sem armazenamento: carrinho vale so nesta aba */
    }
  }, [itens]);

  const adicionar = useCallback((f: Foto) => setItens((a) => (a.some((x) => x.id === f.id) ? a : [...a, f])), []);
  const remover = useCallback((id: string) => setItens((a) => a.filter((x) => x.id !== id)), []);
  const limpar = useCallback(() => setItens([]), []);
  const valor = useMemo<CartCtx>(
    () => ({ itens, total: itens.reduce((s, f) => s + f.precoCentavos, 0), tem: (id) => itens.some((x) => x.id === id), adicionar, remover, limpar }),
    [itens, adicionar, remover, limpar]
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
}
