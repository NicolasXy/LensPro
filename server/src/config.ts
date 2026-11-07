// spiderman
import "dotenv/config";
import * as path from "path";

/**
 * Configuracao do servidor, lida UMA vez das variaveis de ambiente (ou do
 * arquivo .env). Centralizar aqui evita espalhar `process.env` pelo codigo
 * e permite validar os valores obrigatorios na inicializacao.
 */
export interface Configuracao {
  porta: number;
  host: string;
  producao: boolean;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiraEm: string;
  /** jwtExpiraEm em segundos (validade do cookie da sessao). */
  sessaoSegundos: number;
  /** Teto absoluto de uma sessao renovada continuamente, em segundos (12 h). */
  sessaoMaximaSegundos: number;
  bcryptRounds: number;
  corsOrigin: string | boolean;
  logLevel: string;
  encerramentoTimeoutMs: number;
  /** Pasta com os arquivos de dados (chave mestra, originais cifrados, previews). */
  diretorioDados: string;
  /** Chave AES-256 em hexadecimal (64 chars). Vazia = gerada em <diretorioDados>/master.key. */
  chaveMestraHex: string;
  /** Pasta do front compilado (web/dist) servida pelo proprio servidor. Vazia = nao serve. */
  diretorioWeb: string;
  /** Porcentagem da plataforma sobre cada venda (0-50). */
  taxaPlataformaPercent: number;
  /** Segredo HMAC do webhook do gateway de pagamento (minimo 16 caracteres). */
  webhookSecret: string;
  /** "simulado" = gateway de testes (desenvolvimento); "pagseguro" = PagBank (producao). */
  pagamentoGateway: "simulado" | "pagseguro";
  pagseguro: { token: string; ambiente: "sandbox" | "producao"; urlNotificacao: string; contaId: string };
  /** Minutos que um pedido pendente reserva ate expirar. */
  pedidoExpiraMin: number;
  /** Tamanho maximo de cada foto enviada, em MB. */
  uploadMaxMb: number;
  /** Falhas de login seguidas ate bloquear a conta, e minutos de bloqueio. */
  loginMaxFalhas: number;
  loginBloqueioMin: number;
  /** Limite de requisicoes por minuto por IP nas rotas de autenticacao (0 = desligado, uso em testes). */
  limiteAuthPorMinuto: number;
  /** URL publica do site (usada nos links dos e-mails de recuperacao de senha). */
  urlPublica: string;
  /** SMTP para e-mails (recuperacao de senha). Vazio em desenvolvimento = o link vai para o log. */
  smtpUrl: string;
  emailRemetente: string;
  /** Expoe a documentacao interativa (/docs). Padrao: so fora de producao. */
  exporDocs: boolean;
}

