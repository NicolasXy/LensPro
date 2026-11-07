// spiderman
import { FormEvent, useState } from "react";
import { api, mensagemDeErro } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { dataBr } from "../../format";
import { Evento, Pagina } from "../../types";
import { Campo, Erro, Modal, Spinner, Vazio } from "../../components/ui";
import { useToast } from "../../toast";

export default function EstudioEventos() {
  useTitulo("Meus eventos");
  const avisar = useToast();
  const r = useDados(() => api<Pagina<Evento>>("/estudio/eventos", { query: { tamanhoPagina: 100 } }), []);
  const [form, setForm] = useState<Evento | "novo" | null>(null);
  const [excluindo, setExcluindo] = useState<Evento | null>(null);

  async function excluir() {
    if (!excluindo) return;
    try { await api(`/estudio/eventos/${excluindo.id}`, { metodo: "DELETE" }); avisar("Evento excluído. As fotos continuam publicadas."); setExcluindo(null); r.recarregar(); }
    catch (e) { avisar(mensagemDeErro(e), "erro"); }
  }

  return (
    <>
      <div className="area-top"><div><h1>Eventos</h1><p>Agrupe suas fotos por evento para facilitar a busca dos compradores.</p></div><button className="btn" onClick={() => setForm("novo")}>+ Novo evento</button></div>
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : !r.dados || r.dados.itens.length === 0 ? <Vazio titulo="Nenhum evento criado" /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Evento</th><th>Data</th><th>Local</th><th>Fotos</th><th>Situação</th><th></th></tr></thead>
          <tbody>{r.dados.itens.map((e) => (
            <tr key={e.id}><td><b>{e.titulo}</b></td><td>{dataBr(e.dataEvento)}</td><td>{e.local ?? "—"}</td><td>{e.totalFotos}</td><td>{e.ativo ? <span className="badge badge-ok">Visível</span> : <span className="badge badge-muted">Oculto</span>}</td>
              <td><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}><button className="btn btn-sm btn-ghost" onClick={() => setForm(e)}>Editar</button><button className="btn btn-sm btn-danger" onClick={() => setExcluindo(e)}>Excluir</button></div></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {form && <FormEvento evento={form === "novo" ? null : form} aoFechar={() => setForm(null)} aoSalvar={() => { setForm(null); r.recarregar(); }} />}
      {excluindo && (
        <Modal titulo="Excluir evento?" aoFechar={() => setExcluindo(null)}>
          <p>“{excluindo.titulo}”</p><p className="muted" style={{ margin: "10px 0 18px" }}>As fotos deste evento não são apagadas: apenas ficam sem evento.</p>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setExcluindo(null)}>Cancelar</button><button className="btn btn-danger" onClick={excluir}>Excluir</button></div>
        </Modal>
      )}
    </>
  );
}

function FormEvento({ evento, aoFechar, aoSalvar }: { evento: Evento | null; aoFechar: () => void; aoSalvar: () => void }) {
  const avisar = useToast();
  const [d, setD] = useState({ titulo: evento?.titulo ?? "", descricao: evento?.descricao ?? "", local: evento?.local ?? "", dataEvento: evento?.dataEvento ?? "", ativo: evento?.ativo ?? true });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const corpo = { titulo: d.titulo, descricao: d.descricao || null, local: d.local || null, dataEvento: d.dataEvento };
      if (evento) await api(`/estudio/eventos/${evento.id}`, { metodo: "PATCH", corpo: { ...corpo, ativo: d.ativo, versao: evento.versao } });
      else await api("/estudio/eventos", { corpo });
      avisar(evento ? "Evento atualizado." : "Evento criado.");
      aoSalvar();
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }
  return (
    <Modal titulo={evento ? "Editar evento" : "Novo evento"} aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        {erro && <div className="alert alert-erro">{erro}</div>}
        <Campo id="ev-t" rotulo="Título"><input id="ev-t" className="input" value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} required minLength={3} maxLength={150} /></Campo>
        <div className="form-grid">
          <Campo id="ev-d" rotulo="Data"><input id="ev-d" type="date" className="input" value={d.dataEvento} onChange={(e) => setD({ ...d, dataEvento: e.target.value })} required /></Campo>
          <Campo id="ev-l" rotulo="Local"><input id="ev-l" className="input" value={d.local} onChange={(e) => setD({ ...d, local: e.target.value })} maxLength={150} /></Campo>
        </div>
        <Campo id="ev-desc" rotulo="Descrição"><textarea id="ev-desc" className="textarea" value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} maxLength={1000} /></Campo>
        {evento && <label className="row" style={{ marginBottom: 12 }}><input type="checkbox" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} /> Visível na página de eventos</label>}
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={aoFechar}>Cancelar</button><button className="btn" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></div>
      </form>
    </Modal>
  );
}
