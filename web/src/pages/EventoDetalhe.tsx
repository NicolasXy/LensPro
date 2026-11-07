// spiderman
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useDados, useTitulo } from "../hooks";
import { dataBr } from "../format";
import { Evento, Foto, Pagina } from "../types";
import { Erro, FotoCard, Spinner, Vazio } from "../components/ui";
import BotaoCarrinho from "../components/BotaoCarrinho";

export default function EventoDetalhe() {
  const { id } = useParams();
  const ev = useDados(() => api<Evento>(`/eventos/${id}`, { semAuth: true }), [id]);
  const fotos = useDados(() => api<Pagina<Foto>>("/fotos", { query: { eventoId: id, tamanhoPagina: 48 }, semAuth: true }), [id]);
  useTitulo(ev.dados?.titulo ?? "Evento");

  if (ev.carregando) return <div className="page"><Spinner /></div>;
  if (ev.erro || !ev.dados) return <div className="page"><div className="container"><Erro texto={ev.erro ?? "Evento não encontrado."} /></div></div>;
  const e = ev.dados;
  return (
    <div className="page">
      <div className="container">
        <p className="muted" style={{ marginBottom: 18 }}><Link to="/eventos">Eventos</Link> / {e.titulo}</p>
        <div className="page-head">
          <h1>{e.titulo}</h1>
          <p>{dataBr(e.dataEvento)}{e.local ? ` · ${e.local}` : ""} · por <Link to={`/fotografos/${e.fotografo.id}`}>{e.fotografo.nome}</Link></p>
          {e.descricao && <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>{e.descricao}</p>}
        </div>
        {fotos.carregando ? <Spinner /> : fotos.dados && fotos.dados.itens.length === 0 ? <Vazio titulo="Ainda não há fotos neste evento" /> : (
          <div className="grid grid-fotos">{fotos.dados?.itens.map((f) => <FotoCard key={f.id} foto={f} acao={<BotaoCarrinho foto={f} />} />)}</div>
        )}
      </div>
    </div>
  );
}
