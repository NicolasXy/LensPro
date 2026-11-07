// spiderman
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, baixarArquivo, mensagemDeErro } from "../../api";
import { useDados } from "../../hooks";
import { dataBr } from "../../format";
import { Compra, Pagina } from "../../types";
import { Erro, Imagem, Paginacao, Spinner, Vazio } from "../../components/ui";
import { useToast } from "../../toast";

export default function Compras() {
  const [pagina, setPagina] = useState(1);
  const r = useDados(() => api<Pagina<Compra>>("/compras", { query: { pagina, tamanhoPagina: 24 } }), [pagina]);
  const avisar = useToast();
  const [baixando, setBaixando] = useState<string | null>(null);

  async function baixar(c: Compra) {
    setBaixando(c.itemId);
    try {
      await baixarArquivo(`/compras/${c.itemId}/download`);
      r.recarregar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setBaixando(null);
    }
  }

  if (r.carregando && !r.dados) return <Spinner />;
  if (r.erro) return <Erro texto={r.erro} onRetry={r.recarregar} />;
  if (!r.dados || r.dados.itens.length === 0) {
    return <Vazio titulo="Você ainda não comprou nenhuma foto"><p style={{ margin: "8px 0 18px" }}>Quando você comprar, os arquivos originais aparecem aqui para baixar.</p><Link to="/galeria" className="btn">Explorar a galeria</Link></Vazio>;
  }
  return (
    <>
      <div className="grid grid-fotos">
        {r.dados.itens.map((c) => (
          <article key={c.itemId} className="photo-card">
            <div className="photo-thumb"><Imagem src={c.foto.urlMiniatura} alt={c.foto.titulo} /></div>
            <div className="photo-body">
              <span className="photo-title">{c.foto.titulo}</span>
              <span className="photo-meta">{c.foto.fotografo.nome} · comprada em {c.pagoEm ? dataBr(c.pagoEm) : "—"}</span>
              <div className="photo-foot">
                <span className="photo-meta">{c.downloads} download(s)</span>
                <button className="btn btn-sm" disabled={baixando === c.itemId} onClick={() => baixar(c)}>{baixando === c.itemId ? "Baixando…" : "Baixar original"}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Paginacao pagina={r.dados} onMudar={setPagina} />
    </>
  );
}
