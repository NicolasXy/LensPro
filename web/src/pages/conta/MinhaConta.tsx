// spiderman
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth";
import { useTitulo } from "../../hooks";

/** Interface do COMPRADOR: biblioteca de fotos, pedidos e dados. */
export default function MinhaConta() {
  useTitulo("Minha conta");
  const { usuario } = useAuth();
  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><h1>Olá, {usuario?.nome}</h1><p>Suas fotos compradas, pedidos e dados da conta.</p></div>
        <div className="tabs" role="tablist">
          <NavLink to="/conta/compras" className={({ isActive }) => "tab" + (isActive ? " active" : "")}>Minhas fotos</NavLink>
          <NavLink to="/conta/pedidos" className={({ isActive }) => "tab" + (isActive ? " active" : "")}>Pedidos</NavLink>
          <NavLink to="/conta/dados" className={({ isActive }) => "tab" + (isActive ? " active" : "")}>Dados e senha</NavLink>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
