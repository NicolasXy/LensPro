// spiderman
// Testes da integracao PagSeguro (PagBank) com um "PagBank" falso (fetch injetado): nada sai para a internet.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { check, secao, resumo, multipart } = require("./helpers");
const { criarApp } = require("../dist/app");
const { criarPrisma } = require("../dist/db/prisma");
const { carregarConfiguracao } = require("../dist/config");
const { GatewayPagSeguro, interpretarPedidoPagBank, montarDivisao } = require("../dist/services/GatewayPagSeguro");

const URL_DB = process.env.TEST_DATABASE_URL || "postgresql://lenspro:lenspro@localhost:5432/lenspro_test";
const TOKEN = "token-da-conta-pagbank-de-teste-0123456789";
const CONTA = "ACCO_PLATAFORMA-0001"; // conta PagBank dona do token (recebe a taxa)
const SENHA = "Senha#Forte1";
const CPF = "52998224725"; // CPF valido (digitos verificadores corretos)
const P = "/api/v1";

// ---------- PagBank falso ----------
const chamadas = [];
let proximo = []; // fila de respostas { status, json } ou { erro: true }
const fake = async (url, opcoes) => {
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : undefined;
  chamadas.push({ url, metodo: opcoes.method, headers: opcoes.headers, corpo });
  const r = proximo.shift();
  if (!r) throw new Error("resposta nao preparada para " + url);
  if (r.erro) throw new TypeError("fetch failed");
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => JSON.stringify(r.json ?? {}) };
};
const responder = (status, json) => proximo.push({ status, json });

