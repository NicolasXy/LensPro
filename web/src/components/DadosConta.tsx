// spiderman
import { FormEvent, useState } from "react";
import { api, mensagemDeErro } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import { Campo } from "./ui";

/** Dados da conta e troca de senha (compartilhado pelas interfaces de comprador e fotografo). */
export default function DadosConta() {
  const { usuario, recarregar } = useAuth();
  const avisar = useToast();
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [sobrenome, setSobrenome] = useState(usuario?.sobrenome ?? "");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  if (!usuario) return null;

  async function salvarDados(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api("/auth/eu", { metodo: "PATCH", corpo: { nome, sobrenome, versao: usuario!.versao } });
      await recarregar();
      avisar("Dados atualizados.");
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    setErroSenha(null);
    setSalvando(true);
    try {
      await api("/auth/senha", { metodo: "PUT", corpo: { senhaAtual: atual, novaSenha: nova } });
      setAtual("");
      setNova("");
      avisar("Senha alterada com sucesso.");
    } catch (err) {
      setErroSenha(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid grid-3" style={{ alignItems: "start" }}>
      <form className="card" onSubmit={salvarDados}>
        <h3 style={{ marginBottom: 16 }}>Dados da conta</h3>
        <Campo id="d-email" rotulo="E-mail"><input id="d-email" className="input" value={usuario.email} disabled /></Campo>
        <div className="form-grid">
          <Campo id="d-nome" rotulo="Nome"><input id="d-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={100} /></Campo>
          <Campo id="d-sobrenome" rotulo="Sobrenome"><input id="d-sobrenome" className="input" value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} required minLength={2} maxLength={100} /></Campo>
        </div>
        <button className="btn" disabled={salvando}>Salvar alterações</button>
      </form>
      <form className="card" onSubmit={trocarSenha}>
        <h3 style={{ marginBottom: 16 }}>Alterar senha</h3>
        {erroSenha && <div className="alert alert-erro">{erroSenha}</div>}
        <Campo id="s-atual" rotulo="Senha atual"><input id="s-atual" type="password" className="input" value={atual} onChange={(e) => setAtual(e.target.value)} required autoComplete="current-password" /></Campo>
        <Campo id="s-nova" rotulo="Nova senha" ajuda="Mínimo de 8 caracteres, com maiúscula, minúscula e número."><input id="s-nova" type="password" className="input" value={nova} onChange={(e) => setNova(e.target.value)} required minLength={8} autoComplete="new-password" /></Campo>
        <button className="btn" disabled={salvando}>Alterar senha</button>
      </form>
    </div>
  );
}
