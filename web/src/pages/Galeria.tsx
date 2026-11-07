// spiderman
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useDados, useTitulo } from "../hooks";
import { Foto, Pagina } from "../types";
import { Erro, FotoCard, Paginacao, Skeletons, Vazio } from "../components/ui";
import BotaoCarrinho from "../components/BotaoCarrinho";

export default function Galeria() {
  useTitulo("Galeria");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const ordem = params.get("ordem") ?? "recentes";
  const pagina = Number(params.get("pagina") ?? 1);
  const [busca, setBusca] = useState(q);

  const tags = useDados(() => api<{ tags: string[] }>("/fotos/tags", { semAuth: true }), []);
  const fotos = useDados(
    () => api<Pagina<Foto>>("/fotos", { query: { q, tag, ordem, pagina, tamanhoPagina: 24 }, semAuth: true }),
    [q, tag, ordem, pagina]
  );

  const mudar = (novo: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novo)) v ? p.set(k, v) : p.delete(k);
    if (!("pagina" in novo)) p.delete("pagina");
    setParams(p);
  };

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <h1>Galeria</h1>
          <p>Explore as fotos publicadas na plataforma. As imagens exibidas têm marca d'água; a versão original é entregue após a compra.</p>
        </div>

        <form className="filtros" onSubmit={(e) => { e.preventDefault(); mudar({ q: busca.trim() }); }} role="search">
          <input className="input busca" type="search" placeholder="Buscar por título, tag, evento ou fotógrafo…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar fotos" />
          <select className="select" value={ordem} onChange={(e) => mudar({ ordem: e.target.value })} aria-label="Ordenar">
            <option value="recentes">Mais recentes</option>
            <option value="preco_asc">Menor preço</option>
            <option value="preco_desc">Maior preço</option>
          </select>
          <button className="btn btn-sm">Buscar</button>
        </form>

        {tags.dados && tags.dados.tags.length > 0 && (
          <div className="tags-linha">
            <button className={"tag" + (!tag ? " ativa" : "")} onClick={() => mudar({ tag: "" })}>Todas</button>
            {tags.dados.tags.map((t) => (
              <button key={t} className={"tag" + (tag === t ? " ativa" : "")} onClick={() => mudar({ tag: t })}>#{t}</button>
            ))}
          </div>
        )}

        {fotos.erro && <Erro texto={fotos.erro} onRetry={fotos.recarregar} />}
        {fotos.carregando && !fotos.dados ? <Skeletons /> : fotos.dados && fotos.dados.itens.length === 0 ? (
          <Vazio titulo="Nenhuma foto encontrada">Tente outra busca ou remova os filtros.</Vazio>
        ) : (
          fotos.dados && (
            <>
              <p className="muted" style={{ marginBottom: 16 }}>{fotos.dados.total} foto(s)</p>
              <div className="grid grid-fotos">
                {fotos.dados.itens.map((f) => <FotoCard key={f.id} foto={f} acao={<BotaoCarrinho foto={f} />} />)}
              </div>
              <Paginacao pagina={fotos.dados} onMudar={(p) => mudar({ pagina: String(p) })} />
            </>
          )
        )}
      </div>
    </div>
  );
}
