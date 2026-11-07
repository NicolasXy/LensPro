// spiderman
import { Link } from "react-router-dom";
import { useTitulo } from "../hooks";

export default function NaoEncontrada() {
  useTitulo("Página não encontrada");
  return (
    <div className="page">
      <div className="container" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="n" style={{ fontSize: "5rem", color: "var(--primary)", fontWeight: 700 }}>404</div>
        <h1 style={{ marginBottom: 10 }}>Página não encontrada</h1>
        <p className="muted" style={{ marginBottom: 24 }}>O endereço que você abriu não existe ou foi movido.</p>
        <Link to="/" className="btn">Voltar ao início</Link>
      </div>
    </div>
  );
}
