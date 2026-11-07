// spiderman
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDeErro } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { brl, centavosParaReais, reaisParaCentavos } from "../../format";
import { Evento, FotoGerenciavel, Pagina } from "../../types";
import { Campo, Erro, Modal, Paginacao, Spinner, StatusBadge, Vazio } from "../../components/ui";
import { useToast } from "../../toast";

export default function EstudioFotos() {
  useTitulo("Minhas fotos");
  const avisar = useToast();
  const [pagina, setPagina] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const r = useDados(() => api<Pagina<FotoGerenciavel>>("/estudio/fotos", { query: { pagina, status, q, tamanhoPagina: 24 } }), [pagina, status, q]);
  const eventos = useDados(() => api<Pagina<Evento>>("/estudio/eventos", { query: { tamanhoPagina: 100 } }), []);
  const [editando, setEditando] = useState<FotoGerenciavel | null>(null);
  const [excluindo, setExcluindo] = useState<FotoGerenciavel | null>(null);

  async function alternar(f: FotoGerenciavel) {
    try {
      await api(`/estudio/fotos/${f.id}`, { metodo: "PATCH", corpo: { status: f.status === "publicada" ? "oculta" : "publicada", versao: f.versao } });
      avisar(f.status === "publicada" ? "Foto ocultada da vitrine." : "Foto publicada na vitrine.");
      r.recarregar();
    } catch (e) { avisar(mensagemDeErro(e), "erro"); }
  }

  async function excluir() {
    if (!excluindo) return;
    try {
      const res = await api<{ modo: string }>(`/estudio/fotos/${excluindo.id}`, { metodo: "DELETE" });
      avisar(res.modo === "arquivada" ? "Foto retirada da vitrine (quem comprou continua com acesso)." : "Foto excluída definitivamente.");
      setExcluindo(null);
      r.recarregar();
    } catch (e) { avisar(mensagemDeErro(e), "erro"); }
  }

  return (
    <>
      <div className="area-top"><div><h1>Minhas fotos</h1><p>Edite preços, oculte ou exclua suas fotos.</p></div><Link to="/estudio/publicar" className="btn">Publicar fotos</Link></div>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setQ(busca.trim()); }}>
        <input className="input busca" type="search" placeholder="Buscar nas minhas fotos…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select className="select" value={status} onChange={(e) => { setPagina(1); setStatus(e.target.value); }} aria-label="Filtrar por status">
          <option value="">Todas</option><option value="publicada">Publicadas</option><option value="oculta">Ocultas</option>
        </select>
        <button className="btn btn-sm">Buscar</button>
      </form>
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : !r.dados || r.dados.itens.length === 0 ? <Vazio titulo="Nenhuma foto aqui"><p style={{ margin: "8px 0 18px" }}>Publique sua primeira foto para começar a vender.</p><Link to="/estudio/publicar" className="btn">Publicar fotos</Link></Vazio> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th>Título</th><th>Preço</th><th>Status</th><th>Vendas</th><th></th></tr></thead>
              <tbody>
                {r.dados.itens.map((f) => (
                  <tr key={f.id}>
                    <td><img className="mini" src={f.urlMiniatura} alt="" /></td>
                    <td><b>{f.titulo}</b><div className="help">{f.evento ? f.evento.titulo : "Sem evento"}</div></td>
                    <td>{brl(f.precoCentavos)}</td>
                    <td><StatusBadge status={f.status} /></td>
                    <td>{f.vendas}</td>
                    <td><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditando(f)}>Editar</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => alternar(f)}>{f.status === "publicada" ? "Ocultar" : "Publicar"}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setExcluindo(f)}>Excluir</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={r.dados} onMudar={setPagina} />
        </>
      )}
      {editando && <EditarFoto foto={editando} eventos={eventos.dados?.itens ?? []} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); r.recarregar(); }} />}
      {excluindo && (
        <Modal titulo="Excluir foto?" aoFechar={() => setExcluindo(null)}>
          <p>“{excluindo.titulo}”</p>
          <p className="muted" style={{ margin: "10px 0 18px" }}>{excluindo.vendas > 0 ? "Esta foto já foi vendida: ela sai da vitrine, mas quem comprou continua podendo baixá-la." : "Esta ação apaga a foto e os arquivos definitivamente."}</p>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setExcluindo(null)}>Cancelar</button><button className="btn btn-danger" onClick={excluir}>Excluir</button></div>
        </Modal>
      )}
    </>
  );
}

function EditarFoto({ foto, eventos, aoFechar, aoSalvar }: { foto: FotoGerenciavel; eventos: Evento[]; aoFechar: () => void; aoSalvar: () => void }) {
  const avisar = useToast();
  const [d, setD] = useState({ titulo: foto.titulo, descricao: foto.descricao ?? "", tags: foto.tags.join(", "), preco: centavosParaReais(foto.precoCentavos), eventoId: foto.evento?.id ?? "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const cent = reaisParaCentavos(d.preco);
    if (!Number.isFinite(cent)) return setErro("Preço inválido.");
    setSalvando(true);
    try {
      await api(`/estudio/fotos/${foto.id}`, { metodo: "PATCH", corpo: { titulo: d.titulo, descricao: d.descricao || null, tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean), precoCentavos: cent, eventoId: d.eventoId || null, versao: foto.versao } });
      avisar("Foto atualizada.");
      aoSalvar();
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }
  return (
    <Modal titulo="Editar foto" aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        {erro && <div className="alert alert-erro">{erro}</div>}
        <Campo id="ef-t" rotulo="Título"><input id="ef-t" className="input" value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} required minLength={3} maxLength={150} /></Campo>
        <div className="form-grid">
          <Campo id="ef-p" rotulo="Preço (R$)" ajuda="Vale para compras futuras; pedidos já feitos mantêm o preço da época."><input id="ef-p" className="input" value={d.preco} onChange={(e) => setD({ ...d, preco: e.target.value })} inputMode="decimal" required /></Campo>
          <Campo id="ef-e" rotulo="Evento"><select id="ef-e" className="select" value={d.eventoId} onChange={(e) => setD({ ...d, eventoId: e.target.value })}><option value="">Sem evento</option>{eventos.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}</select></Campo>
        </div>
        <Campo id="ef-g" rotulo="Tags (separadas por vírgula)"><input id="ef-g" className="input" value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></Campo>
        <Campo id="ef-d" rotulo="Descrição"><textarea id="ef-d" className="textarea" value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} maxLength={1000} /></Campo>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={aoFechar}>Cancelar</button><button className="btn" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></div>
      </form>
    </Modal>
  );
}
