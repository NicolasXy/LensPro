// spiderman
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useDados, useTitulo } from "../hooks";
import { Foto, Pagina, PerfilPublico } from "../types";
import { Erro, FotoCard, Iniciais, Spinner, Vazio } from "../components/ui";
import BotaoCarrinho from "../components/BotaoCarrinho";

export default function FotografoPerfil() {
  const { id } = useParams();
  const p = useDados(() => api<PerfilPublico>(`/fotografos/${id}`, { semAuth: true }), [id]);
  const fotos = useDados(() => api<Pagina<Foto>>("/fotos", { query: { fotografoId: id, tamanhoPagina: 48 }, semAuth: true }), [id]);
  useTitulo(p.dados?.nomeArtistico ?? "Fotógrafo");

  if (p.carregando) return <div className="page"><Spinner /></div>;
  if (p.erro || !p.dados) return <div className="page"><div className="container"><Erro texto={p.erro ?? "Fotógrafo não encontrado."} /></div></div>;
  const f = p.dados;
  return (
    <div className="page">
      <div className="container">
        <p className="muted" style={{ marginBottom: 18 }}><Link to="/fotografos">Fotógrafos</Link> / {f.nomeArtistico}</p>
        <div className="card row" style={{ gap: 24, marginBottom: 36 }}>
          <Iniciais nome={f.nomeArtistico} grande />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: "1.9rem" }}>{f.nomeArtistico}</h1>
            <p className="muted">{f.especialidade ?? "Fotografia"}{f.cidade ? ` · ${f.cidade}${f.estado ? "/" + f.estado : ""}` : ""}</p>
            {f.bio && <p style={{ marginTop: 10, maxWidth: 680 }}>{f.bio}</p>}
          </div>
          <div className="stat" style={{ minWidth: 130 }}><div className="n">{f.totalFotos}</div><span>fotos à venda</span></div>
        </div>
        {fotos.carregando ? <Spinner /> : fotos.dados && fotos.dados.itens.length === 0 ? <Vazio titulo="Nenhuma foto publicada ainda" /> : (
          <div className="grid grid-fotos">{fotos.dados?.itens.map((x) => <FotoCard key={x.id} foto={x} acao={<BotaoCarrinho foto={x} />} />)}</div>
        )}
      </div>
    </div>
  );
}
