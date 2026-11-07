// spiderman
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { api, aoSessaoInvalida, marcarSessao } from "./api";
import { PerfilPrivado, Usuario } from "./types";

/** O token nao e usado pelo front: a sessao vive num cookie HttpOnly definido pelo servidor. */
interface Sessao {
  expiraEm: string;
  usuario: Usuario;
}

interface AuthCtx {
  usuario: Usuario | null;
  perfil: PerfilPrivado | null;
  carregando: boolean;
  aviso: string | null;
  limparAviso: () => void;
  login: (email: string, senha: string) => Promise<Usuario>;
  cadastrar: (d: { nome: string; sobrenome: string; email: string; senha: string; tipo: "comprador" | "fotografo"; nomeArtistico?: string }) => Promise<Usuario>;
  sair: (aviso?: string) => void;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const INATIVIDADE_MS = 30 * 60 * 1000; // janela deslizante de 30 min sem atividade
const RENOVAR_A_CADA_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [perfil, setPerfil] = useState<PerfilPrivado | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimaAtividade = useRef(Date.now());
  const ultimaRenovacao = useRef(Date.now());

  const sair = useCallback((msg?: string) => {
    marcarSessao(false);
    // Apaga o cookie no servidor (falha de rede nao impede a saida local).
    api("/auth/sair", { metodo: "POST", semAuth: true }).catch(() => undefined);
    setUsuario(null);
    setPerfil(null);
    if (msg) setAviso(msg);
  }, []);

  const recarregar = useCallback(async () => {
    const r = await api<{ usuario: Usuario; perfil: PerfilPrivado | null }>("/auth/eu");
    marcarSessao(true);
    setUsuario(r.usuario);
    setPerfil(r.perfil);
  }, []);

  // Restaura a sessao ao abrir/recarregar a pagina: se o cookie ainda vale, /auth/eu responde; senao, visitante.
  useEffect(() => {
    aoSessaoInvalida(() => sair("Sua sessão expirou. Entre novamente."));
    recarregar()
      .catch(() => marcarSessao(false))
      .finally(() => setCarregando(false));
  }, [recarregar, sair]);

  // Sessao deslizante: enquanto o usuario esta ativo, renova o cookie; inativo por 30 min, sai.
  useEffect(() => {
    if (!usuario) return;
    const marcar = () => {
      ultimaAtividade.current = Date.now();
    };
    const eventos = ["pointerdown", "keydown", "scroll"] as const;
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - ultimaAtividade.current > INATIVIDADE_MS) return sair("Você ficou 30 minutos inativo e foi desconectado.");
      if (Date.now() - ultimaRenovacao.current > RENOVAR_A_CADA_MS && ultimaAtividade.current > ultimaRenovacao.current) {
        ultimaRenovacao.current = Date.now();
        try {
          await api<Sessao>("/auth/renovar", { metodo: "POST" });
        } catch {
          /* se falhar (ex.: teto de 12 h), o proximo 401 derruba a sessao */
        }
      }
    }, 30_000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar));
      window.clearInterval(timer);
    };
  }, [usuario, sair]);

  const iniciar = useCallback(
    async (s: Sessao) => {
      marcarSessao(true);
      ultimaRenovacao.current = Date.now();
      setAviso(null);
      ultimaAtividade.current = Date.now();
      setUsuario(s.usuario);
      if (s.usuario.papel === "fotografo") {
        const r = await api<{ usuario: Usuario; perfil: PerfilPrivado | null }>("/auth/eu");
        setPerfil(r.perfil);
      } else setPerfil(null);
      return s.usuario;
    },
    []
  );

  const login = useCallback(
    async (email: string, senha: string) => iniciar(await api<Sessao>("/auth/login", { corpo: { email, senha }, semAuth: true })),
    [iniciar]
  );
  const cadastrar = useCallback<AuthCtx["cadastrar"]>(
    async (d) => iniciar(await api<Sessao>("/auth/cadastro", { corpo: d, semAuth: true })),
    [iniciar]
  );

  const valor = useMemo<AuthCtx>(
    () => ({ usuario, perfil, carregando, aviso, limparAviso: () => setAviso(null), login, cadastrar, sair, recarregar }),
    [usuario, perfil, carregando, aviso, login, cadastrar, sair, recarregar]
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}

/** Rota inicial de cada tipo de conta: cada papel tem a sua interface. */
export function areaInicial(papel: Usuario["papel"]): string {
  return papel === "fotografo" ? "/estudio" : papel === "admin" ? "/admin" : "/conta";
}
