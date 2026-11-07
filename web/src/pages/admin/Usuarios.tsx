// spiderman
import { FormEvent, useState } from "react";
import { api, mensagemDeErro } from "../../api";
import { useAuth } from "../../auth";
import { useDados, useTitulo } from "../../hooks";
import { dataBr } from "../../format";
import { Pagina, Papel, Usuario } from "../../types";
import { Campo, Erro, Modal, Paginacao, Spinner } from "../../components/ui";
import { useToast } from "../../toast";

export default function AdminUsuarios() {
  useTitulo("Usuários");
  const { usuario: eu } = useAuth();
  const avisar = useToast();
  const [pagina, setPagina] = useState(1);
  const [papel, setPapel] = useState("");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const r = useDados(() => api<Pagina<Usuario>>("/admin/usuarios", { query: { pagina, papel, q, tamanhoPagina: 20 } }), [pagina, papel, q]);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);

  async function alternar(u: Usuario) {
    try { await api(`/admin/usuarios/${u.id}/ativo`, { metodo: "PATCH", corpo: { ativo: !u.ativo, versao: u.versao } }); avisar(u.ativo ? "Conta desativada (vale imediatamente)." : "Conta reativada."); r.recarregar(); }
    catch (e) { avisar(mensagemDeErro(e), "erro"); }
  }

  return (
    <>
      <div className="area-top"><div><h1>Usuários</h1><p>Crie contas, renomeie e ative/desative acessos.</p></div><button className="btn" onClick={() => setNovo(true)}>+ Novo usuário</button></div>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setQ(busca.trim()); }}>
        <input className="input busca" type="search" placeholder="Buscar por nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select className="select" value={papel} onChange={(e) => { setPagina(1); setPapel(e.target.value); }} aria-label="Filtrar por papel"><option value="">Todos os papéis</option><option value="comprador">Compradores</option><option value="fotografo">Fotógrafos</option><option value="admin">Admins</option></select>
        <button className="btn btn-sm">Buscar</button>
      </form>
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : r.dados && (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Criado em</th><th>Situação</th><th></th></tr></thead>
            <tbody>{r.dados.itens.map((u) => (
              <tr key={u.id}>
                <td><b>{u.nome} {u.sobrenome}</b></td><td>{u.email}</td><td><span className="badge badge-muted">{u.papel}</span></td><td>{dataBr(u.criadoEm)}</td>
                <td>{u.ativo ? <span className="badge badge-ok">Ativa</span> : <span className="badge badge-danger">Desativada</span>}</td>
                <td><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditando(u)}>Editar</button>
                  <button className={"btn btn-sm " + (u.ativo ? "btn-danger" : "btn-ghost")} disabled={u.id === eu?.id} onClick={() => alternar(u)}>{u.ativo ? "Desativar" : "Reativar"}</button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
          <Paginacao pagina={r.dados} onMudar={setPagina} />
        </>
      )}
      {novo && <NovoUsuario aoFechar={() => setNovo(false)} aoSalvar={() => { setNovo(false); r.recarregar(); }} />}
      {editando && <EditarUsuario u={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); r.recarregar(); }} />}
    </>
  );
}

function NovoUsuario({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const avisar = useToast();
  const [d, setD] = useState({ nome: "", sobrenome: "", email: "", senha: "", papel: "comprador" as Papel });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(null); setSalvando(true);
    try { await api("/admin/usuarios", { corpo: d }); avisar("Usuário criado."); aoSalvar(); }
    catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }
  return (
    <Modal titulo="Novo usuário" aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        {erro && <div className="alert alert-erro">{erro}</div>}
        <div className="form-grid">
          <Campo id="nu-n" rotulo="Nome"><input id="nu-n" className="input" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} required minLength={2} /></Campo>
          <Campo id="nu-s" rotulo="Sobrenome"><input id="nu-s" className="input" value={d.sobrenome} onChange={(e) => setD({ ...d, sobrenome: e.target.value })} required minLength={2} /></Campo>
        </div>
        <Campo id="nu-e" rotulo="E-mail"><input id="nu-e" type="email" className="input" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} required /></Campo>
        <div className="form-grid">
          <Campo id="nu-p" rotulo="Papel"><select id="nu-p" className="select" value={d.papel} onChange={(e) => setD({ ...d, papel: e.target.value as Papel })}><option value="comprador">Comprador</option><option value="fotografo">Fotógrafo</option><option value="admin">Administrador</option></select></Campo>
          <Campo id="nu-pw" rotulo="Senha inicial" ajuda="8+ caracteres, maiúscula, minúscula e número."><input id="nu-pw" type="password" className="input" value={d.senha} onChange={(e) => setD({ ...d, senha: e.target.value })} required minLength={8} autoComplete="new-password" /></Campo>
        </div>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={aoFechar}>Cancelar</button><button className="btn" disabled={salvando}>{salvando ? "Criando…" : "Criar"}</button></div>
      </form>
    </Modal>
  );
}

function EditarUsuario({ u, aoFechar, aoSalvar }: { u: Usuario; aoFechar: () => void; aoSalvar: () => void }) {
  const avisar = useToast();
  const [nome, setNome] = useState(u.nome);
  const [sobrenome, setSobrenome] = useState(u.sobrenome);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(null); setSalvando(true);
    try {
      await api(`/admin/usuarios/${u.id}`, { metodo: "PATCH", corpo: { nome, sobrenome, versao: u.versao } });
      if (senha) await api(`/admin/usuarios/${u.id}/senha`, { metodo: "PUT", corpo: { novaSenha: senha } });
      avisar("Usuário atualizado."); aoSalvar();
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }
  return (
    <Modal titulo={`Editar ${u.email}`} aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        {erro && <div className="alert alert-erro">{erro}</div>}
        <div className="form-grid">
          <Campo id="eu-n" rotulo="Nome"><input id="eu-n" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} /></Campo>
          <Campo id="eu-s" rotulo="Sobrenome"><input id="eu-s" className="input" value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} required minLength={2} /></Campo>
        </div>
        <Campo id="eu-pw" rotulo="Nova senha (opcional)" ajuda="Deixe vazio para manter a senha atual."><input id="eu-pw" type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></Campo>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={aoFechar}>Cancelar</button><button className="btn" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></div>
      </form>
    </Modal>
  );
}
