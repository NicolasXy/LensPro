// spiderman
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDeErro } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { centavosParaReais, reaisParaCentavos, tamanhoArquivo } from "../../format";
import { Evento, FotoGerenciavel, Pagina } from "../../types";
import { Campo } from "../../components/ui";
import { useToast } from "../../toast";

interface Item {
  chave: number;
  arquivo: File;
  previa: string;
  titulo: string;
  preco: string;
  tags: string;
  descricao: string;
  eventoId: string;
  estado: "pronto" | "enviando" | "ok" | "erro";
  erro?: string;
  resultado?: FotoGerenciavel;
}

const MAX_MB = 25;
let contador = 0;

/** Publicacao de fotos: preco por foto, evento opcional; o servidor aplica a marca d'agua e cifra o original. */
export default function EstudioPublicar() {
  useTitulo("Publicar fotos");
  const avisar = useToast();
  const eventos = useDados(() => api<Pagina<Evento>>("/estudio/eventos", { query: { tamanhoPagina: 100 } }), []);
  const [itens, setItens] = useState<Item[]>([]);
  const [precoPadrao, setPrecoPadrao] = useState("19,90");
  const [eventoPadrao, setEventoPadrao] = useState("");
  const [sobre, setSobre] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => () => itens.forEach((i) => URL.revokeObjectURL(i.previa)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function adicionar(arquivos: FileList | File[]) {
    const novos: Item[] = [];
    for (const f of Array.from(arquivos)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { avisar(`“${f.name}” não é JPEG, PNG ou WebP.`, "erro"); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { avisar(`“${f.name}” passa de ${MAX_MB} MB.`, "erro"); continue; }
      novos.push({
        chave: ++contador, arquivo: f, previa: URL.createObjectURL(f),
        titulo: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 150),
        preco: precoPadrao, tags: "", descricao: "", eventoId: eventoPadrao, estado: "pronto",
      });
    }
    setItens((a) => [...a, ...novos].slice(0, 30));
  }

  const alterar = (chave: number, p: Partial<Item>) => setItens((a) => a.map((i) => (i.chave === chave ? { ...i, ...p } : i)));
  const remover = (chave: number) => setItens((a) => a.filter((i) => i.chave !== chave));
  const soltar = (e: DragEvent) => { e.preventDefault(); setSobre(false); adicionar(e.dataTransfer.files); };

  async function enviarUma(i: Item) {
    const cent = reaisParaCentavos(i.preco);
    if (!Number.isFinite(cent) || cent < 100 || cent > 1_000_000) return alterar(i.chave, { estado: "erro", erro: "Preço deve estar entre R$ 1,00 e R$ 10.000,00." });
    if (i.titulo.trim().length < 3) return alterar(i.chave, { estado: "erro", erro: "Informe um título (mínimo 3 caracteres)." });
    alterar(i.chave, { estado: "enviando", erro: undefined });
    const f = new FormData();
    // Campos de texto ANTES do arquivo (o servidor le o multipart em fluxo).
    f.append("titulo", i.titulo.trim());
    f.append("precoCentavos", String(cent));
    if (i.descricao.trim()) f.append("descricao", i.descricao.trim());
    if (i.tags.trim()) f.append("tags", i.tags);
    if (i.eventoId) f.append("eventoId", i.eventoId);
    f.append("arquivo", i.arquivo);
    try {
      const r = await api<FotoGerenciavel>("/estudio/fotos", { form: f });
      alterar(i.chave, { estado: "ok", resultado: r });
    } catch (e) {
      alterar(i.chave, { estado: "erro", erro: mensagemDeErro(e) });
    }
  }

  async function enviarTodas() {
    setEnviando(true);
    for (const i of itens.filter((x) => x.estado === "pronto" || x.estado === "erro")) await enviarUma(i);
    setEnviando(false);
  }

  const pendentes = itens.filter((i) => i.estado === "pronto" || i.estado === "erro").length;
  const publicadas = itens.filter((i) => i.estado === "ok").length;

  return (
    <>
      <div className="area-top"><div><h1>Publicar fotos</h1><p>Defina o preço de cada foto. Ao publicar, ela aparece na vitrine <b>com marca d'água</b>; o original fica guardado cifrado.</p></div></div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-grid">
          <Campo id="pp" rotulo="Preço padrão (R$)" ajuda="Aplicado às novas fotos adicionadas; você ajusta foto a foto."><input id="pp" className="input" value={precoPadrao} onChange={(e) => setPrecoPadrao(e.target.value)} inputMode="decimal" /></Campo>
          <Campo id="ep" rotulo="Evento padrão (opcional)">
            <select id="ep" className="select" value={eventoPadrao} onChange={(e) => setEventoPadrao(e.target.value)}>
              <option value="">Sem evento</option>
              {eventos.dados?.itens.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
            </select>
          </Campo>
        </div>
        <div className={"dropzone" + (sobre ? " sobre" : "")} role="button" tabIndex={0}
          onClick={() => entrada.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && entrada.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={soltar}>
          <p><b>Arraste as fotos aqui</b> ou clique para escolher</p>
          <p className="help">JPEG, PNG ou WebP · até {MAX_MB} MB cada · até 30 por vez · mínimo 600 px no menor lado</p>
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) adicionar(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {itens.length > 0 && (
        <>
          <div className="stack">
            {itens.map((i) => (
              <div key={i.chave} className="upload-item">
                <img src={i.resultado ? i.resultado.urlMiniatura : i.previa} alt="" />
                <div>
                  {i.estado === "ok" ? (
                    <>
                      <span className="badge badge-ok">Publicada com marca d'água</span>
                      <p style={{ marginTop: 8 }}><b>{i.resultado!.titulo}</b></p>
                      <p className="help">Esta é a versão que o público vê. <Link to={`/galeria/${i.resultado!.id}`} style={{ textDecoration: "underline" }}>Ver na vitrine</Link></p>
                    </>
                  ) : (
                    <>
                      <div className="form-grid">
                        <Campo id={`t${i.chave}`} rotulo="Título"><input id={`t${i.chave}`} className="input" value={i.titulo} onChange={(e) => alterar(i.chave, { titulo: e.target.value })} disabled={i.estado === "enviando"} maxLength={150} /></Campo>
                        <Campo id={`p${i.chave}`} rotulo="Preço (R$)"><input id={`p${i.chave}`} className="input" value={i.preco} onChange={(e) => alterar(i.chave, { preco: e.target.value })} disabled={i.estado === "enviando"} inputMode="decimal" /></Campo>
                        <Campo id={`e${i.chave}`} rotulo="Evento">
                          <select id={`e${i.chave}`} className="select" value={i.eventoId} onChange={(e) => alterar(i.chave, { eventoId: e.target.value })} disabled={i.estado === "enviando"}>
                            <option value="">Sem evento</option>
                            {eventos.dados?.itens.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
                          </select>
                        </Campo>
                        <Campo id={`g${i.chave}`} rotulo="Tags (separadas por vírgula)"><input id={`g${i.chave}`} className="input" value={i.tags} onChange={(e) => alterar(i.chave, { tags: e.target.value })} disabled={i.estado === "enviando"} placeholder="casamento, praia" /></Campo>
                      </div>
                      <Campo id={`d${i.chave}`} rotulo="Descrição (opcional)"><input id={`d${i.chave}`} className="input" value={i.descricao} onChange={(e) => alterar(i.chave, { descricao: e.target.value })} disabled={i.estado === "enviando"} maxLength={1000} /></Campo>
                      <span className="help">{i.arquivo.name} · {tamanhoArquivo(i.arquivo.size)}</span>
                      {i.estado === "enviando" && <div className="progress"><div style={{ width: "70%" }} /></div>}
                      {i.erro && <div className="alert alert-erro" style={{ marginTop: 10, marginBottom: 0 }}>{i.erro}</div>}
                    </>
                  )}
                </div>
                {i.estado !== "enviando" && i.estado !== "ok" && <button className="btn btn-sm btn-ghost" onClick={() => remover(i.chave)} aria-label="Remover da lista">Remover</button>}
              </div>
            ))}
          </div>
          <div className="row-between" style={{ marginTop: 24 }}>
            <span className="muted">{publicadas} publicada(s) · {pendentes} aguardando</span>
            <div className="row">
              {publicadas > 0 && <Link to="/estudio/fotos" className="btn btn-ghost">Ver minhas fotos</Link>}
              <button className="btn" disabled={enviando || pendentes === 0} onClick={enviarTodas}>{enviando ? "Publicando…" : `Publicar ${pendentes} foto(s)`}</button>
            </div>
          </div>
        </>
      )}
      <p className="help" style={{ marginTop: 20 }}>Valor de exemplo: R$ {centavosParaReais(1990)}. A taxa da plataforma é descontada do valor de cada venda e aparece em “Vendas”.</p>
    </>
  );
}
