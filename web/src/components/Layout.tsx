// spiderman
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { areaInicial, useAuth } from "../auth";
import { useCart } from "../cart";
import { Papel } from "../types";
import { Spinner } from "./ui";

export function Header() {
  const { usuario, sair } = useAuth();
  const { itens } = useCart();
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const f = () => setRolou(window.scrollY > 40);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => setAberto(false), [loc.pathname]);

  const podeComprar = !usuario || usuario.papel === "comprador";
  const rotuloArea = usuario?.papel === "fotografo" ? "Meu Estúdio" : usuario?.papel === "admin" ? "Administração" : "Minha conta";

  return (
    <header className={"header" + (rolou ? " scrolled" : "")}>
      <Link to="/" className="logo" aria-label="LensPro — início">Lens<span>Pro</span></Link>
      <nav className={"nav" + (aberto ? " aberto" : "")} aria-label="Principal">
        <NavLink to="/" end>Início</NavLink>
        <NavLink to="/eventos">Eventos</NavLink>
        <NavLink to="/fotografos">Fotógrafos</NavLink>
        <NavLink to="/galeria">Galeria</NavLink>
        <NavLink to="/contato">Contato</NavLink>
      </nav>
      <div className="header-actions">
        {podeComprar && (
          <Link to="/carrinho" className="cart-link" aria-label={`Carrinho com ${itens.length} fotos`}>
            Carrinho <span className="cart-count">{itens.length}</span>
          </Link>
        )}
        {usuario ? (
          <>
            <Link to={areaInicial(usuario.papel)} className="btn btn-sm btn-conta"><span className="avatar-mini" aria-hidden>{usuario.nome.charAt(0).toUpperCase()}</span>{rotuloArea}</Link>
            <button className="btn btn-sm btn-ghost sair-txt" onClick={() => { sair(); nav("/"); }}>Sair</button>
          </>
        ) : (
          <Link to="/entrar" className="entrar-link">Entrar</Link>
        )}
        <button className="menu-toggle" aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>Menu</button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="logo" style={{ fontSize: "1.3rem" }}>Lens<span>Pro</span></div>
          <p>© 2026 LensPro. As fotos exibidas têm marca d'água; o arquivo original só é liberado após a compra.</p>
        </div>
        <div className="footer-links">
          <Link to="/galeria">Galeria</Link>
          <Link to="/eventos">Eventos</Link>
          <Link to="/fotografos">Fotógrafos</Link>
          <Link to="/contato">Contato</Link>
          <Link to="/cadastro">Criar conta</Link>
        </div>
      </div>
    </footer>
  );
}

/** Layout das paginas publicas. */
export function LayoutPublico() {
  return (
    <>
      <Header />
      <main><Outlet /></main>
      <Footer />
    </>
  );
}

/** Garante login e papel: cada tipo de conta so enxerga a sua propria interface. */
export function Protegida({ papeis, children }: { papeis: Papel[]; children: React.ReactNode }) {
  const { usuario, carregando } = useAuth();
  const loc = useLocation();
  if (carregando) return <div className="page"><Spinner /></div>;
  if (!usuario) return <Navigate to={`/entrar?de=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!papeis.includes(usuario.papel)) return <Navigate to={areaInicial(usuario.papel)} replace />;
  return <>{children}</>;
}

interface ItemMenu { to: string; rotulo: string; fim?: boolean }

/** Layout com barra lateral das areas do fotografo (estudio) e do administrador. */
export function LayoutArea({ titulo, itens }: { titulo: string; itens: ItemMenu[] }) {
  return (
    <>
      <Header />
      <div className="area">
        <aside className="sidebar" aria-label={titulo}>
          <h4>{titulo}</h4>
          {itens.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.fim} className={({ isActive }) => "side-link" + (isActive ? " active" : "")}>
              {i.rotulo}
            </NavLink>
          ))}
        </aside>
        <main className="area-main"><Outlet /></main>
      </div>
    </>
  );
}
