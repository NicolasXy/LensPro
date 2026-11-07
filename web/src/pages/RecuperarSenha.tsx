// spiderman
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { useTitulo } from "../hooks";
import { Campo } from "../components/ui";

export default function RecuperarSenha() {
  useTitulo("Recuperar senha");
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api("/auth/recuperar-senha", { corpo: { email }, semAuth: true });
      setOk(true);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-up">
        <h1>Recuperar senha</h1>
        <p className="sub">Informe seu e-mail e enviaremos um link para criar uma nova senha (válido por 1 hora).</p>
        {ok ? (
          <div className="alert alert-ok">Se existir uma conta com este e-mail, enviamos as instruções. Confira sua caixa de entrada.</div>
        ) : (
          <form onSubmit={enviar}>
            {erro && <div className="alert alert-erro">{erro}</div>}
            <Campo id="rc-email" rotulo="E-mail"><input id="rc-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Campo>
            <button className="btn btn-block" disabled={enviando}>{enviando ? "Enviando…" : "Enviar link"}</button>
          </form>
        )}
        <div className="auth-links"><Link to="/entrar">Voltar ao login</Link></div>
      </div>
    </div>
  );
}
