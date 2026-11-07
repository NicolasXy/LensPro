// spiderman
export const brl = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBr = (iso: string) => {
  // Datas de calendario (AAAA-MM-DD) nao devem sofrer deslocamento de fuso.
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR");
};

export const dataHoraBr = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const tamanhoArquivo = (bytes: number) => (bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.round(bytes / 1024) + " KB");

/** "12,50" ou "12.5" -> 1250 centavos (NaN se invalido). */
export function reaisParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return NaN;
  return Math.round(parseFloat(limpo) * 100);
}

export const centavosParaReais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
