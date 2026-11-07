// spiderman
import * as fs from "fs";
import * as path from "path";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Configuracao } from "./config";
import { PrismaClient } from "./db/prisma";
import { UnidadeDeTrabalho } from "./db/unidadeDeTrabalho";
import { Armazenamento } from "./core/armazenamento";
import { carregarChaveMestra } from "./core/chaveMestra";
import { registrarAutenticacao } from "./plugins/autenticacao";
import { registrarTratamentoDeErros } from "./plugins/erros";
import { registrarRotas } from "./routes/rotas";
import { AuthService } from "./services/AuthService";
import { PerfilService } from "./services/PerfilService";
import { EventoService } from "./services/EventoService";
import { FotoService } from "./services/FotoService";
import { PedidoService } from "./services/PedidoService";
import { PagamentoService } from "./services/PagamentoService";
import { CompraService } from "./services/CompraService";
import { PainelService } from "./services/PainelService";
import { AuditoriaService, ContatoService } from "./services/ContatoService";
import { EnviadorConsole, EnviadorEmail, EnviadorSmtp } from "./services/Mailer";
import { AssinadorUrls, configurarAssinadorUrls } from "./core/urlAssinada";
import { GatewayPagamento, GatewaySimulado } from "./services/Gateway";
import { GatewayPagSeguro } from "./services/GatewayPagSeguro";
import { AuthController } from "./controllers/AuthController";
import { CatalogoController } from "./controllers/CatalogoController";
import { EstudioController } from "./controllers/EstudioController";
import { CompraController } from "./controllers/CompraController";
import { AdminController } from "./controllers/AdminController";

export interface DependenciasOpcionais {
  enviadorEmail?: EnviadorEmail;
  gateway?: GatewayPagamento;
}

export interface AppCriado {
  app: FastifyInstance;
  /** Expira pedidos pendentes vencidos (usado pela varredura periodica do server.ts). */
  expirarPedidos: () => Promise<number>;
}

/**
 * Monta a aplicacao Fastify (composition root): cria a unidade de trabalho,
 * os services, os controllers e registra plugins e rotas. Nao abre porta
 * nem le variaveis de ambiente: isso permite instanciar o app nos testes
 * (via app.inject) e no servidor real (server.ts) com a mesma configuracao.
 * Em producao, o MESMO processo serve a API (/api/v1) e o front React compilado.
 */
