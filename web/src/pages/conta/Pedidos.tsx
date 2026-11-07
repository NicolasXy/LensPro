// spiderman
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useDados } from "../../hooks";
import { brl, dataHoraBr } from "../../format";
import { Pagina, Pedido } from "../../types";
import { Erro, Paginacao, Spinner, StatusBadge, Vazio } from "../../components/ui";

export default function Pedidos() {
  const [pagina, setPagina] = useState(1);
  const r = useDados(() => api<Pagina<Pedido>>("/pedidos", { query: { pagina, tamanhoPagina: 10 } }), [pagina]);
  if (r.carregando && !r.dados) return <Spinner />;
  if (r.erro) return <Erro texto={r.erro} onRetry={r.recarregar} />;
  if (!r.dados || r.dados.itens.length === 0) return <Vazio titulo="Nenhum pedido ainda" />;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Data</th><th>Fotos</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {r.dados.itens.map((p) => (
              <tr key={p.id}>
                <td>#{p.id.slice(0, 8)}</td>
                <td>{dataHoraBr(p.criadoEm)}</td>
                <td>{p.itens.map((i) => i.foto.titulo).join(", ")}</td>
                <td>{brl(p.totalCentavos)}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>{p.status === "pendente" ? <Link to={`/pagamento/${p.id}`} className="btn btn-sm">Pagar</Link> : p.status === "pago" ? <Link to="/conta/compras" className="btn btn-sm btn-ghost">Baixar</Link> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={r.dados} onMudar={setPagina} />
    </>
  );
}
