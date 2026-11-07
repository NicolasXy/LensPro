// spiderman
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useDados, useTitulo } from "../hooks";
import { dataBr } from "../format";
import { Evento, Pagina } from "../types";
import { Erro, Paginacao, Spinner, Vazio } from "../components/ui";

export function EventoCard({ e }: { e: Evento }) {
  return (
    <Link to={`/eventos/${e.id}`} className="card evento-card">
      <div className="evento-capa">{e.urlCapa ? <img src={e.urlCapa} alt="" loading="lazy" /> : null}</div>
      <div className="evento-corpo">
        <h3>{e.titulo}</h3>
        <span className="muted" style={{ fontSize: "0.85rem" }}>{dataBr(e.dataEvento)}{e.local ? ` · ${e.local}` : ""}</span>
        <span className="muted" style={{ fontSize: "0.85rem" }}>por {e.fotografo.nome}</span>
        <span className="badge" style={{ alignSelf: "flex-start", marginTop: 6 }}>{e.totalFotos} foto(s)</span>
      </div>
    </Link>
  );
}

export default function Eventos() {
  useTitulo("Eventos");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const r = useDados(() => api<Pagina<Evento>>("/eventos", { query: { q, pagina, tamanhoPagina: 12 }, semAuth: true }), [q, pagina]);

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><h1>Eventos</h1><p>Encontre as coberturas fotográficas publicadas na plataforma.</p></div>
        <form className="filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setQ(busca.trim()); }} role="search">
          <input className="input busca" type="search" placeholder="Buscar evento ou local…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar eventos" />
          <button className="btn btn-sm">Buscar</button>
        </form>
        {r.erro && <Erro texto={r.erro} onRetry={r.recarregar} />}
        {r.carregando && !r.dados ? <Spinner /> : r.dados && r.dados.itens.length === 0 ? <Vazio titulo="Nenhum evento encontrado" /> : r.dados && (
          <>
            <div className="grid grid-3">{r.dados.itens.map((e) => <EventoCard key={e.id} e={e} />)}</div>
            <Paginacao pagina={r.dados} onMudar={setPagina} />
          </>
        )}
      </div>
    </div>
  );
}
