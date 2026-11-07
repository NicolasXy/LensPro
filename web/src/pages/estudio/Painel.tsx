// spiderman
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useDados, useTitulo } from "../../hooks";
import { brl, dataHoraBr } from "../../format";
import { Pagina } from "../../types";
import { Erro, Spinner } from "../../components/ui";

export interface Resumo { fotosPublicadas: number; fotosOcultas: number; eventos: number; vendas: number; brutoCentavos: number; taxaCentavos: number; liquidoCentavos: number }
export interface Venda { itemId: string; fotoId: string; tituloFoto: string; pagoEm: string | null; precoCentavos: number; taxaCentavos: number; liquidoCentavos: number; comprador: string }

export default function EstudioPainel() {
  useTitulo("Meu estúdio");
  const { perfil, usuario } = useAuth();
  const r = useDados(() => api<Resumo>("/estudio/resumo"), []);
  const v = useDados(() => api<Pagina<Venda>>("/estudio/vendas", { query: { tamanhoPagina: 5 } }), []);
  if (r.carregando && !r.dados) return <Spinner />;
  if (r.erro || !r.dados) return <Erro texto={r.erro ?? "Erro"} onRetry={r.recarregar} />;
  const d = r.dados;
  return (
    <>
      <div className="area-top">
        <div><h1>Olá, {perfil?.nomeArtistico ?? usuario?.nome}</h1><p>Bem-vindo ao seu estúdio LensPro.</p></div>
        <Link to="/estudio/publicar" className="btn">Publicar fotos</Link>
      </div>

      {d.fotosPublicadas + d.fotosOcultas === 0 && (
        <div className="alert alert-info">Você ainda não publicou fotos. <Link to="/estudio/publicar" style={{ textDecoration: "underline" }}>Publique a primeira</Link>: ela aparece com marca d'água e você define o preço.</div>
      )}
      {!perfil?.pagbankContaId && (
        <div className="alert alert-erro" role="alert"><b>Vincule sua conta PagBank</b> em <Link to="/estudio/perfil" style={{ textDecoration: "underline" }}>Perfil e repasse</Link>. É por ela que você recebe a sua parte de cada venda, direto na compra. Sem isso, suas fotos não podem ser pagas quando o pagamento real está ativo.</div>
      )}

      <div className="grid grid-stats" style={{ marginBottom: 32 }}>
        <div className="stat"><div className="n">{d.fotosPublicadas}</div><span>Fotos publicadas</span></div>
        <div className="stat"><div className="n">{d.vendas}</div><span>Fotos vendidas</span></div>
        <div className="stat"><div className="n">{brl(d.brutoCentavos)}</div><span>Total vendido</span></div>
        <div className="stat"><div className="n">{brl(d.liquidoCentavos)}</div><span>A receber (líquido)</span></div>
      </div>

      <div className="section-head"><h2>Vendas recentes</h2><Link to="/estudio/vendas" className="btn btn-sm btn-ghost">Ver todas</Link></div>
      {v.dados && v.dados.itens.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Foto</th><th>Comprador</th><th>Data</th><th>Valor</th><th>Líquido</th></tr></thead>
            <tbody>{v.dados.itens.map((i) => <tr key={i.itemId}><td>{i.tituloFoto}</td><td>{i.comprador}</td><td>{i.pagoEm ? dataHoraBr(i.pagoEm) : "—"}</td><td>{brl(i.precoCentavos)}</td><td>{brl(i.liquidoCentavos)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="muted">Suas vendas aparecerão aqui.</p>}
    </>
  );
}