const hmacToken = (corpo) => crypto.createHash("sha256").update(`${TOKEN}-${corpo}`).digest("hex");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-pag-"));
  const env = { DATABASE_URL: URL_DB, JWT_SECRET: "x".repeat(40), WEBHOOK_SECRET: "segredo-de-teste-do-webhook", DATA_DIR: dir, BCRYPT_ROUNDS: "4", LIMITE_AUTH_POR_MINUTO: "0", LOG_LEVEL: "silent", NODE_ENV: "test" };

  secao("1. Configuracao segura");
  const falha = (e) => { try { carregarConfiguracao({ ...env, ...e }); return false; } catch { return true; } };
  check("PAGAMENTO_GATEWAY invalido e recusado", falha({ PAGAMENTO_GATEWAY: "outro" }));
  check("pagseguro sem token e recusado", falha({ PAGAMENTO_GATEWAY: "pagseguro" }));
  check("EM PRODUCAO o gateway simulado e recusado", falha({ NODE_ENV: "production", PAGAMENTO_GATEWAY: "simulado" }));
  check("em producao a URL publica precisa ser https", falha({ NODE_ENV: "production", PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: CONTA, URL_PUBLICA: "http://meusite.com" }));
  check("producao + pagseguro + https e aceito", !falha({ NODE_ENV: "production", PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: CONTA, URL_PUBLICA: "https://meusite.com", SMTP_URL: "smtps://u:p@smtp.exemplo.com:465" }));
  check("producao exige SMTP_URL", falha({ NODE_ENV: "production", PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: CONTA, URL_PUBLICA: "https://meusite.com" }));
  check("producao recusa segredos de exemplo ('troque...')", falha({ NODE_ENV: "production", PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: CONTA, URL_PUBLICA: "https://meusite.com", SMTP_URL: "smtps://u:p@s:465", JWT_SECRET: "troque-esta-chave-por-uma-aleatoria-com-32-ou-mais" }));

  const config = carregarConfiguracao({ ...env, PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: CONTA, URL_PUBLICA: "https://loja.exemplo.com" });
  check("URL de notificacao padrao derivada da URL publica", config.pagseguro.urlNotificacao === "https://loja.exemplo.com/api/v1/pagamentos/webhook/pagseguro");
  const prisma = criarPrisma(URL_DB);
  await prisma.$executeRawUnsafe('TRUNCATE "Auditoria","MensagemContato","Pagamento","ItemPedido","Pedido","Foto","Evento","PerfilFotografo","Usuario" RESTART IDENTITY CASCADE');
  const gateway = new GatewayPagSeguro({ token: TOKEN, ambiente: "sandbox", urlNotificacao: config.pagseguro.urlNotificacao, contaPlataforma: CONTA, fetchImpl: fake, timeoutMs: 2000 });
  const { app } = await criarApp(config, prisma, { gateway });
  await app.ready();

  const req = async (metodo, url, { token, body, headers = {}, payload } = {}) => {
    const h = { ...headers };
    if (token) h.authorization = "Bearer " + token;
    const r = await app.inject({ method: metodo, url: P + url, headers: h, payload: payload ?? body });
    let json = null; try { json = r.json(); } catch { /* vazio */ }
    return { status: r.statusCode, json };
  };
  const cad = async (nome, tipo) => (await req("POST", "/auth/cadastro", { body: { nome, sobrenome: "Teste", email: `${nome.toLowerCase()}@teste.com`, senha: SENHA, tipo } })).json.token;
  const tF = await cad("Fabio", "fotografo");
  const tB = await cad("Bia", "comprador");
  // Nas secoes 3-5 o fotografo e a propria conta da plataforma (nada a dividir: Pix por qr_codes). A secao 6 testa o split.
  check("vincular conta PagBank no perfil -> 200", (await req("PUT", "/estudio/perfil", { token: tF, body: { pagbankContaId: CONTA } })).status === 200);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1300"><rect width="2000" height="1300" fill="#3a6ea5"/></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  const fotoId = (await req("POST", "/estudio/fotos", { token: tF, ...multipart({ titulo: "Foto teste", precoCentavos: "2500" }, jpg) })).json.id;
  const novoPedido = async () => (await req("POST", "/pedidos", { token: tB, body: { fotoIds: [fotoId] } })).json;
  const statusPedido = async (id) => (await prisma.pedido.findUnique({ where: { id } })).status;
  const ordem = (id, ref, charges, extra = {}) => ({ id, reference_id: ref, charges, ...extra });

  secao("2. Configuracao do pagamento para o front");
  check("sem login -> 401", (await req("GET", "/pagamento/config")).status === 401);
  check("fotografo -> 403", (await req("GET", "/pagamento/config", { token: tF })).status === 403);
  responder(200, { public_key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA-chave-publica", created_at: 1 });
  const cfg = await req("GET", "/pagamento/config", { token: tB });
  check("devolve gateway e chave publica do PagBank", cfg.json?.gateway === "pagseguro" && cfg.json.chavePublicaCartao?.startsWith("MIIB"), cfg.json);
  check("chave publica pedida ao PagBank com POST /public-keys {type: card}", chamadas.at(-1).url === "https://sandbox.api.pagseguro.com/public-keys" && chamadas.at(-1).corpo.type === "card");
  const n0 = chamadas.length;
  await req("GET", "/pagamento/config", { token: tB });
  check("chave publica fica em cache (sem nova chamada)", chamadas.length === n0);
  check("token nao aparece na configuracao devolvida", !JSON.stringify(cfg.json).includes(TOKEN));

  secao("3. Pix");
  let ped = await novoPedido();
  const pagar = (id, body) => req("POST", `/pedidos/${id}/pagamento`, { token: tB, body });
  check("Pix sem CPF -> 400", (await pagar(ped.id, { metodo: "pix" })).status === 400);
  check("Pix com CPF invalido -> 400", (await pagar(ped.id, { metodo: "pix", cpf: "11111111111" })).status === 400);
  check("nenhuma chamada ao PagBank foi feita com dados invalidos", chamadas.length === n0);
  responder(201, { id: "ORDE_AAAA-1111", reference_id: "x", qr_codes: [{ id: "QRCO_1", text: "00020126PIXDOPAGBANK6304ABCD", links: [] }] });
  const pix = await pagar(ped.id, { metodo: "pix", cpf: "529.982.247-25" });
  check("Pix criado: pedido segue pendente e traz o copia e cola do PagBank", pix.status === 200 && pix.json.status === "pendente" && pix.json.pagamentos[0].pixCopiaECola === "00020126PIXDOPAGBANK6304ABCD", pix.json);
  const c = chamadas.at(-1);
  check("POST /orders no sandbox com Bearer e chave de idempotencia", c.url === "https://sandbox.api.pagseguro.com/orders" && c.headers.Authorization === `Bearer ${TOKEN}` && c.headers["x-idempotency-key"] === c.corpo.reference_id);
  check("corpo do Pix: valor em centavos, cliente com CPF, URL de notificacao e expiracao -03:00", c.corpo.qr_codes[0].amount.value === 2500 && c.corpo.customer.tax_id === CPF && c.corpo.customer.email === "bia@teste.com" && c.corpo.notification_urls[0] === config.pagseguro.urlNotificacao && /-03:00$/.test(c.corpo.qr_codes[0].expiration_date), c.corpo);
  check("item do pedido enviado com o mesmo valor", c.corpo.items[0].unit_amount === 2500 && c.corpo.items[0].quantity === 1);
  const pg = await prisma.pagamento.findFirst({ where: { pedidoId: ped.id } });
  check("gatewayPedidoId guardado para consulta posterior", pg.gatewayPedidoId === "ORDE_AAAA-1111" && pg.referenciaGateway === c.corpo.reference_id);
  const refPix = pg.referenciaGateway;
  const tudo = JSON.stringify(await prisma.pagamento.findMany()) + JSON.stringify(await prisma.auditoria.findMany(), (k, v) => (typeof v === "bigint" ? v.toString() : v));
  check("o CPF do pagador NAO e gravado no banco nem na auditoria", !tudo.includes(CPF) && !tudo.includes("529.982"));
  check("simular-pix desabilitado com gateway real -> 403", (await req("POST", `/pedidos/${ped.id}/pagamento/simular-pix`, { token: tB })).status === 403);
  const whBruto = JSON.stringify({ x: 1 });
  check("webhook do gateway simulado (HMAC proprio) nao existe com PagSeguro -> 404", (await req("POST", "/pagamentos/webhook", { headers: { "content-type": "application/json", "x-lenspro-assinatura": "abc" }, payload: whBruto })).status === 404);

  secao("4. Notificacao (webhook) do PagBank");
  const hook = (corpo, token) => req("POST", "/pagamentos/webhook/pagseguro", { headers: { "content-type": "application/json", ...(token === undefined ? {} : { "x-authenticity-token": token }) }, payload: corpo });
  const pago = JSON.stringify(ordem("ORDE_AAAA-1111", refPix, [{ id: "CHAR_1", status: "PAID", amount: { value: 2500, currency: "BRL" }, payment_method: { type: "PIX" } }]));
  check("sem x-authenticity-token -> 401", (await hook(pago)).status === 401);
  check("token de autenticidade errado -> 401", (await hook(pago, "0".repeat(64))).status === 401);
  check("token calculado com OUTRO segredo -> 401", (await hook(pago, crypto.createHash("sha256").update(`outro-${pago}`).digest("hex"))).status === 401);
  check("token valido mas corpo alterado -> 401", (await hook(pago + " ", hmacToken(pago))).status === 401);
  check("token com formato invalido -> 401", (await hook(pago, "nao-e-hex")).status === 401);
  check("pedido continua pendente apos tentativas invalidas", (await statusPedido(ped.id)) === "pendente");
  const emAnalise = JSON.stringify(ordem("ORDE_AAAA-1111", refPix, [{ id: "CHAR_1", status: "WAITING", amount: { value: 2500 } }]));
  check("estado intermediario (WAITING) e reconhecido e ignorado", (await hook(emAnalise, hmacToken(emAnalise))).json?.resultado === "ignorado" && (await statusPedido(ped.id)) === "pendente");
  const valorErrado = JSON.stringify(ordem("ORDE_AAAA-1111", refPix, [{ id: "CHAR_1", status: "PAID", amount: { value: 100 } }]));
  const rv = await hook(valorErrado, hmacToken(valorErrado));
  check("PAGO com valor DIVERGENTE nao libera o pedido", rv.json?.resultado === "ignorado" && (await statusPedido(ped.id)) === "pendente", rv.json);
  check("divergencia de valor registrada na auditoria", (await prisma.auditoria.count({ where: { acao: "WEBHOOK_VALOR_DIVERGENTE" } })) === 1);
  const r1 = await hook(pago, hmacToken(pago));
  check("notificacao PAGA autentica -> pedido PAGO", r1.status === 200 && r1.json.resultado === "aplicado" && (await statusPedido(ped.id)) === "pago", r1.json);
  check("notificacao repetida e idempotente", (await hook(pago, hmacToken(pago))).json?.resultado === "ignorado");
  const desconhecido = JSON.stringify(ordem("ORDE_Z", "LPnaoexiste", [{ status: "PAID", amount: { value: 2500 } }]));
  check("referencia desconhecida: 200 'ignorado' (gateway nao reenvia para sempre)", (await hook(desconhecido, hmacToken(desconhecido))).json?.resultado === "ignorado");
  check("JSON invalido (autenticado) -> 400", (await hook("nao json", hmacToken("nao json"))).status === 400);
  const itemId = (await req("GET", "/compras", { token: tB })).json.itens[0].itemId;
  check("apos o Pix pago o comprador baixa o original", (await req("GET", `/compras/${itemId}/download`, { token: tB })).status === 200);
  const dep = JSON.stringify(ordem("ORDE_AAAA-1111", refPix, [{ status: "CANCELED", amount: { value: 2500 } }]));
  check("estorno/cancelamento DEPOIS de pago nao desfaz a compra (fora do escopo, nao quebra)", (await hook(dep, hmacToken(dep))).json?.resultado === "ignorado" && (await statusPedido(ped.id)) === "pago");

  secao("5. Cartao (cifrado pelo SDK do PagBank)");
  await prisma.itemPedido.deleteMany({}); // libera a foto para uma nova compra nos testes
  await prisma.pagamento.deleteMany({}); await prisma.pedido.deleteMany({});
  ped = await novoPedido();
  check("cartao em texto puro (sem criptografado) -> 400", (await pagar(ped.id, { metodo: "cartao", cpf: CPF, cartao: { nome: "BIA TESTE", numero: "4242424242424242", validade: "12/39", cvv: "123" } })).status === 400);
  check("cartao sem CPF -> 400", (await pagar(ped.id, { metodo: "cartao", cartao: { nome: "BIA TESTE", criptografado: "x".repeat(60) } })).status === 400);
  const antes = chamadas.length;
  check("nada foi enviado ao PagBank com dados invalidos", chamadas.length === antes);
  const cartaoOk = { nome: "BIA TESTE", criptografado: "ENCRYPTED-" + "a".repeat(80) };
  responder(201, ordem("ORDE_CARD-1", "x", [{ id: "CHAR_2", status: "DECLINED", amount: { value: 2500 }, payment_response: { code: "10000", message: "NAO AUTORIZADO" }, payment_method: { type: "CREDIT_CARD", card: { brand: "visa", last_digits: "1111" } } }]));
  const rec = await pagar(ped.id, { metodo: "cartao", cpf: CPF, cartao: cartaoOk });
  check("cartao recusado: pedido continua pendente com o motivo do emissor", rec.status === 200 && rec.json.status === "pendente" && rec.json.pagamentos.some((g) => g.status === "recusado" && g.motivoRecusa === "NAO AUTORIZADO"), rec.json);
  const cc = chamadas.at(-1).corpo.charges[0];
  check("cobranca enviada: captura imediata, 1 parcela, cartao CIFRADO e titular com CPF", cc.payment_method.type === "CREDIT_CARD" && cc.payment_method.capture === true && cc.payment_method.installments === 1 && cc.payment_method.card.encrypted === cartaoOk.criptografado && cc.payment_method.card.store === false && cc.payment_method.holder.tax_id === CPF && cc.amount.value === 2500 && cc.amount.currency === "BRL", cc);
  responder(201, ordem("ORDE_CARD-2", "x", [{ id: "CHAR_3", status: "PAID", amount: { value: 2500 }, payment_response: { code: "20000", message: "SUCESSO" }, payment_method: { type: "CREDIT_CARD", card: { brand: "mastercard", last_digits: "4444", first_digits: "555555" } } }]));
  const apr = await pagar(ped.id, { metodo: "cartao", cpf: CPF, cartao: cartaoOk });
  check("cartao aprovado: pedido PAGO", apr.status === 200 && apr.json.status === "pago", apr.json);
  const reg = await prisma.pagamento.findFirst({ where: { status: "aprovado" } });
  check("so bandeira e 4 ultimos digitos gravados (vindos do PagBank)", reg.cartaoBandeira === "mastercard" && reg.cartaoFinal === "4444");
  const dump = JSON.stringify(await prisma.pagamento.findMany()) + JSON.stringify(await prisma.auditoria.findMany(), (k, v) => (typeof v === "bigint" ? v.toString() : v));
  check("texto cifrado do cartao, CPF e token NAO ficam no banco", !dump.includes("ENCRYPTED") && !dump.includes(CPF) && !dump.includes(TOKEN));

  secao("6. Cartao em analise e reconciliacao");
  await prisma.pagamento.deleteMany({}); await prisma.itemPedido.deleteMany({}); await prisma.pedido.deleteMany({});
  ped = await novoPedido();
  responder(201, ordem("ORDE_ANALISE", "x", [{ id: "CHAR_4", status: "IN_ANALYSIS", amount: { value: 2500 }, payment_method: { type: "CREDIT_CARD", card: { brand: "visa", last_digits: "1111" } } }]));
  const an = await pagar(ped.id, { metodo: "cartao", cpf: CPF, cartao: cartaoOk });
  check("em analise: pedido pendente e pagamento aguardando", an.json?.status === "pendente" && an.json.pagamentos[0].status === "pendente", an.json);
  const refAn = (await prisma.pagamento.findFirst({ where: { pedidoId: ped.id } })).referenciaGateway;
  responder(200, ordem("ORDE_ANALISE", refAn, [{ id: "CHAR_4", status: "PAID", amount: { value: 2500 } }]));
  const ver = await req("POST", `/pedidos/${ped.id}/pagamento/verificar`, { token: tB });
  check("verificar: consulta GET /orders/{id} e confirma o pagamento", ver.status === 200 && ver.json.status === "pago" && chamadas.at(-1).metodo === "GET" && chamadas.at(-1).url.endsWith("/orders/ORDE_ANALISE"), ver.json);
  check("verificar sem login -> 401, de outro comprador -> 404", (await req("POST", `/pedidos/${ped.id}/pagamento/verificar`)).status === 401);
  const tB2 = await cad("Caio", "comprador");
  check("verificar pedido alheio -> 404", (await req("POST", `/pedidos/${ped.id}/pagamento/verificar`, { token: tB2 })).status === 404);
  // Pix: webhook perdido, reconciliado por consulta
  await prisma.pagamento.deleteMany({}); await prisma.itemPedido.deleteMany({}); await prisma.pedido.deleteMany({});
  ped = await novoPedido();
  responder(201, { id: "ORDE_PIX2", qr_codes: [{ text: "PIX2" }] });
  await pagar(ped.id, { metodo: "pix", cpf: CPF });
  const ref2 = (await prisma.pagamento.findFirst({ where: { pedidoId: ped.id } })).referenciaGateway;
  responder(200, ordem("ORDE_PIX2", ref2, [{ status: "WAITING", amount: { value: 2500 } }]));
  check("verificar com Pix ainda nao pago: continua pendente", (await req("POST", `/pedidos/${ped.id}/pagamento/verificar`, { token: tB })).json?.status === "pendente");
  responder(200, ordem("ORDE_PIX2", ref2, [{ status: "PAID", amount: { value: 2500 } }]));
  check("verificar com Pix pago (webhook perdido) -> pedido PAGO", (await req("POST", `/pedidos/${ped.id}/pagamento/verificar`, { token: tB })).json?.status === "pago");
  responder(200, ordem("ORDE_OUTRO", "LPoutra", [{ status: "PAID", amount: { value: 2500 } }]));
  check("verificar com pedido ja pago nem chama o gateway", (await req("POST", `/pedidos/${ped.id}/pagamento/verificar`, { token: tB })).json?.status === "pago" && proximo.length === 1);
  proximo = [];

  secao("7. Falhas do gateway");
  await prisma.pagamento.deleteMany({}); await prisma.itemPedido.deleteMany({}); await prisma.pedido.deleteMany({});
  ped = await novoPedido();
  responder(500, { erro: "interno" });
  const f500 = await pagar(ped.id, { metodo: "pix", cpf: CPF });
  check("PagBank 500 -> 502 sem detalhes internos", f500.status === 502 && f500.json.erro === "GatewayIndisponivel" && !JSON.stringify(f500.json).includes("interno"), f500.json);
  check("o pedido continua pendente e o pagamento falho fica cancelado (nova tentativa liberada)", (await statusPedido(ped.id)) === "pendente" && (await prisma.pagamento.count({ where: { pedidoId: ped.id, status: "pendente" } })) === 0);
  proximo.push({ erro: true });
  check("timeout/queda de rede -> 502", (await pagar(ped.id, { metodo: "pix", cpf: CPF })).status === 502);
  responder(401, { error_messages: [{ code: "40001", description: "invalid token" }] });
  const f401 = await pagar(ped.id, { metodo: "pix", cpf: CPF });
  check("token da conta invalido (401 do PagBank) vira 502 generico, sem vazar o motivo", f401.status === 502 && !JSON.stringify(f401.json).includes("token"), f401.json);
  responder(400, { error_messages: [{ code: "40002", description: "invalid_parameter: tax_id" }] });
  const f400 = await pagar(ped.id, { metodo: "pix", cpf: CPF });
  check("dados rejeitados pelo PagBank (400) -> 400 com a mensagem", f400.status === 400 && /tax_id/.test(f400.json.mensagem), f400.json);
  responder(201, { id: "ORDE_OK", qr_codes: [{ text: "PIXOK" }] });
  check("depois das falhas, nova tentativa funciona", (await pagar(ped.id, { metodo: "pix", cpf: CPF })).json?.pagamentos?.some((g) => g.pixCopiaECola === "PIXOK"));
  responder(200, { sem: "qr" });
  check("resposta sem QR code (anomala) -> 502", (await pagar(ped.id, { metodo: "pix", cpf: CPF })).status === 502);
  check("falhas registradas na auditoria", (await prisma.auditoria.count({ where: { acao: "PAGAMENTO_FALHA_GATEWAY" } })) >= 4);

  secao("8. Interpretacao de notificacoes (funcao pura)");
  check("PAID -> aprovado com valor", interpretarPedidoPagBank({ reference_id: "R", charges: [{ status: "PAID", amount: { value: 10 } }] })?.status === "aprovado");
  check("DECLINED -> recusado com motivo", interpretarPedidoPagBank({ reference_id: "R", charges: [{ status: "DECLINED", payment_response: { message: "SEM SALDO" } }] })?.motivo === "SEM SALDO");
  check("CANCELED -> cancelado", interpretarPedidoPagBank({ reference_id: "R", charges: [{ status: "CANCELED" }] })?.status === "cancelado");
  check("varias cobrancas: a PAGA tem prioridade", interpretarPedidoPagBank({ reference_id: "R", charges: [{ status: "DECLINED" }, { status: "PAID", amount: { value: 5 } }] })?.status === "aprovado");
  check("sem reference_id ou sem charges -> null", interpretarPedidoPagBank({ charges: [{ status: "PAID" }] }) === null && interpretarPedidoPagBank({ reference_id: "R", charges: [] }) === null && interpretarPedidoPagBank(null) === null);

  secao("9. Split: a parte do fotografo vai direto para a conta PagBank dele");
  const CONTA_F = "ACCO_FABIO-0001-AAAA";
  const CONTA_G = "ACCO_GABI-0002-BBBB";
  const perfil = (token, body) => req("PUT", "/estudio/perfil", { token, body });
  check("ID de conta invalido -> 400", (await perfil(tF, { pagbankContaId: "12345" })).status === 400 && (await perfil(tF, { pagbankContaId: "ACCO_ x" })).status === 400);
  const pv = await perfil(tF, { pagbankContaId: CONTA_F });
  check("fotografo vincula a conta PagBank e a API devolve o id", pv.status === 200 && pv.json.pagbankContaId === CONTA_F, pv.json);
  check("o perfil publico NAO expoe a conta PagBank", !JSON.stringify((await req("GET", `/fotografos/${(await prisma.usuario.findFirst({ where: { email: "fabio@teste.com" } })).id}`)).json).includes("ACCO_"));
  const tG = await cad("Gabi", "fotografo");
  const fotoG = (await req("POST", "/estudio/fotos", { token: tG, ...multipart({ titulo: "Foto da Gabi", precoCentavos: "4000" }, jpg) })).json.id;
  const pedidoCom = async (...ids) => (await req("POST", "/pedidos", { token: tB, body: { fotoIds: ids } })).json;
  await prisma.pagamento.deleteMany({}); await prisma.itemPedido.deleteMany({}); await prisma.pedido.deleteMany({});

  // Fotografo sem conta vinculada: a venda nao pode ser dividida -> recusa clara, sem chamar o PagBank
  ped = await pedidoCom(fotoG);
  const nChamadas = chamadas.length;
  const sem = await pagar(ped.id, { metodo: "pix", cpf: CPF });
  check("fotografo SEM conta vinculada -> 409 com mensagem clara", sem.status === 409 && /Gabi/.test(sem.json.mensagem) && /conta de recebimento/.test(sem.json.mensagem), sem.json);
  check("nenhuma chamada ao PagBank e nenhum pagamento criado", chamadas.length === nChamadas && (await prisma.pagamento.count({ where: { pedidoId: ped.id } })) === 0);
  check("o pedido continua pendente (da para remover a foto e tentar de novo)", (await statusPedido(ped.id)) === "pendente");
  check("Gabi vincula a conta", (await perfil(tG, { pagbankContaId: CONTA_G })).status === 200);

  // Pix dividido entre 2 fotografos + plataforma (cada item com preco e taxa travados no pedido)
  await prisma.pagamento.deleteMany({}); await prisma.itemPedido.deleteMany({}); await prisma.pedido.deleteMany({});
  ped = await pedidoCom(fotoId, fotoG);
  const itens = await prisma.itemPedido.findMany({ where: { pedidoId: ped.id } });
  const total = itens.reduce((a, i) => a + i.precoCentavos, 0);
  const liqF = itens.filter((i) => i.fotoId === fotoId).reduce((a, i) => a + i.precoCentavos - i.taxaPlataformaCentavos, 0);
  const liqG = itens.filter((i) => i.fotoId === fotoG).reduce((a, i) => a + i.precoCentavos - i.taxaPlataformaCentavos, 0);
  const taxas = itens.reduce((a, i) => a + i.taxaPlataformaCentavos, 0);
  responder(201, { id: "ORDE_SPLIT1", charges: [{ status: "WAITING", payment_method: { type: "PIX", pix: { qr_code_text: "PIXDIVIDIDO" } } }] });
  const ps = await pagar(ped.id, { metodo: "pix", cpf: CPF });
  const cs = chamadas.at(-1).corpo;
  const recs = cs.charges?.[0]?.splits?.receivers ?? [];
  const valorDe = (id) => recs.find((x) => x.account.id === id)?.amount.value;
  check("Pix dividido: usa charges (PIX) com splits e nao qr_codes", ps.status === 200 && cs.charges[0].payment_method.type === "PIX" && cs.charges[0].splits.method === "FIXED" && !cs.qr_codes, cs);
  check("cada fotografo recebe o liquido dele", valorDe(CONTA_F) === liqF && valorDe(CONTA_G) === liqG && liqF > 0 && liqG > 0, recs);
  check("a plataforma (dono do token) recebe a soma das taxas", valorDe(CONTA) === taxas && taxas > 0, recs);
  check("a soma dos recebedores fecha com o total da cobranca", recs.reduce((a, x) => a + x.amount.value, 0) === total && cs.charges[0].amount.value === total);
  check("sem custodia (repasse imediato) e valores inteiros em centavos", recs.every((x) => x.configurations.custody.apply === false && Number.isInteger(x.amount.value)));
  check("copia e cola lido da resposta da cobranca", ps.json.pagamentos[0].pixCopiaECola === "PIXDIVIDIDO", ps.json);
  check("contas PagBank dos fotografos nao vazam para a resposta do comprador", !JSON.stringify(ps.json).includes("ACCO_"));
  check("auditoria registra quantos recebedores, sem as contas", (await prisma.auditoria.findMany({ where: { acao: "PAGAMENTO_PIX_GERADO" } })).some((a) => JSON.stringify(a.detalhes ?? a.dados ?? a).includes("recebedores")) && !JSON.stringify(await prisma.auditoria.findMany(), (k, v) => (typeof v === "bigint" ? v.toString() : v)).includes("ACCO_"));
  responder(201, { id: "ORDE_SPLIT2", charges: [{ status: "WAITING", payment_method: { type: "PIX" } }] });
  check("Pix dividido sem QR na resposta (formato inesperado) -> 502, nada e cobrado", (await pagar(ped.id, { metodo: "pix", cpf: CPF })).status === 502 && (await prisma.pagamento.count({ where: { pedidoId: ped.id, status: "pendente" } })) === 0);

  // Cartao dividido
  responder(201, ordem("ORDE_SPLIT3", "x", [{ id: "CHAR_S", status: "PAID", amount: { value: total }, payment_method: { type: "CREDIT_CARD", card: { brand: "visa", last_digits: "1111" } } }]));
  const ccs = await pagar(ped.id, { metodo: "cartao", cpf: CPF, cartao: { nome: "BIA TESTE", criptografado: "x".repeat(40) } });
  const cs2x = chamadas.at(-1).corpo;
  check("cartao dividido: splits na cobranca, com os mesmos valores", ccs.status === 200 && JSON.stringify(cs2x.charges[0].splits.receivers) === JSON.stringify(recs) && cs2x.charges[0].payment_method.type === "CREDIT_CARD", cs2x);

  secao("10. Montagem do split (funcao pura)");
  const A = "ACCO_PLATAFORMA-0001";
  const m1 = montarDivisao(A, 10000, [{ contaId: "ACCO_UM-0001", valorCentavos: 8500 }]);
  check("1 fotografo: ele + plataforma, soma = total", m1.receivers.length === 2 && m1.receivers.reduce((a, r) => a + r.amount.value, 0) === 10000 && m1.method === "FIXED");
  const m2 = montarDivisao(A, 10000, [{ contaId: "ACCO_UM-0001", valorCentavos: 4000 }, { contaId: "ACCO_UM-0001", valorCentavos: 2000 }, { contaId: "ACCO_DOIS-0002", valorCentavos: 3000 }]);
  check("itens do mesmo fotografo viram UM recebedor", m2.receivers.length === 3 && m2.receivers.find((r) => r.account.id === "ACCO_UM-0001").amount.value === 6000);
  check("fotografo que e a propria conta da plataforma: nada a dividir (sem split)", montarDivisao(A, 10000, [{ contaId: A, valorCentavos: 8500 }]) === null);
  let lancou = false; try { montarDivisao(A, 10000, [{ contaId: "ACCO_UM-0001", valorCentavos: 10000 }]); } catch { lancou = true; }
  check("sem parte para a plataforma (taxa zero) o split e recusado (invalido no PagBank)", lancou);
  lancou = false; try { montarDivisao(A, 10000, [{ contaId: "ACCO_UM-0001", valorCentavos: 12000 }]); } catch { lancou = true; }
  check("repasses maiores que o total sao recusados", lancou);
  lancou = false; try { montarDivisao(A, 10000, [{ contaId: "ACCO_UM-0001", valorCentavos: 0 }]); } catch { lancou = true; }
  check("valor zero/negativo recusado", lancou);

  secao("11. Configuracao do split");
  check("pagseguro sem PAGSEGURO_CONTA_ID e recusado", falha({ PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN }));
  check("PAGSEGURO_CONTA_ID invalido e recusado", falha({ PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: "minha-conta" }));
  check("taxa 0% com PagSeguro e recusada (split exige parte positiva da plataforma)", falha({ PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: TOKEN, PAGSEGURO_CONTA_ID: CONTA, TAXA_PLATAFORMA_PERCENT: "0" }));
  check("taxa 0% com o gateway simulado continua valida", !falha({ TAXA_PLATAFORMA_PERCENT: "0" }));

  await app.close();
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(resumo("PagSeguro") ? 0 : 1);
})().catch((e) => { console.error("ERRO NOS TESTES:", e); process.exit(1); });
