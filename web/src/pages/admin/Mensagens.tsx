// spiderman
import { useState } from "react";
import { api } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { dataHoraBr } from "../../format";
import { Pagina } from "../../types";
import { Erro, Paginacao, Spinner, Vazio } from "../../components/ui";

interface Msg { id: string; nome: string; email: string; mensagem: string; criadoEm: string }

export default function AdminMensagens() {
  useTitulo("Mensagens");
  const [pagina, setPagina] = useState(1);
  const r = useDados(() => api<Pagina<Msg>>("/admin/mensagens", { query: { pagina, tamanhoPagina: 20 } }), [pagina]);
  return (
    <>
      <div className="area-top"><div><h1>Mensagens</h1><p>Recebidas pelo formulário “Fale conosco”.</p></div></div>
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : !r.dados || r.dados.itens.length === 0 ? <Vazio titulo="Nenhuma mensagem" /> : (
        <>
          <div className="stack">
            {r.dados.itens.map((m) => (
              <div key={m.id} className="card">
                <div className="row-between"><b>{m.nome}</b><span className="muted" style={{ fontSize: "0.85rem" }}>{dataHoraBr(m.criadoEm)}</span></div>
                <a href={`mailto:${m.email}`} className="muted" style={{ fontSize: "0.88rem" }}>{m.email}</a>
                {/* Texto puro: o React escapa o conteudo, entao HTML enviado por visitantes nao e interpretado. */}
                <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{m.mensagem}</p>
              </div>
            ))}
          </div>
          <Paginacao pagina={r.dados} onMudar={setPagina} />
        </>
      )}
    </>
  );
}
