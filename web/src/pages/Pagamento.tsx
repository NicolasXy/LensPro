// spiderman
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { useCart } from "../cart";
import { useDados, useTitulo } from "../hooks";
import { brl } from "../format";
import { Pedido } from "../types";
import { cifrarCartao } from "../pagseguro";
import { Erro, Imagem, Spinner } from "../components/ui";
import { Campo } from "../components/ui";
import { useToast } from "../toast";

type Metodo = "pix" | "cartao";

function luhn(n: string): boolean {
  const d = n.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let soma = 0;
  let dobrar = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let x = d.charCodeAt(i) - 48;
    if (dobrar) { x *= 2; if (x > 9) x -= 9; }
    soma += x;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

const agrupar = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
const formatarValidade = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
};

const formatarCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
};

function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/** QR Code do Pix gerado no navegador a partir do "copia e cola" (biblioteca carregada so quando necessario). */
function QrPix({ codigo }: { codigo: string }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    import("qrcode").then((m) => m.toDataURL(codigo, { margin: 1, width: 220, errorCorrectionLevel: "M" })).then((u) => ativo && setImg(u)).catch(() => ativo && setImg(null));
    return () => { ativo = false; };
  }, [codigo]);
  return img ? <img className="qr" src={img} alt="QR Code do Pix" width={170} height={170} /> : null;
}