export function carregarConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao definida. Copie .env.example para .env e ajuste os valores.");
  }
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET deve ser definido com pelo menos 32 caracteres.");
  }
  const chaveMestraHex = (env.ENCRYPTION_KEY ?? "").trim();
  if (chaveMestraHex && !/^[0-9a-fA-F]{64}$/.test(chaveMestraHex)) {
    throw new Error("ENCRYPTION_KEY deve ter exatamente 64 caracteres hexadecimais (32 bytes / AES-256).");
  }
  const webhookSecret = env.WEBHOOK_SECRET ?? "";
  if (webhookSecret.length < 16) {
    throw new Error("WEBHOOK_SECRET deve ser definido com pelo menos 16 caracteres.");
  }
  if (env.NODE_ENV === "production") {
    // Valores de exemplo do .env.example nunca podem ir para producao.
    for (const [nome, valor] of [["JWT_SECRET", jwtSecret], ["WEBHOOK_SECRET", webhookSecret]] as const) {
      if (/troque/i.test(valor)) throw new Error(`${nome} ainda tem o valor de exemplo: gere um segredo aleatorio.`);
    }
    if (!env.SMTP_URL) throw new Error("Em producao defina SMTP_URL (a recuperacao de senha precisa enviar e-mails de verdade).");
  }
  const porta = Number(env.PORT ?? 3000);
  if (!Number.isInteger(porta) || porta < 0 || porta > 65535) {
    throw new Error(`PORT invalida: ${env.PORT}`);
  }
  const taxa = Number(env.TAXA_PLATAFORMA_PERCENT ?? 15);
  if (!Number.isFinite(taxa) || taxa < 0 || taxa > 50) {
    throw new Error("TAXA_PLATAFORMA_PERCENT deve estar entre 0 e 50.");
  }
  const jwtExpiraEm = env.JWT_EXPIRES_IN ?? "30m";
  const mExp = /^(\d+)([mh])$/.exec(jwtExpiraEm);
  if (!mExp || Number(mExp[1]) < 1) throw new Error('JWT_EXPIRES_IN deve ser algo como "30m" ou "2h".');
  const sessaoSegundos = Number(mExp[1]) * (mExp[2] === "h" ? 3600 : 60);
  const producao = env.NODE_ENV === "production";
  const urlPublica = (env.URL_PUBLICA ?? "http://localhost:3000").replace(/\/$/, "");
  const gw = (env.PAGAMENTO_GATEWAY ?? "simulado").toLowerCase();
  if (gw !== "simulado" && gw !== "pagseguro") throw new Error('PAGAMENTO_GATEWAY deve ser "simulado" ou "pagseguro".');
  const pagamentoGateway: "simulado" | "pagseguro" = gw;
  if (pagamentoGateway === "pagseguro" && (env.PAGSEGURO_TOKEN ?? "").length < 16) {
    throw new Error("PAGSEGURO_TOKEN deve ser definido (token da conta PagBank) quando PAGAMENTO_GATEWAY=pagseguro.");
  }
  if (producao && pagamentoGateway === "simulado") {
    throw new Error("Em producao (NODE_ENV=production) o gateway simulado nao pode ser usado: defina PAGAMENTO_GATEWAY=pagseguro.");
  }
  if (pagamentoGateway === "pagseguro" && !/^ACCO_[A-Za-z0-9-]{4,36}$/.test(env.PAGSEGURO_CONTA_ID ?? "")) {
    throw new Error("PAGSEGURO_CONTA_ID deve ser o id da conta PagBank dona do token (formato ACCO_...): ela recebe a taxa da plataforma no split.");
  }
  if (pagamentoGateway === "pagseguro" && taxa < 1) {
    throw new Error("Com o PagSeguro, TAXA_PLATAFORMA_PERCENT deve ser pelo menos 1: o split exige valor positivo para a conta da plataforma.");
  }
  if (producao && pagamentoGateway === "pagseguro" && !/^https:\/\//.test(env.PAGSEGURO_NOTIFICACAO_URL ?? urlPublica)) {
    throw new Error("Em producao a URL publica (URL_PUBLICA) e a de notificacao do PagSeguro precisam usar https.");
  }
  const cors = env.CORS_ORIGIN;
  return {
    porta,
    host: env.HOST ?? "0.0.0.0",
    producao,
    databaseUrl,
    jwtSecret,
    jwtExpiraEm,
    sessaoSegundos,
    sessaoMaximaSegundos: 12 * 3600,
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 12),
    corsOrigin: cors === undefined || cors === "" ? false : cors === "*" ? true : cors,
    logLevel: env.LOG_LEVEL ?? "info",
    encerramentoTimeoutMs: Number(env.SHUTDOWN_TIMEOUT_MS ?? 10000),
    diretorioDados: path.resolve(env.DATA_DIR ?? "data"),
    chaveMestraHex,
    diretorioWeb: env.WEB_DIST_DIR === undefined ? path.resolve(__dirname, "../../web/dist") : env.WEB_DIST_DIR,
    taxaPlataformaPercent: taxa,
    webhookSecret,
    pagamentoGateway,
    pagseguro: {
      token: env.PAGSEGURO_TOKEN ?? "",
      ambiente: env.PAGSEGURO_AMBIENTE === "producao" ? "producao" : "sandbox",
      urlNotificacao: env.PAGSEGURO_NOTIFICACAO_URL ?? urlPublica + "/api/v1/pagamentos/webhook/pagseguro",
      contaId: env.PAGSEGURO_CONTA_ID ?? "",
    },
    pedidoExpiraMin: Number(env.PEDIDO_EXPIRA_MIN ?? 30),
    uploadMaxMb: Number(env.UPLOAD_MAX_MB ?? 25),
    loginMaxFalhas: Number(env.LOGIN_MAX_FALHAS ?? 5),
    loginBloqueioMin: Number(env.LOGIN_BLOQUEIO_MIN ?? 15),
    limiteAuthPorMinuto: Number(env.LIMITE_AUTH_POR_MINUTO ?? 20),
    urlPublica,
    smtpUrl: env.SMTP_URL ?? "",
    emailRemetente: env.EMAIL_REMETENTE ?? "LensPro <nao-responda@lenspro.local>",
    exporDocs: env.EXPOR_DOCS === undefined ? !producao : env.EXPOR_DOCS === "1",
  };
}
