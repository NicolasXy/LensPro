// spiderman
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useDados, useTitulo } from "../hooks";
import { brl, dataBr } from "../format";
import { Foto, Pagina } from "../types";
import { Erro, FotoCard, Imagem, Spinner } from "../components/ui";
import BotaoCarrinho from "../components/BotaoCarrinho";

export default function FotoDetalhe() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const foto = useDados(() => api<Foto>(`/fotos/${id}`, { semAuth: true }), [id]);
  const f = foto.dados;
  const outras = useDados(
    () => (f ? api<Pagina<Foto>>("/fotos", { query: { fotografoId: f.fotografo.id, tamanhoPagina: 5 }, semAuth: true }) : Promise.resolve(null)),
    [f?.fotografo.id]
  );
  useTitulo(f?.titulo ?? "Foto");

  if (foto.carregando) return <div className="page"><Spinner /></div>;
  if (foto.erro || !f) return <div className="page"><div className="container"><Erro texto={foto.erro ?? "Foto não encontrada."} /><Link to="/galeria" className="btn btn-ghost" style={{ marginTop: 16 }}>Voltar à galeria</Link></div></div>;

  return (
    <div className="page">
      <div className="container">
        <p className="muted" style={{ marginBottom: 18 }}><Link to="/galeria">Galeria</Link> / {f.titulo}</p>
        <div className="foto-detalhe">
          <div className="foto-visual">
            {/* Preview JA marcado pelo servidor: nao existe versao sem marca d'agua em nenhuma URL publica. */}
            <Imagem src={f.urlPreview} alt={f.titulo} prioridade />
          </div>
          <aside className="card painel-compra">
            <h1 style={{ fontSize: "1.6rem" }}>{f.titulo}</h1>
            <p className="muted" style={{ margin: "6px 0 14px" }}>por <Link to={`/fotografos/${f.fotografo.id}`}>{f.fotografo.nome}</Link></p>
            {f.descricao && <p style={{ marginBottom: 14 }}>{f.descricao}</p>}
            <div className="row" style={{ marginBottom: 14 }}>
              {f.evento && <Link to={`/eventos/${f.evento.id}`} className="badge">{f.evento.titulo}</Link>}
              {f.tags.map((t) => <Link key={t} to={`/galeria?tag=${encodeURIComponent(t)}`} className="tag">#{t}</Link>)}
            </div>
            <div className="price-lg" style={{ margin: "10px 0" }}>{brl(f.precoCentavos)}</div>
            <ul className="lista-check">
              <li>Arquivo original em alta resolução ({f.largura}×{f.altura} px)</li>
              <li>Sem marca d'água após a compra</li>
              <li>Download imediato após o pagamento</li>
            </ul>
            {usuario && usuario.papel !== "comprador" ? (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>Contas de {usuario.papel === "fotografo" ? "fotógrafo" : "administrador"} não compram fotos. Entre com uma conta de comprador.</div>
            ) : (
              <BotaoCarrinho foto={f} grande />
            )}
            <p className="help" style={{ marginTop: 12 }}>Publicada em {dataBr(f.criadoEm)}</p>
          </aside>
        </div>

        {outras.dados && outras.dados.itens.filter((o) => o.id !== f.id).length > 0 && (
          <section style={{ marginTop: 56 }}>
            <h2 style={{ marginBottom: 20 }}>Mais de {f.fotografo.nome}</h2>
            <div className="grid grid-fotos">
              {outras.dados.itens.filter((o) => o.id !== f.id).slice(0, 4).map((o) => <FotoCard key={o.id} foto={o} acao={<BotaoCarrinho foto={o} />} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
