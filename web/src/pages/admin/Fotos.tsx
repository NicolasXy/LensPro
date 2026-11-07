// spiderman
import { useState } from "react";
import { api, mensagemDeErro } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { brl } from "../../format";
import { FotoGerenciavel, Pagina } from "../../types";
import { Erro, Modal, Paginacao, Spinner, StatusBadge, Vazio } from "../../components/ui";
import { useToast } from "../../toast";

export default function AdminFotos() {
  useTitulo("Moderação de fotos");
  const avisar = useToast();
  const [pagina, setPagina] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const r = useDados(() => api<Pagina<FotoGerenciavel>>("/admin/fotos", { query: { pagina, status, q, tamanhoPagina: 24 } }), [pagina, status, q]);
  const [removendo, setRemovendo] = useState<FotoGerenciavel | null>(null);
  const [motivo, setMotivo] = useState("");

  async function remover() {
    if (!removendo) return;
    try { await api(`/admin/fotos/${removendo.id}/remover`, { corpo: { motivo } }); avisar("Foto removida da vitrine."); setRemovendo(null); setMotivo(""); r.recarregar(); }
    catch (e) { avisar(mensagemDeErro(e), "erro"); }
  }
  async function restaurar(f: FotoGerenciavel) {
    try { await api(`/admin/fotos/${f.id}/restaurar`, { metodo: "POST" }); avisar("Foto restaurada (volta como oculta)."); r.recarregar(); }
    catch (e) { avisar(mensagemDeErro(e), "erro"); }
  }

  return (
    <>
      <div className="area-top"><div><h1>Moderação de fotos</h1><p>Remova conteúdo indevido da vitrine. Quem já comprou mantém o acesso.</p></div></div>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setQ(busca.trim()); }}>
        <input className="input busca" type="search" placeholder="Buscar por título, tag ou fotógrafo…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select className="select" value={status} onChange={(e) => { setPagina(1); setStatus(e.target.value); }} aria-label="Status"><option value="">Todos os status</option><option value="publicada">Publicadas</option><option value="oculta">Ocultas</option><option value="removida">Removidas</option></select>
        <button className="btn btn-sm">Buscar</button>
      </form>
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : !r.dados || r.dados.itens.length === 0 ? <Vazio titulo="Nenhuma foto" /> : (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th></th><th>Foto</th><th>Fotógrafo</th><th>Preço</th><th>Status</th><th>Vendas</th><th></th></tr></thead>
            <tbody>{r.dados.itens.map((f) => (
              <tr key={f.id}>
                <td>{f.status !== "removida" ? <img className="mini" src={f.urlMiniatura} alt="" /> : <span className="muted">—</span>}</td>
                <td><b>{f.titulo}</b></td><td>{f.fotografo.nome}</td><td>{brl(f.precoCentavos)}</td><td><StatusBadge status={f.status} /></td><td>{f.vendas}</td>
                <td style={{ textAlign: "right" }}>{f.status === "removida" ? <button className="btn btn-sm btn-ghost" onClick={() => restaurar(f)}>Restaurar</button> : <button className="btn btn-sm btn-danger" onClick={() => setRemovendo(f)}>Remover</button>}</td>
              </tr>))}</tbody>
          </table></div>
          <Paginacao pagina={r.dados} onMudar={setPagina} />
        </>
      )}
      {removendo && (
        <Modal titulo="Remover foto da vitrine?" aoFechar={() => setRemovendo(null)}>
          <p>“{removendo.titulo}” — {removendo.fotografo.nome}</p>
          <div className="field" style={{ marginTop: 14 }}><label htmlFor="motivo">Motivo (fica na auditoria)</label><input id="motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} /></div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setRemovendo(null)}>Cancelar</button><button className="btn btn-danger" onClick={remover}>Remover</button></div>
        </Modal>
      )}
    </>
  );
}
