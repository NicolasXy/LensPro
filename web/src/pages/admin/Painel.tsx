// spiderman
import { api } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { brl } from "../../format";
import { Erro, Spinner } from "../../components/ui";

interface ResumoAdmin {
  usuariosPorPapel: Record<string, number>;
  fotosPorStatus: Record<string, number>;
  itensVendidos: number;
  brutoCentavos: number;
  taxaCentavos: number;
  pedidosPorStatus: Record<string, number>;
}

export default function AdminPainel() {
  useTitulo("Administração");
  const r = useDados(() => api<ResumoAdmin>("/admin/resumo"), []);
  if (r.carregando && !r.dados) return <Spinner />;
  if (r.erro || !r.dados) return <Erro texto={r.erro ?? "Erro"} onRetry={r.recarregar} />;
  const d = r.dados;
  const n = (o: Record<string, number>, k: string) => o[k] ?? 0;
  return (
    <>
      <div className="area-top"><div><h1>Visão geral</h1><p>Indicadores da plataforma.</p></div></div>
      <div className="grid grid-stats" style={{ marginBottom: 28 }}>
        <div className="stat"><div className="n">{n(d.usuariosPorPapel, "fotografo")}</div><span>Fotógrafos</span></div>
        <div className="stat"><div className="n">{n(d.usuariosPorPapel, "comprador")}</div><span>Compradores</span></div>
        <div className="stat"><div className="n">{n(d.fotosPorStatus, "publicada")}</div><span>Fotos publicadas</span></div>
        <div className="stat"><div className="n">{d.itensVendidos}</div><span>Fotos vendidas</span></div>
        <div className="stat"><div className="n">{brl(d.brutoCentavos)}</div><span>Volume vendido</span></div>
        <div className="stat"><div className="n">{brl(d.taxaCentavos)}</div><span>Receita da plataforma</span></div>
      </div>
      <div className="grid grid-3">
        <div className="card"><h3 style={{ marginBottom: 10 }}>Pedidos</h3>{Object.entries(d.pedidosPorStatus).map(([k, v]) => <div key={k} className="resumo-linha"><span>{k}</span><span>{v}</span></div>)}</div>
        <div className="card"><h3 style={{ marginBottom: 10 }}>Fotos por status</h3>{Object.entries(d.fotosPorStatus).map(([k, v]) => <div key={k} className="resumo-linha"><span>{k}</span><span>{v}</span></div>)}</div>
        <div className="card"><h3 style={{ marginBottom: 10 }}>Usuários por papel</h3>{Object.entries(d.usuariosPorPapel).map(([k, v]) => <div key={k} className="resumo-linha"><span>{k}</span><span>{v}</span></div>)}</div>
      </div>
    </>
  );
}
