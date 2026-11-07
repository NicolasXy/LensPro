// spiderman
import { FormEvent, useState } from "react";
import { api, mensagemDeErro } from "../../api";
import { useAuth } from "../../auth";
import { useTitulo } from "../../hooks";
import { PerfilPrivado } from "../../types";
import { Campo } from "../../components/ui";
import DadosConta from "../../components/DadosConta";
import { useToast } from "../../toast";

export default function EstudioPerfil() {
  useTitulo("Perfil e repasse");
  const { perfil, recarregar } = useAuth();
  const avisar = useToast();
  const [d, setD] = useState({ nomeArtistico: perfil?.nomeArtistico ?? "", bio: perfil?.bio ?? "", cidade: perfil?.cidade ?? "", estado: perfil?.estado ?? "", especialidade: perfil?.especialidade ?? "", pix: "", conta: perfil?.pagbankContaId ?? "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!perfil) return null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = { nomeArtistico: d.nomeArtistico, bio: d.bio || null, cidade: d.cidade || null, estado: d.estado || null, especialidade: d.especialidade || null, versao: perfil!.versao };
      corpo.pagbankContaId = d.conta.trim() || null; // vazio = desvincular
      if (d.pix.trim()) corpo.pixChave = d.pix.trim(); // so enviamos se o fotografo digitou uma nova chave
      await api<PerfilPrivado>("/estudio/perfil", { metodo: "PUT", corpo });
      setD({ ...d, pix: "" });
      await recarregar();
      avisar("Perfil atualizado.");
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }

  return (
    <>
      <div className="area-top"><div><h1>Perfil e repasse</h1><p>Como os compradores veem você e onde você recebe.</p></div></div>
      <form className="card" onSubmit={salvar} style={{ marginBottom: 28, maxWidth: 820 }}>
        {erro && <div className="alert alert-erro">{erro}</div>}
        <div className="form-grid">
          <Campo id="pf-art" rotulo="Nome artístico"><input id="pf-art" className="input" value={d.nomeArtistico} onChange={(e) => setD({ ...d, nomeArtistico: e.target.value })} required minLength={2} maxLength={100} /></Campo>
          <Campo id="pf-esp" rotulo="Especialidade"><input id="pf-esp" className="input" value={d.especialidade} onChange={(e) => setD({ ...d, especialidade: e.target.value })} maxLength={80} placeholder="Eventos, casamentos, ensaios…" /></Campo>
          <Campo id="pf-cid" rotulo="Cidade"><input id="pf-cid" className="input" value={d.cidade} onChange={(e) => setD({ ...d, cidade: e.target.value })} maxLength={80} /></Campo>
          <Campo id="pf-uf" rotulo="Estado (UF)"><input id="pf-uf" className="input" value={d.estado} onChange={(e) => setD({ ...d, estado: e.target.value.toUpperCase() })} maxLength={2} placeholder="SP" /></Campo>
        </div>
        <Campo id="pf-bio" rotulo="Sobre você"><textarea id="pf-bio" className="textarea" value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} maxLength={1000} /></Campo>
        <Campo id="pf-conta" rotulo="Conta PagBank para receber suas vendas (split)" ajuda={perfil.pagbankContaId ? "Conta vinculada. A sua parte de cada venda (preço menos a taxa da plataforma) é paga direto na sua conta pelo PagBank, no momento da compra." : "Sem a conta vinculada, compradores não conseguem pagar suas fotos quando o pagamento real está ativo. Encontre o ID (começa com ACCO_) na sua conta PagBank, em Vendas > Integrações."}>
          <input id="pf-conta" className="input" value={d.conta} onChange={(e) => setD({ ...d, conta: e.target.value })} maxLength={41} autoComplete="off" spellCheck={false} placeholder="ACCO_XXXXXXXX-XXXX-XXXX" pattern="ACCO_[A-Za-z0-9\-]{4,36}|" title="O ID da conta começa com ACCO_" />
        </Campo>
        <Campo id="pf-pix" rotulo="Chave Pix (reserva)" ajuda={perfil.pixMascara ? `Chave atual: ${perfil.pixMascara}. Preencha só se quiser trocar. Ela é guardada cifrada (AES-256-GCM).` : "CPF, e-mail, telefone ou chave aleatória. Guardada cifrada (AES-256-GCM)."}>
          <input id="pf-pix" className="input" value={d.pix} onChange={(e) => setD({ ...d, pix: e.target.value })} maxLength={77} autoComplete="off" placeholder={perfil.pixMascara ?? "Sua chave Pix"} />
        </Campo>
        <button className="btn" disabled={salvando}>{salvando ? "Salvando…" : "Salvar perfil"}</button>
      </form>
      <DadosConta />
    </>
  );
}
