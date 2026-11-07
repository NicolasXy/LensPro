// spiderman
import { FormEvent, useState } from "react";
import { api, mensagemDeErro } from "../api";
import { useTitulo } from "../hooks";
import { Campo } from "../components/ui";

export default function Contato() {
  useTitulo("Contato");
  const [d, setD] = useState({ nome: "", email: "", mensagem: "", site: "" });
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api("/contato", { corpo: d, semAuth: true });
      setOk(true);
      setD({ nome: "", email: "", mensagem: "", site: "" });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <div className="page-head"><h1>Fale conosco</h1><p>Nossa equipe está pronta para ajudar.</p></div>
        <div className="grid grid-3" style={{ marginBottom: 28 }}>
          <div className="feature"><h3>E-mail</h3><p>suporte@lenspro.com</p></div>
          <div className="feature"><h3>Telefone</h3><p>(11) 99999-9999</p></div>
          <div className="feature"><h3>Localização</h3><p>São Paulo - SP</p></div>
        </div>
        <form className="card" onSubmit={enviar}>
          {ok && <div className="alert alert-ok">Mensagem enviada com sucesso! Entraremos em contato em breve.</div>}
          {erro && <div className="alert alert-erro">{erro}</div>}
          <div className="form-grid">
            <Campo id="c-nome" rotulo="Nome"><input id="c-nome" className="input" value={d.nome} onChange={set("nome")} required minLength={2} maxLength={100} placeholder="Seu nome" /></Campo>
            <Campo id="c-email" rotulo="E-mail"><input id="c-email" type="email" className="input" value={d.email} onChange={set("email")} required maxLength={150} placeholder="seu@email.com" /></Campo>
          </div>
          <Campo id="c-msg" rotulo="Mensagem"><textarea id="c-msg" className="textarea" rows={6} value={d.mensagem} onChange={set("mensagem")} required minLength={10} maxLength={3000} placeholder="Escreva sua mensagem…" /></Campo>
          {/* Campo-isca anti-robo: invisivel para pessoas. */}
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden value={d.site} onChange={set("site")} name="site" />
          <button className="btn" disabled={enviando}>{enviando ? "Enviando…" : "Enviar mensagem"}</button>
        </form>
      </div>
    </div>
  );
}
