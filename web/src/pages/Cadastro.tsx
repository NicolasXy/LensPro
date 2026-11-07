// spiderman
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { mensagemDeErro } from "../api";
import { areaInicial, useAuth } from "../auth";
import { useTitulo } from "../hooks";
import { Campo } from "../components/ui";

/** Mesma politica do servidor (e do greencode): 8+ caracteres, maiuscula, minuscula e numero. */
export function avaliarSenha(s: string): { pontos: number; faltando: string[] } {
  const faltando: string[] = [];
  if (s.length < 8) faltando.push("8 caracteres");
  if (!/[A-Z]/.test(s)) faltando.push("uma maiúscula");
  if (!/[a-z]/.test(s)) faltando.push("uma minúscula");
  if (!/[0-9]/.test(s)) faltando.push("um número");
  return { pontos: 4 - faltando.length, faltando };
}

export default function Cadastro() {
  useTitulo("Criar conta");
  const { cadastrar } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [tipo, setTipo] = useState<"comprador" | "fotografo">(params.get("tipo") === "fotografo" ? "fotografo" : "comprador");
  const [d, setD] = useState({ nome: "", sobrenome: "", email: "", senha: "", confirmar: "", nomeArtistico: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const forca = useMemo(() => avaliarSenha(d.senha), [d.senha]);
  const cor = ["#ff5c5c", "#ff5c5c", "#ffb547", "#c9d94a", "#3ddc97"][forca.pontos];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (forca.faltando.length) return setErro("A senha precisa ter: " + forca.faltando.join(", ") + ".");
    if (d.senha !== d.confirmar) return setErro("As senhas não coincidem.");
    setEnviando(true);
    try {
      const u = await cadastrar({ nome: d.nome, sobrenome: d.sobrenome, email: d.email, senha: d.senha, tipo, nomeArtistico: tipo === "fotografo" && d.nomeArtistico ? d.nomeArtistico : undefined });
      nav(areaInicial(u.papel), { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card wide fade-up">
        <h1>Criar conta</h1>
        <p className="sub">Escolha como você vai usar o LensPro.</p>
        <div className="tipo-conta" role="radiogroup" aria-label="Tipo de conta">
          <button type="button" role="radio" aria-checked={tipo === "comprador"} className={"tipo-opcao" + (tipo === "comprador" ? " ativa" : "")} onClick={() => setTipo("comprador")}>
            <strong>Quero comprar fotos</strong><span>Encontre suas fotos e baixe em alta resolução.</span>
          </button>
          <button type="button" role="radio" aria-checked={tipo === "fotografo"} className={"tipo-opcao" + (tipo === "fotografo" ? " ativa" : "")} onClick={() => setTipo("fotografo")}>
            <strong>Sou fotógrafo</strong><span>Publique fotos, defina preços e receba pelas vendas.</span>
          </button>
        </div>
        {erro && <div className="alert alert-erro" role="alert">{erro}</div>}
        <form onSubmit={enviar}>
          <div className="form-grid">
            <Campo id="r-nome" rotulo="Nome"><input id="r-nome" className="input" value={d.nome} onChange={set("nome")} required minLength={2} maxLength={100} autoComplete="given-name" /></Campo>
            <Campo id="r-sobrenome" rotulo="Sobrenome"><input id="r-sobrenome" className="input" value={d.sobrenome} onChange={set("sobrenome")} required minLength={2} maxLength={100} autoComplete="family-name" /></Campo>
          </div>
          {tipo === "fotografo" && (
            <Campo id="r-art" rotulo="Nome artístico (opcional)" ajuda="Como você aparece para os compradores. Se vazio, usamos seu nome."><input id="r-art" className="input" value={d.nomeArtistico} onChange={set("nomeArtistico")} maxLength={100} /></Campo>
          )}
          <Campo id="r-email" rotulo="E-mail"><input id="r-email" type="email" className="input" value={d.email} onChange={set("email")} required maxLength={150} autoComplete="email" /></Campo>
          <div className="form-grid">
            <Campo id="r-senha" rotulo="Senha">
              <input id="r-senha" type="password" className="input" value={d.senha} onChange={set("senha")} required autoComplete="new-password" />
              <div className="forca" aria-hidden><div style={{ width: `${(forca.pontos / 4) * 100}%`, background: cor }} /></div>
            </Campo>
            <Campo id="r-conf" rotulo="Confirmar senha"><input id="r-conf" type="password" className="input" value={d.confirmar} onChange={set("confirmar")} required autoComplete="new-password" /></Campo>
          </div>
          {d.senha && forca.faltando.length > 0 && <p className="help" style={{ marginTop: -8, marginBottom: 14 }}>Falta: {forca.faltando.join(", ")}.</p>}
          <button className="btn btn-block" disabled={enviando}>{enviando ? "Criando…" : "Criar conta"}</button>
        </form>
        <div className="auth-links"><span>Já tem conta? <Link to="/entrar">Entrar</Link></span></div>
      </div>
    </div>
  );
}
