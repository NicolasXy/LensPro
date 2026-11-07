// spiderman
import { useCallback, useEffect, useRef, useState } from "react";
import { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useDados, useTitulo } from "../hooks";
import { brl } from "../format";
import { Destaques, Foto, Pagina, PerfilPublico } from "../types";
import { FotoCard, Imagem, Iniciais, Skeletons } from "../components/ui";
import BotaoCarrinho from "../components/BotaoCarrinho";

const INTERVALO_MS = 5500;

/** Galeria rotativa: troca sozinha, pausa ao passar o mouse/focar/tocar, tem setas, pontos e respeita "reduzir movimento". */
function Carrossel({ fotos }: { fotos: Foto[] }) {
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);
  const reduz = useRef(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const n = fotos.length;
  const ir = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (pausado || n < 2 || reduz.current) return;
    const t = window.setInterval(() => ir(1), INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [pausado, n, ir]);

  if (n === 0) return null;
  const atual = fotos[Math.min(i, n - 1)];
  return (
    <div
      className="carrossel"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Fotos recém-publicadas"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      onTouchStart={() => setPausado(true)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") ir(1); if (e.key === "ArrowLeft") ir(-1); }}
    >
      <div className="carrossel-quadro">
      <div className="carrossel-palco">
        {fotos.map((f, k) => (
          <Link key={f.id} to={`/galeria/${f.id}`} className={"slide" + (k === i ? " ativo" : "")} aria-hidden={k !== i} tabIndex={k === i ? 0 : -1} aria-label={`${f.titulo}, por ${f.fotografo.nome}`}>
            <Imagem src={f.urlPreview} alt={f.titulo} prioridade={k === 0} />
          </Link>
        ))}
        {n > 1 && (
          <>
            <button type="button" className="seta seta-esq" aria-label="Foto anterior" onClick={() => ir(-1)}>Anterior</button>
            <button type="button" className="seta seta-dir" aria-label="Próxima foto" onClick={() => ir(1)}>Próxima</button>
          </>
        )}
      </div>
      <div className="slide-legenda" aria-live="polite">
        <small>Em destaque</small>
        <strong>{atual.titulo}</strong>
        <span>por {atual.fotografo.nome} · {brl(atual.precoCentavos)}</span>
      </div>
      </div>
      {n > 1 && (
        <div className="pontos" role="tablist" aria-label="Escolher foto">
          {fotos.map((f, k) => <button key={f.id} type="button" role="tab" aria-selected={k === i} aria-label={`Foto ${k + 1}`} className={k === i ? "ativo" : ""} onClick={() => setI(k)} />)}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  useTitulo("Fotografias de eventos, esportes e ensaios");
  const { usuario } = useAuth();
  const nav = useNavigate();
  const [busca, setBusca] = useState("");
  const buscar = (e: FormEvent) => { e.preventDefault(); nav(busca.trim() ? `/galeria?q=${encodeURIComponent(busca.trim())}` : "/galeria"); };
  const home = useDados(() => api<Destaques>("/destaques", { semAuth: true }), []);
  const fotografos = useDados(() => api<Pagina<PerfilPublico>>("/fotografos", { query: { tamanhoPagina: 4 }, semAuth: true }), []);
  const d = home.dados;
  const destaques = d?.destaques ?? [];
  const [principal, ...demais] = destaques;

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="fade-up">
            <div className="eyebrow">Plataforma de fotos de eventos</div>
            <h1>Sua foto do evento, <em>encontrada</em> em segundos.</h1>
            <p className="lead">Encontre as melhores fotos de eventos, esportes e ensaios direto de quem fotografou, ou venda o seu trabalho com proteção contra cópias.</p>
            <form className="busca-hero" onSubmit={buscar} role="search">
              <label htmlFor="busca-home" className="eyebrow eyebrow-sem-ponto">Buscar foto ou evento</label>
              <div className="busca-pilula">
                <input id="busca-home" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título, evento, tag ou fotógrafo" autoComplete="off" />
                <button className="btn btn-rosa" type="submit">Buscar</button>
              </div>
              <div className="populares"><span>Populares:</span>{["Maratona", "Casamento", "Formatura"].map((t) => <Link key={t} to={`/galeria?q=${t}`} className="tag">{t}</Link>)}</div>
            </form>
            <div className="hero-buttons">
              <Link to="/galeria" className="btn">Explorar fotos</Link>
              {!usuario && <Link to="/cadastro?tipo=fotografo" className="btn btn-outline">Quero vender minhas fotos</Link>}
              {usuario?.papel === "fotografo" && <Link to="/estudio/publicar" className="btn btn-outline">Publicar fotos</Link>}
            </div>
          </div>
          <div className="fade-up">
            {home.carregando ? <div className="skeleton carrossel-esqueleto" /> : <Carrossel fotos={d?.rotativas ?? []} />}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div><div className="eyebrow">Vitrine</div><h2>Trabalhos em destaque</h2><p>Os mais procurados da vitrine, de fotógrafos diferentes.</p></div>
            <Link to="/galeria?ordem=recentes" className="btn btn-ghost btn-sm">Ver galeria completa</Link>
          </div>
          {home.carregando ? <Skeletons n={4} /> : destaques.length === 0 ? (
            <p className="muted">Ainda não há fotos publicadas. Volte em breve!</p>
          ) : (
            <div className="destaques">
              {principal && (
                <article className="destaque-principal">
                  <Link to={`/galeria/${principal.id}`} className="destaque-img" aria-label={principal.titulo}><Imagem src={principal.urlPreview} alt={principal.titulo} /></Link>
                  <div className="destaque-info">
                    <span className="badge">Destaque</span>
                    <Link to={`/galeria/${principal.id}`} className="destaque-titulo">{principal.titulo}</Link>
                    <span className="muted">por <Link to={`/fotografos/${principal.fotografo.id}`}>{principal.fotografo.nome}</Link></span>
                    <div className="row" style={{ marginTop: 8 }}><span className="price-lg">{brl(principal.precoCentavos)}</span><BotaoCarrinho foto={principal} /></div>
                  </div>
                </article>
              )}
              <div className="grid grid-fotos">
                {demais.map((f) => <FotoCard key={f.id} foto={f} acao={<BotaoCarrinho foto={f} />} />)}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container grid grid-3">
          <div className="feature"><h3>Prévia protegida</h3><p>As fotos anunciadas têm marca d'água gravada na imagem, baixa resolução e links com validade. O original só é liberado depois do pagamento.</p></div>
          <div className="feature"><h3>Entrega imediata</h3><p>Pagou com Pix ou cartão pelo PagSeguro, baixou. Suas compras ficam guardadas na sua conta.</p></div>
          <div className="feature"><h3>Você define o preço</h3><p>Fotógrafos publicam, escolhem o valor de cada foto e acompanham as vendas em um painel próprio.</p></div>
        </div>
      </section>

      {(fotografos.dados?.itens.length ?? 0) > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <div><div className="eyebrow">Time</div><h2>Fotógrafos parceiros</h2><p>Conheça quem está por trás das imagens.</p></div>
              <Link to="/fotografos" className="btn btn-ghost btn-sm">Ver todos</Link>
            </div>
            <div className="grid grid-3">
              {fotografos.dados!.itens.map((p) => (
                <Link key={p.id} to={`/fotografos/${p.id}`} className="card row" style={{ flexWrap: "nowrap" }}>
                  <Iniciais nome={p.nomeArtistico} />
                  <div><strong>{p.nomeArtistico}</strong><div className="photo-meta">{p.especialidade ?? "Fotografia"} · {p.totalFotos} foto(s)</div></div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container stats">
          <div className="stat"><div className="n">{d?.estatisticas.fotos ?? "—"}</div><span>Fotos à venda</span></div>
          <div className="stat"><div className="n">{d?.estatisticas.fotografos ?? "—"}</div><span>Fotógrafos ativos</span></div>
          <div className="stat"><div className="n">{d?.estatisticas.eventos ?? "—"}</div><span>Eventos cobertos</span></div>
        </div>
      </section>

      {!usuario && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container cta">
            <h2>Pronto para elevar seu trabalho?</h2>
            <p>Crie sua conta gratuitamente: como fotógrafo para vender, ou como comprador para encontrar suas fotos.</p>
            <Link to="/cadastro" className="btn">Criar conta</Link>
          </div>
        </section>
      )}
    </>
  );
}
