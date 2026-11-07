// spiderman
// Testes das camadas de seguranca/experiencia do ciclo 3: sessao por cookie HttpOnly + CSRF, sessao com teto,
// URLs assinadas e anti-hotlink dos previews, home dinamica, cabecalhos e envio de e-mail (SMTP).
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { createTransport } = require("nodemailer");
const { check, secao, resumo, multipart } = require("./helpers");
const { criarApp } = require("../dist/app");
const { criarPrisma } = require("../dist/db/prisma");
const { carregarConfiguracao } = require("../dist/config");
const { AssinadorUrls } = require("../dist/core/urlAssinada");
const { EnviadorSmtp } = require("../dist/services/Mailer");
const { lerCookie } = require("../dist/plugins/autenticacao");

const URL_DB = process.env.TEST_DATABASE_URL || "postgresql://lenspro:lenspro@localhost:5432/lenspro_test";
const SENHA = "Senha#Forte1";
const P = "/api/v1";

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-seg-"));
  const env = { DATABASE_URL: URL_DB, JWT_SECRET: "y".repeat(40), WEBHOOK_SECRET: "segredo-de-teste-do-webhook", DATA_DIR: dir, BCRYPT_ROUNDS: "4", LIMITE_AUTH_POR_MINUTO: "0", LOG_LEVEL: "silent", NODE_ENV: "test" };
  const config = carregarConfiguracao(env);
  const prisma = criarPrisma(URL_DB);
  await prisma.$executeRawUnsafe('TRUNCATE "Auditoria","MensagemContato","Pagamento","ItemPedido","Pedido","Foto","Evento","PerfilFotografo","Usuario" RESTART IDENTITY CASCADE');
  const { app } = await criarApp(config, prisma);
  await app.ready();
  const raw = (m, u, o = {}) => app.inject({ method: m, url: u.startsWith("/") && !u.startsWith(P) && !u.startsWith("/docs") ? P + u : u, headers: o.headers, payload: o.payload ?? o.body });
  const j = (r) => { try { return r.json(); } catch { return null; } };
  const cookieDe = (r) => /lp_sessao=([^;]+)/.exec([].concat(r.headers["set-cookie"] ?? []).join(";"))?.[1];

  secao("1. Sessao por cookie HttpOnly");
  const cad = await raw("POST", "/auth/cadastro", { body: { nome: "Bia", sobrenome: "Teste", email: "bia@teste.com", senha: SENHA, tipo: "comprador" } });
  const sc = [].concat(cad.headers["set-cookie"] ?? []).join(";");
  check("login/cadastro define cookie HttpOnly, SameSite=Strict, Path=/api, com validade", /lp_sessao=/.test(sc) && /HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\/api/.test(sc) && /Max-Age=1800/.test(sc), sc);
  check("fora de producao o cookie nao tem Secure (http://localhost funciona)", !/Secure/i.test(sc));
  const ck = cookieDe(cad);
  const comCookie = { cookie: `lp_sessao=${ck}` };
  check("GET autenticado so com o cookie -> 200", (await raw("GET", "/auth/eu", { headers: comCookie })).statusCode === 200);
  check("escrita com cookie SEM cabecalho CSRF -> 403", (await raw("PATCH", "/auth/eu", { headers: comCookie, body: { nome: "Beatriz" } })).statusCode === 403);
  check("escrita com cookie e cabecalho CSRF -> 200", (await raw("PATCH", "/auth/eu", { headers: { ...comCookie, "x-lenspro-csrf": "1" }, body: { nome: "Beatriz" } })).statusCode === 200);
  check("cliente de API com Bearer nao precisa do cabecalho CSRF", (await raw("PATCH", "/auth/eu", { headers: { authorization: "Bearer " + j(cad).token }, body: { nome: "Bia" } })).statusCode === 200);
  check("cookie adulterado -> 401", (await raw("GET", "/auth/eu", { headers: { cookie: `lp_sessao=${ck.slice(0, -4)}AAAA` } })).statusCode === 401);
  check("cookie lido corretamente entre outros cookies", lerCookie("a=1; lp_sessao=XYZ; b=2", "lp_sessao") === "XYZ" && lerCookie("a=1", "lp_sessao") === undefined && lerCookie(undefined, "x") === undefined);
  const sair = await raw("POST", "/auth/sair");
  check("sair apaga o cookie (Max-Age=0) e funciona sem sessao", sair.statusCode === 204 && /lp_sessao=;/.test([].concat(sair.headers["set-cookie"]).join(";")) && /Max-Age=0/.test([].concat(sair.headers["set-cookie"]).join(";")));
  const ren = await raw("POST", "/auth/renovar", { headers: { ...comCookie, "x-lenspro-csrf": "1" } });
  check("renovar reemite o cookie", ren.statusCode === 200 && !!cookieDe(ren));

  secao("2. Sessao: troca de senha e teto de duracao");
  const tkAntigo = j(cad).token;
  const troca = await raw("PUT", "/auth/senha", { headers: { authorization: "Bearer " + tkAntigo }, body: { senhaAtual: SENHA, novaSenha: "Nova#Senha9" } });
  check("trocar a senha -> 204 e entrega cookie novo", troca.statusCode === 204 && !!cookieDe(troca));
  check("token ANTIGO morre apos a troca de senha (outros dispositivos saem)", (await raw("GET", "/auth/eu", { headers: { authorization: "Bearer " + tkAntigo } })).statusCode === 401);
  check("o cookie novo vale", (await raw("GET", "/auth/eu", { headers: { cookie: `lp_sessao=${cookieDe(troca)}` } })).statusCode === 200);
  const usuario = await prisma.usuario.findUnique({ where: { email: "bia@teste.com" } });
  const velho = app.jwt.sign({ sub: usuario.id, papel: "comprador", sv: j(await raw("POST", "/auth/login", { body: { email: "bia@teste.com", senha: "Nova#Senha9" } })) && require("crypto").createHash("sha256").update("sv|" + usuario.senhaHash).digest("hex").slice(0, 12), inicio: Math.floor(Date.now() / 1000) - 13 * 3600 });
  check("token ainda valido, mas com sessao iniciada ha 13 h: renovar -> 401 (teto de 12 h)", (await raw("POST", "/auth/renovar", { headers: { authorization: "Bearer " + velho } })).statusCode === 401);

  secao("3. URLs assinadas dos previews");
  await raw("POST", "/auth/cadastro", { body: { nome: "Fabio", sobrenome: "Teste", email: "fabio@teste.com", senha: SENHA, tipo: "fotografo", nomeArtistico: "Fabio Foto" } });
  const tF = j(await raw("POST", "/auth/login", { body: { email: "fabio@teste.com", senha: SENHA } })).token;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1300"><rect width="2000" height="1300" fill="#2a9d8f"/></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  const publicar = async (titulo, preco) => {
    const m = multipart({ titulo, precoCentavos: preco }, jpg);
    return j(await raw("POST", "/estudio/fotos", { headers: { authorization: "Bearer " + tF, ...m.headers }, payload: m.payload }));
  };
  const pub = await publicar("Foto A", "2500");
  const pub2 = await publicar("Foto B", "3500");
  const [base, query] = pub.urlPreview.split("?");
  check("URL do preview vem assinada (?e=expiracao&s=assinatura)", /^\/api\/v1\/fotos\/[0-9a-f-]{36}\/preview$/.test(base) && /^e=\d+&s=[A-Za-z0-9_-]{43}$/.test(query), pub.urlPreview);
  check("preview com assinatura valida -> 200 JPEG", (await raw("GET", pub.urlPreview)).statusCode === 200);
  check("preview SEM assinatura -> 403", (await raw("GET", base)).statusCode === 403);
  check("assinatura adulterada -> 403", (await raw("GET", `${base}?e=${/e=(\d+)/.exec(query)[1]}&s=${"A".repeat(43)}`)).statusCode === 403);
  check("expiracao alterada (prorrogada) -> 403", (await raw("GET", `${base}?e=${Number(/e=(\d+)/.exec(query)[1]) + 99999}&s=${/s=(.+)/.exec(query)[1]}`)).statusCode === 403);
  check("assinatura de OUTRA foto nao serve -> 403", (await raw("GET", pub2.urlPreview.split("?")[0] + "?" + query)).statusCode === 403);
  check("assinatura da miniatura nao serve para o preview -> 403", (await raw("GET", base + "?" + pub.urlMiniatura.split("?")[1])).statusCode === 403);
  check("miniatura assinada -> 200", (await raw("GET", pub.urlMiniatura)).statusCode === 200);
  let agora = Date.now();
  const as1 = new AssinadorUrls("segredo", () => agora);
  const u1 = as1.assinar("id", "preview");
  const [, e1, s1] = /e=(\d+)&s=(.+)$/.exec(u1);
  check("assinador: valido agora", as1.verificar("id", "preview", e1, s1) === "ok");
  agora += 5 * 3600 * 1000 + 1;
  check("assinador: expira em poucas horas (link copiado deixa de funcionar)", as1.verificar("id", "preview", e1, s1) === "expirada");
  check("assinador: a URL e estavel dentro da mesma hora (cache do navegador funciona)", new AssinadorUrls("s", () => 1_000_000).assinar("i", "preview") === new AssinadorUrls("s", () => 1_000_000 + 600_000).assinar("i", "preview"));
  check("assinador: segredo diferente invalida", new AssinadorUrls("outro", () => agora).verificar("id", "preview", e1, s1) !== "ok");

  secao("4. Anti-hotlink e anti-download casual");
  const img = (h) => raw("GET", pub.urlPreview, { headers: h });
  check("imagem dentro do site (Sec-Fetch-Dest: image, same-origin) -> 200", (await img({ "sec-fetch-dest": "image", "sec-fetch-site": "same-origin" })).statusCode === 200);
  check("abrir a imagem direto numa aba (Sec-Fetch-Dest: document) -> 403", (await img({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" })).statusCode === 403);
  check("incorporada em OUTRO site (Sec-Fetch-Site: cross-site) -> 403", (await img({ "sec-fetch-dest": "image", "sec-fetch-site": "cross-site" })).statusCode === 403);
  const ok = await img({});
  check("cabecalhos do preview: cache privado, nosniff, noindex", /private/.test(ok.headers["cache-control"]) && ok.headers["x-content-type-options"] === "nosniff" && /noimageindex/.test(ok.headers["x-robots-tag"]));
  const meta = await sharp(ok.rawPayload).metadata();
  check("preview servido tem no maximo 1200 px", Math.max(meta.width, meta.height) <= 1200);
  const exif = await sharp(ok.rawPayload).raw().toBuffer();
  const base0 = await sharp(jpg).resize({ width: meta.width }).jpeg({ quality: 68 }).raw().toBuffer();
  let dif = 0; for (let i = 0; i < exif.length; i += 211) dif += Math.abs(exif[i] - base0[i]);
  check("marca d'agua nos pixels (inclui faixa de credito na base)", dif / (exif.length / 211) > 4, dif / (exif.length / 211));
  const rodape = await sharp(ok.rawPayload).extract({ left: 0, top: meta.height - Math.round(meta.height * 0.05), width: meta.width, height: Math.round(meta.height * 0.04) }).stats();
  check("faixa de credito escurece a base da imagem (rodape bem mais escuro que o original)", rodape.channels[0].mean < 70, rodape.channels[0].mean);

  secao("5. Home dinamica");
  const h = await raw("GET", "/destaques");
  const hd = j(h);
  check("GET /destaques e publico (200)", h.statusCode === 200 && Array.isArray(hd.destaques) && Array.isArray(hd.rotativas));
  check("traz as 2 fotos, com URLs assinadas e sem dados do original", hd.destaques.length === 2 && hd.rotativas.length === 2 && hd.destaques.every((f) => /\?e=\d+&s=/.test(f.urlPreview)) && !/sha256|original/i.test(JSON.stringify(hd)));
  check("estatisticas da vitrine", hd.estatisticas.fotos === 2 && hd.estatisticas.fotografos === 1);
  await raw("PATCH", `/estudio/fotos/${pub2.id}`, { headers: { authorization: "Bearer " + tF }, body: { status: "oculta" } });
  check("ocultar uma foto a remove da home na hora (cache invalidado)", j(await raw("GET", "/destaques")).destaques.length === 1);

  secao("6. Cabecalhos, docs e e-mail");
  const hh = await raw("GET", "/auth/eu", { headers: { authorization: "Bearer " + tF } });
  check("respostas da API nao ficam em cache (no-store)", hh.headers["cache-control"] === "no-store");
  check("Permissions-Policy desliga camera/microfone/geolocalizacao", /camera=\(\)/.test(hh.headers["permissions-policy"]));
  check("com gateway simulado o CSP nao libera scripts de terceiros", !/pagseguro/.test((await raw("GET", "/health")).headers["content-security-policy"]));
  check("documentacao /docs ligada fora de producao", (await raw("GET", "/docs/json")).statusCode === 200);
  const cfgProd = carregarConfiguracao({ ...env, NODE_ENV: "production", PAGAMENTO_GATEWAY: "pagseguro", PAGSEGURO_TOKEN: "t".repeat(30), PAGSEGURO_CONTA_ID: "ACCO_PLATAFORMA-0001", URL_PUBLICA: "https://x.com", SMTP_URL: "smtps://u:p@s:465" });
  check("em producao /docs fica desligado por padrao e os cookies sao Secure", cfgProd.exporDocs === false && cfgProd.producao === true);
  const { app: app2 } = await criarApp({ ...cfgProd, diretorioDados: dir, logLevel: "silent", limiteAuthPorMinuto: 0 }, prisma, { gateway: { nome: "simulado" } });
  await app2.ready();
  const rd = await app2.inject({ method: "GET", url: "/docs/json" });
  const rs = await app2.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-forwarded-proto": "https" }, payload: { email: "bia@teste.com", senha: "Nova#Senha9" } });
  const rh = await app2.inject({ method: "GET", url: "/api/v1/health", headers: { "x-forwarded-proto": "http", host: "loja.com" } });
  check("producao: /docs nao expoe o contrato (cai no front, nunca no Swagger)", !/openapi/.test(rd.body));
  check("producao: cookie com Secure e HSTS", /Secure/.test([].concat(rs.headers["set-cookie"]).join(";")) && /max-age=31536000/.test(rs.headers["strict-transport-security"] || ""), rs.headers["strict-transport-security"]);
  check("producao: http atras do proxy e redirecionado para https (308)", rh.statusCode === 308 && rh.headers.location === "https://loja.com/api/v1/health", rh.headers.location);
  await app2.close();
  const t = createTransport({ jsonTransport: true });
  const envio = await new EnviadorSmtp("", "LensPro <a@b.com>", t).enviar("c@d.com", "Assunto", "Texto");
  check("EnviadorSmtp monta e envia a mensagem (transporte de teste)", envio === undefined);
  const tt = createTransport({ jsonTransport: true });
  let capturada; tt.sendMail = async (m) => { capturada = m; };
  await new EnviadorSmtp("", "LensPro <a@b.com>", tt).enviar("c@d.com", "Assunto", "Corpo");
  check("remetente, destinatario e assunto corretos", capturada.from === "LensPro <a@b.com>" && capturada.to === "c@d.com" && capturada.subject === "Assunto" && capturada.text === "Corpo");
  const aud = JSON.stringify(await prisma.auditoria.findMany({ where: { acao: "LOGIN_FALHA" } }), (k, v) => (typeof v === "bigint" ? v.toString() : v));
  await raw("POST", "/auth/login", { body: { email: "MinhaSenha#123 com espaco", senha: "x" } });
  check("senha digitada por engano no campo e-mail NAO vai para a auditoria", !JSON.stringify(await prisma.auditoria.findMany({ where: { acao: "LOGIN_FALHA" } }), (k, v) => (typeof v === "bigint" ? v.toString() : v)).includes("MinhaSenha"), aud);

  await app.close();
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(resumo("Seguranca") ? 0 : 1);
})().catch((e) => { console.error("ERRO NOS TESTES:", e); process.exit(1); });
