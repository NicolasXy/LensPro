// spiderman
import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Foto, Pagina } from "../types";
import { brl } from "../format";

/**
 * Foto da vitrine com protecao contra salvar/arrastar: a imagem fica sob uma camada transparente que
 * recebe o clique direito, o arraste e o toque longo (sem "Salvar imagem como..."), e some na impressao.
 * E dissuasao de uso casual; a protecao real e a marca d'agua gravada nos pixels pelo servidor,
 * a URL assinada com validade e o original que nunca sai do servidor antes do pagamento.
 */
export function Imagem({ src, alt, prioridade }: { src: string; alt: string; prioridade?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <span className="foto-protegida foto-falhou" role="img" aria-label={alt}>Recarregue a página para ver a imagem</span>;
  return (
    <span className="foto-protegida">
      <img src={src} alt={alt} draggable={false} loading={prioridade ? "eager" : "lazy"} decoding="async" onError={() => setFalhou(true)} />
      <span className="escudo" aria-hidden onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
    </span>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Carregando" />;
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <h3 style={{ marginBottom: 6 }}>{titulo}</h3>
      {children}
    </div>
  );
}

export function Erro({ texto, onRetry }: { texto: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-erro row-between">
      <span>{texto}</span>
      {onRetry && <button className="btn btn-sm btn-ghost" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}

export function Campo({ rotulo, ajuda, erro, children, id }: { rotulo: string; ajuda?: string; erro?: string | null; children: ReactNode; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {ajuda && !erro && <span className="help">{ajuda}</span>}
      {erro && <span className="field-error" role="alert">{erro}</span>}
    </div>
  );
}

export function Modal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

export function Paginacao({ pagina, onMudar }: { pagina: Pagina<unknown>; onMudar: (p: number) => void }) {
  if (pagina.totalPaginas <= 1) return null;
  return (
    <nav className="paginacao" aria-label="Paginação">
      <button className="btn btn-sm btn-ghost" disabled={pagina.pagina <= 1} onClick={() => onMudar(pagina.pagina - 1)}>Anterior</button>
      <span>Página {pagina.pagina} de {pagina.totalPaginas}</span>
      <button className="btn btn-sm btn-ghost" disabled={pagina.pagina >= pagina.totalPaginas} onClick={() => onMudar(pagina.pagina + 1)}>Próxima</button>
    </nav>
  );
}

export function Iniciais({ nome, grande }: { nome: string; grande?: boolean }) {
  const i = nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <div className={"avatar" + (grande ? " avatar-lg" : "")} aria-hidden>{i}</div>;
}

export function Skeletons({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-fotos">
      {Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  );
}

/** Cartao de foto da vitrine: sempre mostra a miniatura JA com marca d'agua (vinda do servidor). */
export function FotoCard({ foto, acao }: { foto: Foto; acao?: ReactNode }) {
  return (
    <article className="photo-card">
      <Link to={`/galeria/${foto.id}`} className="photo-thumb" aria-label={foto.titulo}>
        <Imagem src={foto.urlMiniatura} alt={foto.titulo} />
      </Link>
      <div className="photo-body">
        <Link to={`/galeria/${foto.id}`} className="photo-title">{foto.titulo}</Link>
        <span className="photo-meta">por <Link to={`/fotografos/${foto.fotografo.id}`}>{foto.fotografo.nome}</Link>{foto.evento ? ` · ${foto.evento.titulo}` : ""}</span>
        <div className="photo-foot">
          <span className="price">{brl(foto.precoCentavos)}</span>
          {acao}
        </div>
      </div>
    </article>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const mapa: Record<string, [string, string]> = {
    publicada: ["Publicada", "badge-ok"],
    oculta: ["Oculta", "badge-warn"],
    removida: ["Removida", "badge-danger"],
    pendente: ["Aguardando pagamento", "badge-warn"],
    pago: ["Pago", "badge-ok"],
    cancelado: ["Cancelado", "badge-muted"],
    expirado: ["Expirado", "badge-muted"],
    aprovado: ["Aprovado", "badge-ok"],
    recusado: ["Recusado", "badge-danger"],
  };
  const [txt, cls] = mapa[status] ?? [status, ""];
  return <span className={"badge " + cls}>{txt}</span>;
}
