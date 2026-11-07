// spiderman
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { useAuth } from "../auth";
import { useCart } from "../cart";
import { useTitulo } from "../hooks";
import { brl } from "../format";
import { Foto, Pedido } from "../types";
import { Imagem, Vazio } from "../components/ui";

export default function Carrinho() {
  useTitulo("Carrinho");
  const { usuario } = useAuth();
  const { itens, total, remover, adicionar, limpar } = useCart();
  const nav = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [revalidando, setRevalidando] = useState(false);

  async function finalizar() {
    setErro(null);
    if (!usuario) return nav("/entrar?de=/carrinho");
    setEnviando(true);
    try {
      const p = await api<Pedido>("/pedidos", { corpo: { fotoIds: itens.map((f) => f.id) } });
      nav(`/pagamento/${p.id}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  /** Reconfere cada foto no servidor: remove as que sairam do ar e atualiza precos. */
  async function atualizar() {
    setRevalidando(true);
    for (const f of itens) {
      try {
        const nova = await api<Foto>(`/fotos/${f.id}`, { semAuth: true });
        if (nova.precoCentavos !== f.precoCentavos) {
          remover(f.id);
          adicionar(nova);
        }
      } catch {
        remover(f.id);
      }
    }
    setRevalidando(false);
    setErro(null);
  }

  if (itens.length === 0) {
    return (
      <div className="page"><div className="container">
        <h1 style={{ marginBottom: 24 }}>Carrinho</h1>
        <Vazio titulo="Seu carrinho está vazio"><p style={{ margin: "8px 0 18px" }}>Explore a galeria e adicione as fotos que você quer.</p><Link to="/galeria" className="btn">Ver galeria</Link></Vazio>
      </div></div>
    );
  }

  const naoComprador = usuario && usuario.papel !== "comprador";
  return (
    <div className="page">
      <div className="container">
        <h1 style={{ marginBottom: 24 }}>Carrinho</h1>
        <div className="carrinho-grid">
          <div className="card">
            {itens.map((f) => (
              <div key={f.id} className="item-linha">
                <Imagem src={f.urlMiniatura} alt={f.titulo} />
                <div>
                  <Link to={`/galeria/${f.id}`} className="photo-title">{f.titulo}</Link>
                  <div className="photo-meta">por {f.fotografo.nome}</div>
                </div>
                <div className="row">
                  <span className="price">{brl(f.precoCentavos)}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => remover(f.id)} aria-label={`Remover ${f.titulo}`}>Remover</button>
                </div>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 14 }} onClick={limpar}>Esvaziar carrinho</button>
          </div>
          <aside className="card">
            <h3 style={{ marginBottom: 12 }}>Resumo</h3>
            <div className="resumo-linha"><span>{itens.length} foto(s)</span><span>{brl(total)}</span></div>
            <div className="resumo-linha total"><span>Total</span><span>{brl(total)}</span></div>
            {erro && (
              <div className="alert alert-erro" style={{ marginTop: 14 }}>
                {erro}
                <div style={{ marginTop: 8 }}><button className="btn btn-sm btn-ghost" onClick={atualizar} disabled={revalidando}>{revalidando ? "Atualizando…" : "Atualizar carrinho"}</button></div>
              </div>
            )}
            {naoComprador ? (
              <div className="alert alert-info" style={{ marginTop: 14 }}>Apenas contas de comprador podem finalizar compras.</div>
            ) : (
              <button className="btn btn-block" style={{ marginTop: 18 }} onClick={finalizar} disabled={enviando}>
                {enviando ? "Criando pedido…" : usuario ? "Ir para o pagamento" : "Entrar para comprar"}
              </button>
            )}
            <p className="help" style={{ marginTop: 12 }}>Você receberá os arquivos originais, sem marca d'água, logo após a confirmação do pagamento.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