function Contagem({ ate, aoZerar }: { ate: string; aoZerar: () => void }) {
  const [resta, setResta] = useState(() => new Date(ate).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const r = new Date(ate).getTime() - Date.now();
      setResta(r);
      if (r <= 0) { clearInterval(t); aoZerar(); }
    }, 1000);
    return () => clearInterval(t);
  }, [ate, aoZerar]);
  const s = Math.max(0, Math.floor(resta / 1000));
  return <span className="badge badge-warn">Preços reservados por {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

/** Pagina de pagamento: resumo do pedido, escolha Pix/cartao, confirmacao e liberacao dos downloads. */
export default function Pagamento() {
  useTitulo("Pagamento");
  const { id } = useParams();
  const nav = useNavigate();
  const { limpar } = useCart();
  const avisar = useToast();
  const ped = useDados(() => api<Pedido>(`/pedidos/${id}`), [id]);
  const [metodo, setMetodo] = useState<Metodo>("pix");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cartao, setCartao] = useState({ numero: "", nome: "", validade: "", cvv: "" });
  const [cpf, setCpf] = useState("");
  const cfg = useDados(() => api<{ gateway: "simulado" | "pagseguro"; chavePublicaCartao: string | null }>("/pagamento/config"), []);
  const real = cfg.dados?.gateway === "pagseguro";
  const [copiado, setCopiado] = useState(false);
  const p = ped.dados;

  // Compra concluida: o carrinho ja cumpriu o papel.
  useEffect(() => {
    if (p?.status === "pago") limpar();
  }, [p?.status, limpar]);

  const pixAtivo = useMemo(() => p?.pagamentos.find((g) => g.metodo === "pix" && g.status === "pendente") ?? null, [p]);
  const aguardando = !!p && p.status === "pendente" && p.pagamentos.some((g) => g.status === "pendente");
  const { recarregar: recarregarPedido, setDados: setPedido } = ped;

  // Pix (ou cartao em analise) aguardando: confere sozinho a cada 5 s. Com o PagSeguro pergunta ao gateway
  // (cobre webhook atrasado e ambientes sem URL publica); no simulado so recarrega o pedido.
  useEffect(() => {
    if (!aguardando || !cfg.dados) return;
    const t = window.setInterval(async () => {
      try {
        if (cfg.dados!.gateway === "pagseguro") setPedido(await api<Pedido>(`/pedidos/${id}/pagamento/verificar`, { metodo: "POST" }));
        else recarregarPedido();
      } catch { /* proxima tentativa */ }
    }, 5000);
    return () => window.clearInterval(t);
  }, [aguardando, cfg.dados, id, recarregarPedido, setPedido]);

  const ultimaRecusa = p?.pagamentos[0]?.status === "recusado" ? p.pagamentos[0] : null;

  async function pagarPix() {
    setErro(null);
    if (real && !cpfValido(cpf)) return setErro("Informe um CPF válido.");
    setProcessando(true);
    try {
      ped.setDados(await api<Pedido>(`/pedidos/${id}/pagamento`, { corpo: { metodo: "pix", cpf: real ? cpf : undefined } }));
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setProcessando(false); }
  }

  async function simularPix() {
    setErro(null);
    setProcessando(true);
    try {
      ped.setDados(await api<Pedido>(`/pedidos/${id}/pagamento/simular-pix`, { metodo: "POST" }));
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setProcessando(false); }
  }

  async function pagarCartao(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!luhn(cartao.numero)) return setErro("Número de cartão inválido.");
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cartao.validade)) return setErro("Validade deve estar no formato MM/AA.");
    if (real && !cpfValido(cpf)) return setErro("Informe um CPF válido (do titular do cartão).");
    setProcessando(true);
    try {
      // PagSeguro: o cartao e cifrado AQUI, no navegador; o servidor so recebe o texto cifrado.
      const corpoCartao = real
        ? { nome: cartao.nome, criptografado: await cifrarCartao(cfg.dados!.chavePublicaCartao!, cartao) }
        : { ...cartao, numero: cartao.numero.replace(/\D/g, "") };
      const r = await api<Pedido>(`/pedidos/${id}/pagamento`, { corpo: { metodo: "cartao", cpf: real ? cpf : undefined, cartao: corpoCartao } });
      ped.setDados(r);
      setCartao({ numero: "", nome: "", validade: "", cvv: "" }); // nada do cartao fica em memoria apos o envio
      if (r.status !== "pago" && r.pagamentos[0]?.status === "recusado") setErro(r.pagamentos[0].motivoRecusa ?? "Pagamento recusado. Tente outro cartão.");
      else if (r.status !== "pago") avisar("Pagamento em análise pelo banco. Esta página atualiza sozinha.");
    } catch (e2) { setErro(mensagemDeErro(e2)); } finally { setProcessando(false); }
  }

  async function copiar(txt: string) {
    try { await navigator.clipboard.writeText(txt); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { avisar("Copie o código manualmente.", "erro"); }
  }

  async function cancelar() {
    try { await api(`/pedidos/${id}/cancelar`, { metodo: "POST" }); avisar("Pedido cancelado."); nav("/carrinho"); } catch (e) { setErro(mensagemDeErro(e)); }
  }

  if (ped.carregando && !p) return <div className="page"><Spinner /></div>;
  if (ped.erro || !p) return <div className="page"><div className="container"><Erro texto={ped.erro ?? "Pedido não encontrado."} /></div></div>;

  const etapa = p.status === "pago" ? 3 : 2;
  const passos = ["Carrinho", "Pagamento", "Download"];

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1000 }}>
        <div className="passos" aria-label="Etapas da compra">
          {passos.map((t, i) => <div key={t} className={"passo" + (i + 1 === etapa ? " ativo" : i + 1 < etapa ? " feito" : "")}><b>{i + 1}</b>{t}</div>)}
        </div>

        {p.status === "pago" && (
          <div className="card sucesso fade-up">
                <h1>Pagamento confirmado!</h1>
            <p className="muted" style={{ margin: "10px 0 24px" }}>Suas {p.itens.length} foto(s) já estão liberadas, sem marca d'água.</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link to="/conta/compras" className="btn">Baixar minhas fotos</Link>
              <Link to="/galeria" className="btn btn-ghost">Continuar explorando</Link>
            </div>
          </div>
        )}

        {(p.status === "cancelado" || p.status === "expirado") && (
          <div className="card sucesso">
            <h1>{p.status === "expirado" ? "A reserva expirou" : "Pedido cancelado"}</h1>
            <p className="muted" style={{ margin: "10px 0 24px" }}>Volte ao carrinho para gerar um novo pedido.</p>
            <Link to="/carrinho" className="btn">Voltar ao carrinho</Link>
          </div>
        )}

        {p.status === "pendente" && (
          <div className="carrinho-grid">
            <div className="card">
              <div className="row-between" style={{ marginBottom: 18 }}>
                <h2>Forma de pagamento</h2>
                <Contagem ate={p.expiraEm} aoZerar={ped.recarregar} />
              </div>
              {cfg.dados && !real && <div className="aviso-teste"><b>Ambiente de demonstração:</b> nenhum valor é cobrado. Cartão <code>4242 4242 4242 4242</code> aprova; <code>4000 0000 0000 0002</code> é recusado; use qualquer validade futura e CVV.</div>}
              {cfg.erro && <div className="alert alert-erro" role="alert">{cfg.erro}</div>}
              {real && <p className="help" style={{ marginBottom: 14 }}>Pagamento processado pelo <b>PagSeguro</b>. Seus dados de cartão são cifrados no navegador e nunca passam pelo LensPro.</p>}

              <div className="metodos" role="radiogroup" aria-label="Forma de pagamento">
                <button type="button" role="radio" aria-checked={metodo === "pix"} className={"metodo" + (metodo === "pix" ? " ativa" : "")} onClick={() => setMetodo("pix")}><strong>Pix</strong><span>Aprovação na hora</span></button>
                <button type="button" role="radio" aria-checked={metodo === "cartao"} className={"metodo" + (metodo === "cartao" ? " ativa" : "")} onClick={() => setMetodo("cartao")}><strong>Cartão de crédito</strong><span>Visa, Mastercard, Elo…</span></button>
              </div>

              {erro && <div className="alert alert-erro" role="alert">{erro}</div>}
              {!erro && ultimaRecusa && metodo === "cartao" && <div className="alert alert-erro">Último pagamento recusado: {ultimaRecusa.motivoRecusa}</div>}

              {metodo === "pix" ? (
                pixAtivo?.pixCopiaECola ? (
                  <div className="stack">
                    <p>Abra o app do seu banco, escolha <b>Pix copia e cola</b> e cole o código abaixo:</p>
                    <div className="row" style={{ alignItems: "flex-start" }}>
                      <QrPix codigo={pixAtivo.pixCopiaECola} />
                      <div className="pix-box" style={{ flex: 1, minWidth: 200 }} aria-label="Código Pix copia e cola">{pixAtivo.pixCopiaECola}</div>
                    </div>
                    <div className="row">
                      <button className="btn btn-ghost" onClick={() => copiar(pixAtivo.pixCopiaECola!)}>{copiado ? "Copiado!" : "Copiar código"}</button>
                      {!real && <button className="btn" onClick={simularPix} disabled={processando}>{processando ? "Confirmando…" : "Simular pagamento (teste)"}</button>}
                    </div>
                    <p className="help">{real ? "Assim que o banco confirmar o Pix, esta página atualiza sozinha e libera o download." : "No ambiente de demonstração use “Simular pagamento”. Com o PagSeguro, o banco confirma sozinho."}</p>
                  </div>
                ) : (
                  <div className="stack">
                    {real && <Campo id="p-cpf-pix" rotulo="CPF do pagador" ajuda="Exigido pelo PagSeguro para emitir o Pix. Não é guardado pelo LensPro."><input id="p-cpf-pix" className="input" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" /></Campo>}
                    <button className="btn btn-block" onClick={pagarPix} disabled={processando || !cfg.dados}>{processando ? "Gerando…" : `Gerar Pix de ${brl(p.totalCentavos)}`}</button>
                  </div>
                )
              ) : (
                <form onSubmit={pagarCartao} autoComplete="off">
                  <div className="cartao-preview" aria-hidden>
                    <div className="linha"><span>LensPro</span><span>crédito</span></div>
                    <div className="num">{cartao.numero ? agrupar(cartao.numero).padEnd(19, "•") : "•••• •••• •••• ••••"}</div>
                    <div className="linha"><span>{cartao.nome || "Nome no cartão"}</span><span>{cartao.validade || "MM/AA"}</span></div>
                  </div>
                  <Campo id="p-num" rotulo="Número do cartão"><input id="p-num" className="input" inputMode="numeric" autoComplete="cc-number" value={agrupar(cartao.numero)} onChange={(e) => setCartao({ ...cartao, numero: e.target.value })} required placeholder="0000 0000 0000 0000" /></Campo>
                  <Campo id="p-nome" rotulo="Nome impresso no cartão"><input id="p-nome" className="input" autoComplete="cc-name" value={cartao.nome} onChange={(e) => setCartao({ ...cartao, nome: e.target.value.toUpperCase() })} required minLength={2} maxLength={60} /></Campo>
                  <div className="form-grid">
                    <Campo id="p-val" rotulo="Validade"><input id="p-val" className="input" inputMode="numeric" autoComplete="cc-exp" value={cartao.validade} onChange={(e) => setCartao({ ...cartao, validade: formatarValidade(e.target.value) })} required placeholder="MM/AA" maxLength={5} /></Campo>
                    <Campo id="p-cvv" rotulo="CVV"><input id="p-cvv" className="input" inputMode="numeric" autoComplete="cc-csc" value={cartao.cvv} onChange={(e) => setCartao({ ...cartao, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })} required minLength={3} maxLength={4} type="password" /></Campo>
                  </div>
                  {real && <Campo id="p-cpf" rotulo="CPF do titular"><input id="p-cpf" className="input" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} required placeholder="000.000.000-00" /></Campo>}
                  <button className="btn btn-block" disabled={processando || !cfg.dados || (real && !cfg.dados.chavePublicaCartao)}>{processando ? "Processando…" : `Pagar ${brl(p.totalCentavos)}`}</button>
                  <p className="help" style={{ marginTop: 10 }}>Guardamos apenas a bandeira e os 4 últimos dígitos. Número, validade, CVV e CPF nunca são armazenados.</p>
                </form>
              )}
            </div>

            <aside className="card">
              <h3 style={{ marginBottom: 12 }}>Seu pedido</h3>
              {p.itens.map((i) => (
                <div key={i.id} className="item-linha" style={{ gridTemplateColumns: "72px 1fr auto", padding: "10px 0" }}>
                  <Imagem src={i.foto.urlMiniatura} alt="" />
                  <div><div className="photo-title" style={{ fontSize: "0.9rem" }}>{i.foto.titulo}</div><div className="photo-meta">{i.foto.fotografo.nome}</div></div>
                  <span className="price" style={{ fontSize: "0.9rem" }}>{brl(i.precoCentavos)}</span>
                </div>
              ))}
              <div className="resumo-linha total"><span>Total</span><span>{brl(p.totalCentavos)}</span></div>
              <button className="btn btn-sm btn-ghost btn-block" style={{ marginTop: 14 }} onClick={cancelar}>Cancelar pedido</button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
