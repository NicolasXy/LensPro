// spiderman
import { useState } from "react";
import { api } from "../../api";
import { useDados, useTitulo } from "../../hooks";
import { brl, dataHoraBr } from "../../format";
import { Pagina } from "../../types";
import { Erro, Paginacao, Spinner, Vazio } from "../../components/ui";
import { Resumo, Venda } from "./Painel";

export default function EstudioVendas() {
  useTitulo("Vendas");
  const [pagina, setPagina] = useState(1);
  const resumo = useDados(() => api<Resumo>("/estudio/resumo"), []);
  const r = useDados(() => api<Pagina<Venda>>("/estudio/vendas", { query: { pagina, tamanhoPagina: 20 } }), [pagina]);
  return (
    <>
      <div className="area-top"><div><h1>Vendas</h1><p>Cada venda mostra o valor bruto, a taxa da plataforma e o seu líquido.</p></div></div>
      {resumo.dados && (
        <div className="grid grid-stats" style={{ marginBottom: 28 }}>
          <div className="stat"><div className="n">{brl(resumo.dados.brutoCentavos)}</div><span>Bruto</span></div>
          <div className="stat"><div className="n">{brl(resumo.dados.taxaCentavos)}</div><span>Taxa da plataforma</span></div>
          <div className="stat"><div className="n">{brl(resumo.dados.liquidoCentavos)}</div><span>Líquido</span></div>
        </div>
      )}
      {r.carregando && !r.dados ? <Spinner /> : r.erro ? <Erro texto={r.erro} onRetry={r.recarregar} /> : !r.dados || r.dados.itens.length === 0 ? <Vazio titulo="Nenhuma venda ainda">Compartilhe seu perfil e suas fotos para vender.</Vazio> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Foto</th><th>Comprador</th><th>Valor</th><th>Taxa</th><th>Líquido</th></tr></thead>
              <tbody>{r.dados.itens.map((i: Venda) => <tr key={i.itemId}><td>{i.pagoEm ? dataHoraBr(i.pagoEm) : "—"}</td><td>{i.tituloFoto}</td><td>{i.comprador}</td><td>{brl(i.precoCentavos)}</td><td>{brl(i.taxaCentavos)}</td><td><b>{brl(i.liquidoCentavos)}</b></td></tr>)}</tbody>
            </table>
          </div>
          <Paginacao pagina={r.dados} onMudar={setPagina} />
        </>
      )}
    </>
  );
}
