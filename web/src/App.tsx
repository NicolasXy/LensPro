// spiderman
import { Suspense, lazy, useEffect } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { LayoutArea, LayoutPublico, Protegida } from "./components/Layout";
import { Spinner } from "./components/ui";

// Cada tela e carregada sob demanda (code splitting): o visitante da vitrine nao baixa o painel do fotografo.
const Home = lazy(() => import("./pages/Home"));
const Galeria = lazy(() => import("./pages/Galeria"));
const FotoDetalhe = lazy(() => import("./pages/FotoDetalhe"));
const Eventos = lazy(() => import("./pages/Eventos"));
const EventoDetalhe = lazy(() => import("./pages/EventoDetalhe"));
const Fotografos = lazy(() => import("./pages/Fotografos"));
const FotografoPerfil = lazy(() => import("./pages/FotografoPerfil"));
const Contato = lazy(() => import("./pages/Contato"));
const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const RecuperarSenha = lazy(() => import("./pages/RecuperarSenha"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const Carrinho = lazy(() => import("./pages/Carrinho"));
const Pagamento = lazy(() => import("./pages/Pagamento"));
const Compras = lazy(() => import("./pages/conta/Compras"));
const Pedidos = lazy(() => import("./pages/conta/Pedidos"));
const DadosConta = lazy(() => import("./components/DadosConta"));
const MinhaConta = lazy(() => import("./pages/conta/MinhaConta"));
const EstudioPainel = lazy(() => import("./pages/estudio/Painel"));
const EstudioFotos = lazy(() => import("./pages/estudio/Fotos"));
const EstudioPublicar = lazy(() => import("./pages/estudio/Publicar"));
const EstudioEventos = lazy(() => import("./pages/estudio/Eventos"));
const EstudioVendas = lazy(() => import("./pages/estudio/Vendas"));
const EstudioPerfil = lazy(() => import("./pages/estudio/Perfil"));
const AdminPainel = lazy(() => import("./pages/admin/Painel"));
const AdminUsuarios = lazy(() => import("./pages/admin/Usuarios"));
const AdminFotos = lazy(() => import("./pages/admin/Fotos"));
const AdminAuditoria = lazy(() => import("./pages/admin/Auditoria"));
const AdminMensagens = lazy(() => import("./pages/admin/Mensagens"));
const NaoEncontrada = lazy(() => import("./pages/NaoEncontrada"));

const menuEstudio = [
  { to: "/estudio", rotulo: "Painel", fim: true },
  { to: "/estudio/publicar", rotulo: "Publicar fotos" },
  { to: "/estudio/fotos", rotulo: "Minhas fotos" },
  { to: "/estudio/eventos", rotulo: "Eventos" },
  { to: "/estudio/vendas", rotulo: "Vendas" },
  { to: "/estudio/perfil", rotulo: "Perfil e repasse" },
];
const menuAdmin = [
  { to: "/admin", rotulo: "Visão geral", fim: true },
  { to: "/admin/usuarios", rotulo: "Usuários" },
  { to: "/admin/fotos", rotulo: "Moderação de fotos" },
  { to: "/admin/auditoria", rotulo: "Auditoria" },
  { to: "/admin/mensagens", rotulo: "Mensagens" },
];

function RolarAoTopo() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <RolarAoTopo />
      <Suspense fallback={<div className="page"><Spinner /></div>}>
        <Routes>
          <Route element={<LayoutPublico />}>
            <Route path="/" element={<Home />} />
            <Route path="/galeria" element={<Galeria />} />
            <Route path="/galeria/:id" element={<FotoDetalhe />} />
            <Route path="/eventos" element={<Eventos />} />
            <Route path="/eventos/:id" element={<EventoDetalhe />} />
            <Route path="/fotografos" element={<Fotografos />} />
            <Route path="/fotografos/:id" element={<FotografoPerfil />} />
            <Route path="/contato" element={<Contato />} />
            <Route path="/entrar" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/recuperar-senha" element={<RecuperarSenha />} />
            <Route path="/redefinir-senha/:token" element={<RedefinirSenha />} />
            <Route path="/carrinho" element={<Carrinho />} />
            <Route path="/pagamento/:id" element={<Protegida papeis={["comprador"]}><Pagamento /></Protegida>} />
            <Route path="/conta" element={<Protegida papeis={["comprador"]}><MinhaConta /></Protegida>}>
              <Route index element={<Navigate to="compras" replace />} />
              <Route path="compras" element={<Compras />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="dados" element={<DadosConta />} />
            </Route>
            <Route path="*" element={<NaoEncontrada />} />
          </Route>

          <Route path="/estudio" element={<Protegida papeis={["fotografo"]}><LayoutArea titulo="Estúdio" itens={menuEstudio} /></Protegida>}>
            <Route index element={<EstudioPainel />} />
            <Route path="publicar" element={<EstudioPublicar />} />
            <Route path="fotos" element={<EstudioFotos />} />
            <Route path="eventos" element={<EstudioEventos />} />
            <Route path="vendas" element={<EstudioVendas />} />
            <Route path="perfil" element={<EstudioPerfil />} />
          </Route>

          <Route path="/admin" element={<Protegida papeis={["admin"]}><LayoutArea titulo="Administração" itens={menuAdmin} /></Protegida>}>
            <Route index element={<AdminPainel />} />
            <Route path="usuarios" element={<AdminUsuarios />} />
            <Route path="fotos" element={<AdminFotos />} />
            <Route path="auditoria" element={<AdminAuditoria />} />
            <Route path="mensagens" element={<AdminMensagens />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
