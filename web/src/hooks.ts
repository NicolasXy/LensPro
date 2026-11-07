// spiderman
import { DependencyList, useCallback, useEffect, useState } from "react";
import { mensagemDeErro } from "./api";

/** Carrega dados da API e expoe estado de carregamento/erro e um `recarregar`. */
export function useDados<T>(carregar: () => Promise<T>, deps: DependencyList) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executar = useCallback(carregar, deps);

  const recarregar = useCallback(() => {
    let ativo = true;
    setCarregando(true);
    executar()
      .then((d) => ativo && (setDados(d), setErro(null)))
      .catch((e) => ativo && setErro(mensagemDeErro(e)))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [executar]);

  useEffect(() => recarregar(), [recarregar]);
  return { dados, erro, carregando, recarregar, setDados };
}

export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = titulo + " — LensPro";
  }, [titulo]);
}
