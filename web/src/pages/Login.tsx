// spiderman
import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { mensagemDeErro } from "../api";
import { areaInicial, useAuth } from "../auth";
import { useTitulo } from "../hooks";
import { Campo } from "../components/ui";

const DEMO = [
  ["Comprador", "cliente@lenspro.com"],
  ["Fotógrafo", "carlos@lenspro.com"],
  ["Admin", "admin@lenspro.com"],
];

export default function Login() {
  useTitulo("Entrar");
  const { login, aviso, limparAviso } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const u = await login(email, senha);
      const de = params.get("de");
      // So aceitamos caminhos internos (evita redirecionamento para sites externos).
      nav(de && de.startsWith("/") && !de.startsWith("//") ? de : areaInicial(u.papel), { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-up">
        <h1>Entrar</h1>
        <p className="sub">Acesse sua conta de comprador ou fotógrafo.</p>
        {aviso && <div className="alert alert-info" onClick={limparAviso}>{aviso}</div>}
        {erro && <div className="alert alert-erro" role="alert">{erro}</div>}
        <form onSubmit={enviar}>
          <Campo id="l-email" rotulo="E-mail"><input id="l-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus placeholder="seu@email.com" /></Campo>
          <Campo id="l-senha" rotulo="Senha"><input id="l-senha" type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" placeholder="Sua senha" /></Campo>
          <button className="btn btn-block" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        </form>
        <div className="auth-links"><Link to="/recuperar-senha">Esqueci minha senha</Link><span>Novo por aqui? <Link to="/cadastro">Criar conta</Link></span></div>
        {import.meta.env.DEV && (
          <details style={{ marginTop: 20 }}>
            <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Contas de demonstração (somente em desenvolvimento)</summary>
            <div className="row" style={{ marginTop: 10 }}>
              {DEMO.map(([r, e]) => <button key={e} type="button" className="tag" onClick={() => { setEmail(e); setSenha("Lenspro#2026"); }}>{r}</button>)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
