// spiderman
import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { useTitulo } from "../hooks";
import { useToast } from "../toast";
import { Campo } from "../components/ui";
import { avaliarSenha } from "./Cadastro";

export default function RedefinirSenha() {
  useTitulo("Nova senha");
  const { token } = useParams();
  const nav = useNavigate();
  const avisar = useToast();
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const f = avaliarSenha(senha);
    if (f.faltando.length) return setErro("A senha precisa ter: " + f.faltando.join(", ") + ".");
    if (senha !== conf) return setErro("As senhas não coincidem.");
    setEnviando(true);
    try {
      await api("/auth/redefinir-senha", { corpo: { token, novaSenha: senha }, semAuth: true });
      avisar("Senha alterada com sucesso! Entre com a nova senha.");
      nav("/entrar", { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-up">
        <h1>Criar nova senha</h1>
        <p className="sub">Escolha uma senha forte para sua conta.</p>
        {erro && <div className="alert alert-erro" role="alert">{erro} {erro.includes("expirado") && <Link to="/recuperar-senha">Pedir novo link</Link>}</div>}
        <form onSubmit={enviar}>
          <Campo id="n-senha" rotulo="Nova senha" ajuda="Mínimo de 8 caracteres, com maiúscula, minúscula e número."><input id="n-senha" type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="new-password" autoFocus /></Campo>
          <Campo id="n-conf" rotulo="Confirmar senha"><input id="n-conf" type="password" className="input" value={conf} onChange={(e) => setConf(e.target.value)} required autoComplete="new-password" /></Campo>
          <button className="btn btn-block" disabled={enviando}>{enviando ? "Salvando…" : "Salvar nova senha"}</button>
        </form>
      </div>
    </div>
  );
}
