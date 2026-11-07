// spiderman
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useDados, useTitulo } from "../hooks";
import { PerfilPublico, Pagina } from "../types";
import { Erro, Iniciais, Paginacao, Spinner, Vazio } from "../components/ui";

export default function Fotografos() {
  useTitulo("Fotógrafos");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const r = useDados(() => api<Pagina<PerfilPublico>>("/fotografos", { query: { q, pagina, tamanhoPagina: 12 }, semAuth: true }), [q, pagina]);

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><h1>Fotógrafos em destaque</h1><p>Conheça profissionais incríveis.</p></div>
        <form className="filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setQ(busca.trim()); }} role="search">
          <input className="input busca" type="search" placeholder="Buscar por nome, cidade ou especialidade…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar fotógrafos" />
          <button className="btn btn-sm">Buscar</button>
        </form>
        {r.erro && <Erro texto={r.erro} onRetry={r.recarregar} />}
        {r.carregando && !r.dados ? <Spinner /> : r.dados && r.dados.itens.length === 0 ? <Vazio titulo="Nenhum fotógrafo encontrado" /> : r.dados && (
          <>
            <div className="grid grid-3">
              {r.dados.itens.map((p) => (
                <Link key={p.id} to={`/fotografos/${p.id}`} className="feature">
                  <div className="row" style={{ marginBottom: 12 }}>
                    <Iniciais nome={p.nomeArtistico} />
                    <div><h3>{p.nomeArtistico}</h3><span className="muted" style={{ fontSize: "0.85rem" }}>{p.especialidade ?? "Fotografia"}</span></div>
                  </div>
                  <p>{p.cidade ? `${p.cidade}${p.estado ? "/" + p.estado : ""}` : "—"} · {p.totalFotos} foto(s) à venda</p>
                </Link>
              ))}
            </div>
            <Paginacao pagina={r.dados} onMudar={setPagina} />
          </>
        )}
      </div>
    </div>
  );
}
