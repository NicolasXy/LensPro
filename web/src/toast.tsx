// spiderman
import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type Tipo = "ok" | "erro";
interface Toast {
  id: number;
  tipo: Tipo;
  texto: string;
}
const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Toast[]>([]);
  const avisar = useCallback((texto: string, tipo: Tipo = "ok") => {
    const id = Date.now() + Math.random();
    setItens((a) => [...a, { id, tipo, texto }]);
    setTimeout(() => setItens((a) => a.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {itens.map((t) => (
          <div key={t.id} className={"toast toast-" + t.tipo}>
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
