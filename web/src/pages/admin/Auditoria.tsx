// spiderman
import { useState } from "react";
import { api } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { dataHoraBr } from "../../format";
import { Pagina } from "../../types";
import { Erro, Paginacao, Spinner, Vazio } from "../../components/ui";

interface Registro { id: string; acao: string; detalhes: unknown; criadoEm: string; usuario: { email: string; nome: string } | null }

export default function AdminAuditoria() {
  useTitulo("Auditoria");
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState("");
  const [filtro, setFiltro] = useState("");
  const r = useDados(() => api<Pagina<Registro>>("/admin/auditoria", { query: { pagina, acao, tamanhoPagina: 50 } }), [pagina, acao]);
  return (
    <>
      <div className="area-top"><div><h1>Auditoria</h1><p>Trilha imutável de ações sensíveis (o banco bloqueia alteração e exclusão dos registros).</p></div></div>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setAcao(filtro.trim()); }}>
        <input className="input busca" placeholder="Filtrar por ação exata (ex.: LOGIN_FALHA, DOWNLOAD_ORIGINAL)" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Ação" />
        <button className="btn btn-sm">Filtrar</button>
      </form>
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : !r.dados || r.dados.itens.length === 0 ? <Vazio titulo="Nenhum registro" /> : (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>Quando</th><th>Ação</th><th>Usuário</th><th>Detalhes</th></tr></thead>
            <tbody>{r.dados.itens.map((a) => (
              <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{dataHoraBr(a.criadoEm)}</td><td><span className="badge badge-muted">{a.acao}</span></td><td>{a.usuario?.email ?? "—"}</td><td className="help" style={{ fontFamily: "ui-monospace, monospace", maxWidth: 380, wordBreak: "break-all" }}>{JSON.stringify(a.detalhes)}</td></tr>
            ))}</tbody>
          </table></div>
          <Paginacao pagina={r.dados} onMudar={setPagina} />
        </>
      )}
    </>
  );
}