export async function criarApp(config: Configuracao, prisma: PrismaClient, deps: DependenciasOpcionais = {}): Promise<AppCriado> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Nunca registrar credenciais, tokens ou dados de cartao nos logs.
      redact: ["req.headers.authorization", "req.headers.cookie", "req.body.senha", "req.body.novaSenha", "req.body.cartao", "req.body.cpf", "req.body.token"],
    },
    trustProxy: config.producao, // atras de proxy reverso (Nginx etc.), o IP real vem de X-Forwarded-For
    bodyLimit: 1024 * 1024, // 1 MB para JSON; uploads de imagem usam o limite do multipart
  });

  configurarAssinadorUrls(new AssinadorUrls(config.jwtSecret));
  const uow = new UnidadeDeTrabalho(prisma);
  const chave = carregarChaveMestra(config.diretorioDados, config.chaveMestraHex);
  const arquivos = new Armazenamento(config.diretorioDados, chave);

  // Camada de servicos (regras de negocio).
  const auth = new AuthService(
    uow,
    { bcryptRounds: config.bcryptRounds, loginMaxFalhas: config.loginMaxFalhas, loginBloqueioMin: config.loginBloqueioMin, urlPublica: config.urlPublica },
    deps.enviadorEmail ?? (config.smtpUrl ? new EnviadorSmtp(config.smtpUrl, config.emailRemetente) : new EnviadorConsole((m) => app.log.info(m)))
  );
  const perfis = new PerfilService(uow, chave);
  const eventos = new EventoService(uow);
  const fotos = new FotoService(uow, arquivos);
  const pedidos = new PedidoService(uow, { taxaPlataformaPercent: config.taxaPlataformaPercent, pedidoExpiraMin: config.pedidoExpiraMin });
  const gateway =
    deps.gateway ??
    (config.pagamentoGateway === "pagseguro"
      ? new GatewayPagSeguro({ token: config.pagseguro.token, ambiente: config.pagseguro.ambiente, urlNotificacao: config.pagseguro.urlNotificacao, contaPlataforma: config.pagseguro.contaId })
      : new GatewaySimulado());
  const pagamentos = new PagamentoService(uow, gateway, pedidos, config.webhookSecret);
  const compras = new CompraService(uow, arquivos);
  const painel = new PainelService(uow);
  const auditoria = new AuditoriaService(uow);
  const contatos = new ContatoService(uow);

  // Cabecalhos de seguranca (CSP restritiva: so scripts/estilos do proprio site).
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // O SDK do PagBank (que cifra o cartao no navegador) e o unico script de terceiros, e so com o gateway real.
        scriptSrc: config.pagamentoGateway === "pagseguro" ? ["'self'", "https://assets.pagseguro.com.br"] : ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Em http://localhost (desenvolvimento) forcar https quebraria o carregamento dos arquivos.
        upgradeInsecureRequests: config.producao ? [] : null,
      },
    },
    strictTransportSecurity: config.producao ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  // HTTPS obrigatorio em producao (atras de proxy reverso): pedidos http sao redirecionados.
  if (config.producao) {
    app.addHook("onRequest", async (req, reply) => {
      if (req.headers["x-forwarded-proto"] === "http") return reply.redirect(`https://${req.headers.host}${req.url}`, 308);
    });
  }
  // Respostas da API nunca ficam em cache de navegador/proxy (dados pessoais), exceto as imagens, que definem a sua propria regra.
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), usb=(), payment=()");
    if (req.url.startsWith("/api/") && !reply.hasHeader("cache-control")) reply.header("Cache-Control", "no-store");
    return payload;
  });
  await app.register(cors, { origin: config.corsOrigin });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 1, fields: 12, fieldSize: 8 * 1024 } });

  const temFront = !!config.diretorioWeb && fs.existsSync(path.join(config.diretorioWeb, "index.html"));
  registrarTratamentoDeErros(app, temFront ? () => true : undefined);

  await app.register(swagger, {
    openapi: {
      info: { title: "LensPro API", description: "Marketplace de fotografias com marca d'agua", version: "2.0.0" },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      security: [{ bearerAuth: [] }],
    },
  });
  if (config.exporDocs) await app.register(swaggerUi, { routePrefix: "/docs" });

  await registrarAutenticacao(app, { jwtSecret: config.jwtSecret, jwtExpiraEm: config.jwtExpiraEm, carregarAtor: (id, sv) => auth.obterAtor(id, sv) });

  // Todas as rotas de negocio ficam sob /api/v1.
  await app.register(
    async (v1) => {
      await registrarRotas(
        v1,
        {
          auth: new AuthController(auth, perfis, contatos, (p) => app.jwt.sign(p), { sessaoSegundos: config.sessaoSegundos, sessaoMaximaSegundos: config.sessaoMaximaSegundos, cookieSeguro: config.producao }),
          catalogo: new CatalogoController(fotos, eventos, perfis),
          estudio: new EstudioController(fotos, eventos, painel),
          compra: new CompraController(pedidos, pagamentos, compras),
          admin: new AdminController(auth, fotos, painel, auditoria, contatos),
        },
        { limiteAuth: config.limiteAuthPorMinuto }
      );
    },
    { prefix: "/api/v1" }
  );

  // Front React compilado (web/dist), com fallback para o index.html (rotas do React Router).
  if (temFront) {
    await app.register(fastifyStatic, { root: config.diretorioWeb, wildcard: false, index: ["index.html"], dotfiles: "deny" });
  }

  return { app, expirarPedidos: () => pedidos.expirarVencidos() };
}
