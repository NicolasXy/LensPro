// spiderman
import { FastifyInstance, FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { Papel } from "../generated/prisma/enums";
import { ErroNaoAutenticado, ErroPermissao } from "../errors";
import { Ator } from "../services/tipos";

/** Conteudo assinado dentro do JWT: apenas o identificador e o papel (nenhum dado sensivel). */
export interface PayloadJwt {
  sub: string;
  papel: Papel;
  /** Impressao da senha atual: trocar/redefinir a senha invalida todos os tokens antigos. */
  sv: string;
  /** Inicio da sessao (epoch s): a renovacao deslizante tem teto absoluto (ver AuthController). */
  inicio: number;
}

export const NOME_COOKIE_SESSAO = "lp_sessao";
export const CABECALHO_CSRF = "x-lenspro-csrf";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: PayloadJwt;
    user: PayloadJwt;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    /** Usuario autenticado desta requisicao (preenchido pelo hook de autenticacao). */
    ator: Ator;
    /** Token da sessao (para a renovacao conferir o inicio da sessao). */
    sessao: PayloadJwt;
  }
  interface FastifyContextConfig {
    /** Rota publica: dispensa o token (vitrine, login, cadastro, webhook). */
    publica?: boolean;
  }
}

/**
 * Registra o plugin @fastify/jwt e o hook global de autenticacao.
 *
 * Fluxo (stateless): o token e validado a cada requisicao (assinatura e
 * expiracao). Em seguida o usuario e relido do banco para confirmar que a
 * conta continua ativa e para usar o papel ATUAL (assim, desativar uma
 * conta ou mudar um papel vale imediatamente, sem esperar o token expirar).
 * Esta consulta substitui a "sessao em memoria" do CLI do greencode.
 */
export async function registrarAutenticacao(
  app: FastifyInstance,
  opcoes: { jwtSecret: string; jwtExpiraEm: string; carregarAtor: (sub: string, sv: string) => Promise<Ator> }
): Promise<void> {
  await app.register(fastifyJwt, {
    secret: opcoes.jwtSecret,
    sign: { expiresIn: opcoes.jwtExpiraEm, algorithm: "HS256" },
    verify: { algorithms: ["HS256"] },
  });

  app.decorateRequest("ator", undefined as unknown as Ator);
  app.decorateRequest("sessao", undefined as unknown as PayloadJwt);

  app.addHook("onRequest", async (req: FastifyRequest) => {
    // So a API (/api/...) exige token. O front React (arquivos estaticos e rotas do SPA), as rotas
    // marcadas como publicas e a documentacao interativa (/docs) dispensam.
    if (!req.url.startsWith("/api/") || req.routeOptions.config?.publica) return;

    // Navegador: cookie HttpOnly (JavaScript nao le o token). Clientes de API: Authorization: Bearer.
    const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
    const doCookie = lerCookie(req.headers.cookie, NOME_COOKIE_SESSAO);
    const token = bearer ?? doCookie;
    if (!token) throw new ErroNaoAutenticado("Token ausente, invalido ou expirado.");
    let payload: PayloadJwt;
    try {
      payload = app.jwt.verify<PayloadJwt>(token);
    } catch {
      throw new ErroNaoAutenticado("Token ausente, invalido ou expirado.");
    }
    // Protecao CSRF para a sessao por cookie: alem de SameSite=Strict, toda escrita precisa do
    // cabecalho proprio (um site de terceiros nao consegue envia-lo sem passar pelo CORS, que e fechado).
    if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers[CABECALHO_CSRF] !== "1") {
      throw new ErroPermissao("Requisicao recusada (protecao CSRF).");
    }
    req.sessao = payload;
    // O servico relê o usuario no banco: conta inativa, removida ou com a senha trocada => 401 imediato.
    req.ator = await opcoes.carregarAtor(payload.sub, payload.sv);
  });
}

/** Le um cookie do cabecalho Cookie (sem dependencias; valores nunca sao decodificados alem do necessario). */
export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  if (!cabecalho) return undefined;
  for (const par of cabecalho.split(";")) {
    const i = par.indexOf("=");
    if (i > 0 && par.slice(0, i).trim() === nome) return par.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

/**
 * Fabrica de hook `onRequest` de rota: libera a rota apenas para os papeis
 * informados. Roda logo apos a autenticacao e ANTES da validacao do corpo,
 * para que quem nao tem permissao sempre receba 403 (e nunca 400/404).
 */
export function permitir(...papeis: Papel[]) {
  return async (req: FastifyRequest): Promise<void> => {
    // Defesa em profundidade: se por erro de configuracao a autenticacao nao rodou, nega em vez de quebrar.
    if (!req.ator) throw new ErroNaoAutenticado("Autenticacao necessaria.");
    if (!papeis.includes(req.ator.papel)) {
      throw new ErroPermissao(`O papel '${req.ator.papel}' nao tem permissao para esta operacao.`);
    }
  };
}
