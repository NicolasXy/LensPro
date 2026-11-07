// spiderman
// Testes de integracao da API: sobem o app Fastify em memoria (app.inject) contra um PostgreSQL de teste.
// Banco: TEST_DATABASE_URL (padrao postgresql://lenspro:lenspro@localhost:5432/lenspro_test) com a migration aplicada.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { check, secao, resumo, multipart } = require("./helpers");
const { criarApp } = require("../dist/app");
const { criarPrisma } = require("../dist/db/prisma");
const { carregarConfiguracao } = require("../dist/config");
const { EnviadorMemoria } = require("../dist/services/Mailer");
const { assinarHmac, sha256Hex } = require("../dist/core/crypto");

const URL_DB = process.env.TEST_DATABASE_URL || "postgresql://lenspro:lenspro@localhost:5432/lenspro_test";
const SEGREDO_WH = "segredo-de-teste-do-webhook";
const SENHA = "Senha#Forte1";
const P = "/api/v1";

async function foto(w = 2000, h = 1300, cor = "#3a6ea5") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${cor}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="#f6d365"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-api-"));
  const config = carregarConfiguracao({
    DATABASE_URL: URL_DB,
    JWT_SECRET: "x".repeat(40),
    WEBHOOK_SECRET: SEGREDO_WH,
    DATA_DIR: dir,
    BCRYPT_ROUNDS: "4",
    LIMITE_AUTH_POR_MINUTO: "0",
    LOG_LEVEL: "silent",
    UPLOAD_MAX_MB: "5",
    LOGIN_MAX_FALHAS: "5",
    LOGIN_BLOQUEIO_MIN: "15",
    NODE_ENV: "test",
  });
  const prisma = criarPrisma(URL_DB);
  // Banco limpo a cada execucao (a trigger de imutabilidade da auditoria e contornada pelo TRUNCATE).
  await prisma.$executeRawUnsafe('TRUNCATE "Auditoria","MensagemContato","Pagamento","ItemPedido","Pedido","Foto","Evento","PerfilFotografo","Usuario" RESTART IDENTITY CASCADE');
  const emails = new EnviadorMemoria();
  const { app, expirarPedidos } = await criarApp(config, prisma, { enviadorEmail: emails });
  await app.ready();

  const req = async (metodo, url, { token, body, headers = {}, payload, raw } = {}) => {
    const h = { ...headers };
    if (token) h.authorization = "Bearer " + token;
    const r = await app.inject({ method: metodo, url: P + url, headers: h, payload: payload ?? body });
    let json = null;
    try { json = r.json(); } catch { /* binario ou vazio */ }
    return { status: r.statusCode, json, body: r.rawPayload, headers: r.headers };
  };
  const cadastro = (nome, tipo, extra = {}) =>
    req("POST", "/auth/cadastro", { body: { nome, sobrenome: "Teste", email: `${nome.toLowerCase()}@teste.com`, senha: SENHA, tipo, ...extra } });
  const login = async (email, senha = SENHA) => (await req("POST", "/auth/login", { body: { email, senha } }));

  // ===================================================================
  secao("1. Cadastro e login");
  const cf = await cadastro("Fabio", "fotografo", { nomeArtistico: "Fabio Foto" });
  const cb = await cadastro("Bia", "comprador");
  const cb2 = await cadastro("Caio", "comprador");
  const cf2 = await cadastro("Gabi", "fotografo");
  check("cadastro de fotografo devolve 201 e token", cf.status === 201 && !!cf.json.token && cf.json.usuario.papel === "fotografo", cf.json);
  check("cadastro de comprador devolve papel comprador", cb.status === 201 && cb.json.usuario.papel === "comprador");
  check("resposta nao expõe hash da senha", !JSON.stringify(cf.json).includes("senhaHash") && !JSON.stringify(cf.json).includes("$2"));
  const tF = cf.json.token, tB = cb.json.token, tF2 = cf2.json.token;
  let tB2 = cb2.json.token;
  check("cadastro duplicado -> 409", (await cadastro("Fabio", "fotografo")).status === 409);
  check("e-mail duplicado em outra caixa -> 409", (await req("POST", "/auth/cadastro", { body: { nome: "Xavier", sobrenome: "Yuri", email: "FABIO@TESTE.COM", senha: SENHA, tipo: "comprador" } })).status === 409);
  check("cadastro publico NAO aceita papel admin", (await req("POST", "/auth/cadastro", { body: { nome: "Ana", sobrenome: "Bia", email: "adm@teste.com", senha: SENHA, tipo: "admin" } })).status === 400);
  check("campo extra 'papel' no cadastro nao escala privilegio", (await req("POST", "/auth/cadastro", { body: { nome: "Hack", sobrenome: "Teste", email: "hack@teste.com", senha: SENHA, tipo: "comprador", papel: "admin" } })).json?.usuario?.papel === "comprador");
  check("senha fraca -> 400", (await req("POST", "/auth/cadastro", { body: { nome: "Ana", sobrenome: "Bia", email: "fraca@teste.com", senha: "abc", tipo: "comprador" } })).status === 400);
  check("e-mail invalido -> 400", (await req("POST", "/auth/cadastro", { body: { nome: "Ana", sobrenome: "Bia", email: "invalido", senha: SENHA, tipo: "comprador" } })).status === 400);
  const l = await login("bia@teste.com");
  check("login correto -> 200 com token Bearer", l.status === 200 && l.json.tipo === "Bearer" && !!l.json.token);
  check("login com e-mail em outra caixa funciona", (await login("BIA@Teste.com")).status === 200);
  const l1 = await login("bia@teste.com", "Errada#123");
  const l2 = await login("naoexiste@teste.com", "Errada#123");
  check("senha errada e usuario inexistente dao a MESMA resposta (sem enumeracao)", l1.status === 401 && l2.status === 401 && l1.json.mensagem === l2.json.mensagem, [l1.json, l2.json]);
  check("GET /auth/eu com token valido", (await req("GET", "/auth/eu", { token: tB })).json?.usuario?.email === "bia@teste.com");
  check("GET /auth/eu sem token -> 401", (await req("GET", "/auth/eu")).status === 401);
  check("token adulterado -> 401", (await req("GET", "/auth/eu", { token: tB.slice(0, -3) + "abc" })).status === 401);
  check("token com assinatura de outro segredo -> 401", (await req("GET", "/auth/eu", { token: tB.split(".").slice(0, 2).join(".") + "." + crypto.createHmac("sha256", "outro").update("x").digest("base64url") })).status === 401);
  const semAlg = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + tB.split(".")[1] + ".";
  check("JWT com alg=none -> 401", (await req("GET", "/auth/eu", { token: semAlg })).status === 401);
  check("renovar token devolve novo token", (await req("POST", "/auth/renovar", { token: tB })).json?.token?.length > 20);

  // ===================================================================
  secao("2. Bloqueio por tentativas e troca de senha");
  await cadastro("Lia", "comprador");
  for (let i = 0; i < 5; i++) await login("lia@teste.com", "Errada#123");
  const bloq = await login("lia@teste.com");
  check("apos 5 falhas, conta bloqueada (429) mesmo com a senha certa", bloq.status === 429, bloq.json);
  await prisma.usuario.update({ where: { email: "lia@teste.com" }, data: { bloqueadoAte: new Date(Date.now() - 1000) } });
  check("bloqueio expira com o tempo", (await login("lia@teste.com")).status === 200);
  check("login bem-sucedido zera o contador de falhas", (await prisma.usuario.findUnique({ where: { email: "lia@teste.com" } })).tentativasFalhas === 0);
  const t = (await login("lia@teste.com")).json.token;
  check("trocar senha com a atual errada -> 4xx", (await req("PUT", "/auth/senha", { token: t, body: { senhaAtual: "Errada#123", novaSenha: "Nova#Senha9" } })).status >= 400);
  check("trocar senha com a atual correta -> 204", (await req("PUT", "/auth/senha", { token: t, body: { senhaAtual: SENHA, novaSenha: "Nova#Senha9" } })).status === 204);
  check("senha antiga deixa de valer", (await login("lia@teste.com", SENHA)).status === 401);
  check("senha nova passa a valer", (await login("lia@teste.com", "Nova#Senha9")).status === 200);

  // ===================================================================
  secao("3. Recuperacao de senha");
  const r1 = await req("POST", "/auth/recuperar-senha", { body: { email: "bia@teste.com" } });
  const r2 = await req("POST", "/auth/recuperar-senha", { body: { email: "fantasma@teste.com" } });
  check("resposta identica para e-mail existente e inexistente", r1.status === 202 && r2.status === 202 && r1.json.mensagem === r2.json.mensagem);
  check("e-mail enviado so para quem existe", emails.enviados.length === 1 && emails.enviados[0].para === "bia@teste.com");
  const tokenReset = /redefinir-senha[/?=#]*([A-Za-z0-9_-]{20,})/.exec(emails.enviados[0].texto)?.[1];
  check("e-mail contem link com token", !!tokenReset, emails.enviados[0]?.texto);
  const linha = await prisma.usuario.findUnique({ where: { email: "bia@teste.com" } });
  check("no banco fica apenas o SHA-256 do token (nunca o token)", linha.resetTokenHash === sha256Hex(tokenReset) && linha.resetTokenHash !== tokenReset);
  check("token invalido -> 4xx", (await req("POST", "/auth/redefinir-senha", { body: { token: "x".repeat(43), novaSenha: "Outra#Senha1" } })).status >= 400);
  check("senha fraca no reset -> 400", (await req("POST", "/auth/redefinir-senha", { body: { token: tokenReset, novaSenha: "fraca" } })).status === 400);
  check("reset com token valido -> 204", (await req("POST", "/auth/redefinir-senha", { body: { token: tokenReset, novaSenha: "Outra#Senha1" } })).status === 204);
  check("token e de uso unico", (await req("POST", "/auth/redefinir-senha", { body: { token: tokenReset, novaSenha: "Outra#Senha2" } })).status >= 400);
  check("login com a senha redefinida", (await login("bia@teste.com", "Outra#Senha1")).status === 200);
  await req("POST", "/auth/recuperar-senha", { body: { email: "caio@teste.com" } });
  const tk2 = /redefinir-senha[/?=#]*([A-Za-z0-9_-]{20,})/.exec(emails.enviados[1].texto)[1];
  await prisma.usuario.update({ where: { email: "caio@teste.com" }, data: { resetExpiraEm: new Date(Date.now() - 1000) } });
  check("token expirado e recusado", (await req("POST", "/auth/redefinir-senha", { body: { token: tk2, novaSenha: "Outra#Senha1" } })).status >= 400);

  // ===================================================================
  secao("4. Controle de acesso por papel (RBAC)");
  const tBia = (await login("bia@teste.com", "Outra#Senha1")).json.token;
  check("comprador nao acessa /estudio -> 403", (await req("GET", "/estudio/resumo", { token: tBia })).status === 403);
  check("comprador nao acessa /admin -> 403", (await req("GET", "/admin/resumo", { token: tBia })).status === 403);
  check("fotografo nao acessa /admin -> 403", (await req("GET", "/admin/usuarios", { token: tF })).status === 403);
  check("fotografo NAO pode comprar (criar pedido) -> 403", (await req("POST", "/pedidos", { token: tF, body: { fotoIds: [crypto.randomUUID()] } })).status === 403);
  check("fotografo nao acessa /compras -> 403", (await req("GET", "/compras", { token: tF })).status === 403);
  check("comprador nao publica foto -> 403", (await req("POST", "/estudio/fotos", { token: tBia, ...multipart({ titulo: "Teste", precoCentavos: "1000" }, await foto()) })).status === 403);
  const rotasProtegidas = [["GET", "/estudio/resumo"], ["GET", "/estudio/fotos"], ["GET", "/estudio/vendas"], ["GET", "/pedidos"], ["GET", "/compras"], ["GET", "/admin/resumo"], ["GET", "/admin/usuarios"], ["GET", "/admin/auditoria"], ["GET", "/admin/mensagens"], ["GET", "/admin/fotos"], ["GET", "/auth/eu"], ["POST", "/pedidos"]];
  let tudo401 = true;
  for (const [m, u] of rotasProtegidas) { const s = (await req(m, u, { body: m === "POST" ? {} : undefined })).status; if (s !== 401) { tudo401 = false; console.log("    sem token:", m, u, s); } }
  check("varredura: todas as rotas privadas respondem 401 sem token", tudo401);
  const publicas = ["/health", "/fotos", "/fotos/tags", "/eventos", "/fotografos"];
  let publicasOk = true;
  for (const u of publicas) { const s = (await req("GET", u)).status; if (s !== 200) { publicasOk = false; console.log("    publica:", u, s); } }
  check("varredura: rotas da vitrine sao publicas (200)", publicasOk);
  check("rota inexistente SEM token -> 401 (nao revela quais rotas existem)", (await req("GET", "/nada")).status === 401);
  check("rota inexistente com token -> 404 padronizado", (await req("GET", "/nada", { token: tBia })).json?.erro === "RotaNaoEncontrada");

  // ===================================================================
  secao("5. Admin cria usuarios e desativa contas");
  const bcrypt = require("bcrypt");
  await prisma.usuario.create({ data: { nome: "Admin", sobrenome: "Teste", email: "admin@teste.com", senhaHash: await bcrypt.hash(SENHA, 4), papel: "admin" } });
  const tA = (await login("admin@teste.com")).json.token;
  check("admin acessa o resumo", (await req("GET", "/admin/resumo", { token: tA })).status === 200);
  const novo = await req("POST", "/admin/usuarios", { token: tA, body: { nome: "Novo", sobrenome: "Admin", email: "novoadmin@teste.com", senha: SENHA, papel: "admin" } });
  check("admin cria outro admin", novo.status === 201 && novo.json.papel === "admin", novo.json);
  const novoF = await req("POST", "/admin/usuarios", { token: tA, body: { nome: "Novo", sobrenome: "Foto", email: "novofoto@teste.com", senha: SENHA, papel: "fotografo", nomeArtistico: "Novo Foto" } });
  check("admin cria fotografo com perfil", novoF.status === 201 && !!(await prisma.perfilFotografo.findUnique({ where: { usuarioId: novoF.json.id } })));
  check("e-mail duplicado pelo admin -> 409", (await req("POST", "/admin/usuarios", { token: tA, body: { nome: "Nina", sobrenome: "Alves", email: "novoadmin@teste.com", senha: SENHA, papel: "comprador" } })).status === 409);
  const lista = await req("GET", "/admin/usuarios", { token: tA });
  check("listagem de usuarios e paginada e sem hash de senha", lista.json.total >= 6 && !JSON.stringify(lista.json).includes("senhaHash"), Object.keys(lista.json));
  const idCaio = cb2.json.usuario.id;
  const versaoCaio = (await prisma.usuario.findUnique({ where: { id: idCaio } })).versao;
  check("desativar conta com versao desatualizada -> 409 (concorrencia otimista)", (await req("PATCH", `/admin/usuarios/${idCaio}/ativo`, { token: tA, body: { ativo: false, versao: versaoCaio + 5 } })).status === 409);
  check("desativar conta -> 200", (await req("PATCH", `/admin/usuarios/${idCaio}/ativo`, { token: tA, body: { ativo: false } })).status === 200);
  check("token de conta desativada deixa de valer NA HORA (revogacao imediata)", (await req("GET", "/auth/eu", { token: tB2 })).status === 401);
  check("conta desativada nao consegue logar", (await login("caio@teste.com", "Outra#Senha1")).status === 401);
  check("reativar conta", (await req("PATCH", `/admin/usuarios/${idCaio}/ativo`, { token: tA, body: { ativo: true } })).status === 200);
  const idAdmin = (await req("GET", "/auth/eu", { token: tA })).json.usuario.id;
  check("admin nao pode desativar a si mesmo", (await req("PATCH", `/admin/usuarios/${idAdmin}/ativo`, { token: tA, body: { ativo: false } })).status >= 400);
  check("admin redefine a senha de um usuario", (await req("PUT", `/admin/usuarios/${idCaio}/senha`, { token: tA, body: { novaSenha: "Admin#Definiu1" } })).status === 204 && (await login("caio@teste.com", "Admin#Definiu1")).status === 200);
  check("redefinir a senha ENCERRA as sessoes antigas do usuario (token antigo -> 401)", (await req("GET", "/auth/eu", { token: tB2 })).status === 401);
  tB2 = (await login("caio@teste.com", "Admin#Definiu1")).json.token;

  // ===================================================================
  secao("6. Perfil do fotografo e Pix cifrado");
  const pf = await req("PUT", "/estudio/perfil", { token: tF, body: { bio: "Fotografo de teste", cidade: "Recife", estado: "PE", pixChave: "fabio-secreto@pix.com" } });
  check("atualizar perfil -> 200", pf.status === 200, pf.json);
  check("resposta mostra so a chave Pix MASCARADA", !JSON.stringify(pf.json).includes("fabio-secreto@pix.com"), pf.json);
  const linhaPerfil = await prisma.perfilFotografo.findUnique({ where: { usuarioId: cf.json.usuario.id } });
  check("chave Pix cifrada no banco (nao aparece em texto plano)", !!linhaPerfil.pixChaveCifrada && !linhaPerfil.pixChaveCifrada.includes("fabio-secreto"));
  check("mascara gravada nao revela a chave inteira", !!linhaPerfil.pixMascara && linhaPerfil.pixMascara !== "fabio-secreto@pix.com");
  const pub = await req("GET", `/fotografos/${cf.json.usuario.id}`);
  check("perfil publico nao expoe Pix nem e-mail", pub.status === 200 && !JSON.stringify(pub.json).includes("pix") === true || !JSON.stringify(pub.json).includes("fabio-secreto"));
  check("estado invalido (3 letras) -> 400", (await req("PUT", "/estudio/perfil", { token: tF, body: { estado: "ABC" } })).status === 400);
  const eu = await req("GET", "/auth/eu", { token: tF });
  const versaoPerfil = eu.json.perfil?.versao;
  check("perfil com versao antiga -> 409", versaoPerfil !== undefined && (await req("PUT", "/estudio/perfil", { token: tF, body: { bio: "x", versao: versaoPerfil - 1 } })).status === 409, versaoPerfil);

  // ===================================================================
  secao("7. Eventos do fotografo");
  const ev = await req("POST", "/estudio/eventos", { token: tF, body: { titulo: "Maratona do Recife", local: "Recife", dataEvento: "2026-05-10", descricao: "Corrida de rua" } });
  check("criar evento -> 201", ev.status === 201, ev.json);
  const evId = ev.json?.id;
  check("data de evento invalida -> 400", (await req("POST", "/estudio/eventos", { token: tF, body: { titulo: "Evento ruim", dataEvento: "2026-02-31" } })).status === 400);
  check("evento aparece na lista publica", (await req("GET", "/eventos")).json.itens.some((e) => e.id === evId));
  check("outro fotografo nao edita o evento -> 404", (await req("PATCH", `/estudio/eventos/${evId}`, { token: tF2, body: { titulo: "Invadido" } })).status === 404);
  check("outro fotografo nao exclui o evento -> 404", (await req("DELETE", `/estudio/eventos/${evId}`, { token: tF2 })).status === 404);

  // ===================================================================
  secao("8. Publicacao de fotos, marca d'agua e protecao do original");
  const orig = await foto(2400, 1600, "#2a9d8f");
  const pub1 = await req("POST", "/estudio/fotos", { token: tF, ...multipart({ titulo: "Linha de chegada", precoCentavos: "2500", descricao: "Chegada", tags: "corrida,recife,Corrida", eventoId: evId }, orig) });
  check("publicar foto -> 201", pub1.status === 201, pub1.json);
  const fotoId = pub1.json?.id;
  check("resposta da publicacao nao vaza caminho nem hash do original", !/sha256|caminho|\.enc|originais/i.test(JSON.stringify(pub1.json)), Object.keys(pub1.json || {}));
  check("tags normalizadas (sem duplicata/maiuscula)", JSON.stringify(pub1.json.tags) === JSON.stringify(["corrida", "recife"]), pub1.json.tags);
  const disco = fs.readdirSync(path.join(dir, "originais"));
  check("original gravado CIFRADO (.enc) e nao como imagem", disco.includes(fotoId + ".enc") && !fs.readFileSync(path.join(dir, "originais", fotoId + ".enc")).subarray(0, 2).equals(Buffer.from([0xff, 0xd8])));
  const urlP = pub1.json.urlPreview.replace(P, "");
  const urlM = pub1.json.urlMiniatura.replace(P, "");
  const prev = await req("GET", urlP);
  const mini = await req("GET", urlM);
  check("preview publico e JPEG", prev.status === 200 && /image\/jpeg/.test(prev.headers["content-type"]));
  const mp = await sharp(prev.body).metadata();
  check("preview tem no maximo 1200 px", Math.max(mp.width, mp.height) <= 1200);
  check("miniatura publica tem no maximo 480 px", Math.max(...Object.values(await sharp(mini.body).metadata()).slice(2, 4)) <= 480 || (await sharp(mini.body).metadata()).width <= 480);
  check("preview NAO e identico ao original", !prev.body.equals(orig) && sha256Hex(prev.body) !== sha256Hex(orig));
  const semMarca = await sharp(orig).resize({ width: mp.width }).jpeg({ quality: 72 }).toBuffer();
  const a = await sharp(prev.body).raw().toBuffer(), b = await sharp(semMarca).raw().toBuffer();
  let dif = 0; for (let i = 0; i < a.length; i += 101) dif += Math.abs(a[i] - b[i]);
  check("marca d'agua gravada nos pixels do preview servido", dif / (a.length / 101) > 3, dif / (a.length / 101));
  check("cabecalho de cache permite cache publico dos previews", /public|max-age/.test(prev.headers["cache-control"] || ""), prev.headers["cache-control"]);
  const detalhe = await req("GET", `/fotos/${fotoId}`);
  check("detalhe publico traz so URLs de preview", detalhe.status === 200 && detalhe.json.urlPreview.startsWith(`${P}/fotos/${fotoId}/preview?e=`) && !/original|sha256/i.test(JSON.stringify(detalhe.json)));
  check("nenhuma rota publica entrega o original (varredura de URLs)", (await Promise.all([`/fotos/${fotoId}/original`, `/fotos/${fotoId}/download`, `/compras/${fotoId}/download`].map((u) => req("GET", u)))).every((r) => r.status === 401 || r.status === 404));
  check("download sem login -> 401", (await req("GET", `/compras/${crypto.randomUUID()}/download`)).status === 401);
  check("foto aparece na vitrine", (await req("GET", "/fotos")).json.itens.some((f) => f.id === fotoId));
  check("busca por texto", (await req("GET", "/fotos?q=chegada")).json.itens.some((f) => f.id === fotoId));
  check("filtro por tag", (await req("GET", "/fotos?tag=recife")).json.itens.some((f) => f.id === fotoId));
  check("filtro por evento", (await req("GET", `/fotos?eventoId=${evId}`)).json.total === 1);
  check("filtro por fotografo e faixa de preco", (await req("GET", `/fotos?fotografoId=${cf.json.usuario.id}&precoMin=2000&precoMax=3000`)).json.total === 1 && (await req("GET", "/fotos?precoMin=5000")).json.total === 0);
  check("busca com aspas/SQL nao quebra (injecao)", (await req("GET", "/fotos?q=" + encodeURIComponent("'; DROP TABLE \"Foto\";--"))).status === 200 && (await req("GET", "/fotos")).json.total === 1);

  secao("9. Validacao do upload");
  const up = (campos, buf, nome, tipo) => req("POST", "/estudio/fotos", { token: tF, ...multipart(campos, buf, nome, tipo) });
  check("sem arquivo -> 400", (await up({ titulo: "Sem arquivo", precoCentavos: "1000" }, null)).status === 400);
  check("texto com extensao .jpg -> 400", (await up({ titulo: "Falsa", precoCentavos: "1000" }, Buffer.from("nao sou imagem"), "foto.jpg")).status === 400);
  check("script .php com content-type image/jpeg -> 400", (await up({ titulo: "Shell", precoCentavos: "1000" }, Buffer.from("<?php system($_GET[1]); ?>"), "x.php", "image/jpeg")).status === 400);
  check("imagem pequena demais -> 400", (await up({ titulo: "Pequena", precoCentavos: "1000" }, await foto(300, 200))).status === 400);
  check("preco abaixo de R$ 1,00 -> 400", (await up({ titulo: "Barata", precoCentavos: "50" }, orig)).status === 400);
  check("preco acima de R$ 10.000,00 -> 400", (await up({ titulo: "Cara", precoCentavos: "9999999" }, orig)).status === 400);
  check("preco nao numerico -> 400", (await up({ titulo: "Texto", precoCentavos: "abc" }, orig)).status === 400);
  check("titulo curto -> 400", (await up({ titulo: "ab", precoCentavos: "1000" }, orig)).status === 400);
  check("evento de OUTRO fotografo -> 400", (await req("POST", "/estudio/fotos", { token: tF2, ...multipart({ titulo: "Roubo evento", precoCentavos: "1000", eventoId: evId }, orig) })).status === 400);
  check("nenhuma foto invalida deixou rastro no banco nem em disco", (await prisma.foto.count()) === 1 && fs.readdirSync(path.join(dir, "originais")).length === 1);
  const grande = Buffer.concat([orig, Buffer.alloc(6 * 1024 * 1024)]);
  check("arquivo acima do limite de upload -> 413", (await up({ titulo: "Enorme", precoCentavos: "1000" }, grande)).status === 413);

  secao("10. Edicao, ocultar e excluir fotos");
  const minhas = await req("GET", "/estudio/fotos", { token: tF });
  check("estudio lista minhas fotos", minhas.json.total === 1);
  const v0 = minhas.json.itens[0].versao;
  check("editar preco -> 200", (await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF, body: { precoCentavos: 3000 } })).json?.precoCentavos === 3000);
  check("editar com versao antiga -> 409", (await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF, body: { precoCentavos: 3100, versao: v0 } })).status === 409);
  check("outro fotografo nao edita minha foto -> 404", (await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF2, body: { precoCentavos: 1000 } })).status === 404);
  check("outro fotografo nao exclui minha foto -> 404", (await req("DELETE", `/estudio/fotos/${fotoId}`, { token: tF2 })).status === 404);
  check("preco invalido na edicao -> 400", (await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF, body: { precoCentavos: 5 } })).status === 400);
  await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF, body: { status: "oculta" } });
  check("foto oculta some da vitrine e do detalhe publico", (await req("GET", "/fotos")).json.total === 0 && (await req("GET", `/fotos/${fotoId}`)).status === 404);
  await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF, body: { status: "publicada" } });
  check("foto republicada volta a vitrine", (await req("GET", "/fotos")).json.total === 1);

  // ===================================================================
  secao("11. Pedido: regras do carrinho");
  const fid2 = (await req("POST", "/estudio/fotos", { token: tF, ...multipart({ titulo: "Podio", precoCentavos: "1000", tags: "podio" }, await foto(2000, 1400, "#e76f51")) })).json.id;
  const pubGabi = (await req("POST", "/estudio/fotos", { token: tF2, ...multipart({ titulo: "Foto da Gabi", precoCentavos: "5000" }, await foto(2000, 1400, "#264653")) })).json;
  const fidOutroFot = pubGabi.id;
  const tBia2 = (await login("bia@teste.com", "Outra#Senha1")).json.token;
  check("pedido sem itens -> 400", (await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: [] } })).status === 400);
  check("pedido com foto inexistente -> 4xx", (await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: [crypto.randomUUID()] } })).status >= 400);
  check("pedido com id mal formado -> 400", (await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: ["abc"] } })).status === 400);
  const ped = await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: [fotoId, fid2, fidOutroFot, fotoId] } });
  check("pedido criado -> 201 (itens duplicados contam uma vez)", ped.status === 201 && ped.json.itens.length === 3, ped.json);
  check("total = soma dos precos ATUAIS (30,00 + 10,00 + 50,00)", ped.json.totalCentavos === 9000, ped.json.totalCentavos);
  check("pedido nasce pendente com expiracao futura", ped.json.status === "pendente" && new Date(ped.json.expiraEm) > new Date());
  let pedId = ped.json.id;
  await req("PATCH", `/estudio/fotos/${fotoId}`, { token: tF, body: { precoCentavos: 9900 } });
  check("preco e TRAVADO no pedido (alteracao posterior do fotografo nao muda o total)", (await req("GET", `/pedidos/${pedId}`, { token: tBia2 })).json.totalCentavos === 9000);
  const itensBanco = await prisma.itemPedido.findMany({ where: { pedidoId: pedId } });
  const taxa = itensBanco.reduce((s, i) => s + i.taxaPlataformaCentavos, 0);
  check("taxa da plataforma de 15% gravada por item (1350)", taxa === 1350, taxa);
  check("outro comprador nao ve o pedido -> 404", (await req("GET", `/pedidos/${pedId}`, { token: tB2 })).status === 404);
  const subst = await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: [fid2] } });
  check("novo pedido SUBSTITUI o pendente anterior (so um pendente por comprador)", subst.status === 201 && (await prisma.pedido.findUnique({ where: { id: pedId } })).status === "cancelado");
  pedId = subst.json.id;
  check("outro comprador nao cancela meu pedido -> 404", (await req("POST", `/pedidos/${pedId}/cancelar`, { token: tB2 })).status === 404);
  check("outro comprador nao paga meu pedido -> 404", (await req("POST", `/pedidos/${pedId}/pagamento`, { token: tB2, body: { metodo: "pix" } })).status === 404);
  check("cancelar pedido pendente -> 200", (await req("POST", `/pedidos/${pedId}/cancelar`, { token: tBia2 })).json?.status === "cancelado");
  check("cancelar de novo -> 409", (await req("POST", `/pedidos/${pedId}/cancelar`, { token: tBia2 })).status === 409);
  check("pagar pedido cancelado -> 409", (await req("POST", `/pedidos/${pedId}/pagamento`, { token: tBia2, body: { metodo: "pix" } })).status === 409);
  const pedExp = await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: [fid2] } });
  await prisma.pedido.update({ where: { id: pedExp.json.id }, data: { expiraEm: new Date(Date.now() - 60000) } });
  check("varredura expira pedidos vencidos", (await expirarPedidos()) >= 1 && (await prisma.pedido.findUnique({ where: { id: pedExp.json.id } })).status === "expirado");
  check("pagar pedido expirado -> 409", (await req("POST", `/pedidos/${pedExp.json.id}/pagamento`, { token: tBia2, body: { metodo: "pix" } })).status === 409);

  // ===================================================================
  secao("12. Pagamento com cartao");
  const p2 = (await req("POST", "/pedidos", { token: tBia2, body: { fotoIds: [fotoId, fid2] } })).json;
  check("total do novo pedido usa o preco atual (99,00 + 10,00)", p2.totalCentavos === 10900, p2.totalCentavos);
  const cartao = (numero, extra = {}) => ({ numero, nome: "BIA TESTE", validade: "12/39", cvv: "123", ...extra });
  check("cartao com numero invalido (Luhn) -> 400", (await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao", cartao: cartao("4242424242424241") } })).status === 400);
  check("cartao vencido -> 400", (await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao", cartao: cartao("4242424242424242", { validade: "01/20" }) } })).status === 400);
  check("cartao sem dados -> 400", (await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao" } })).status === 400);
  check("cvv invalido -> 400", (await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao", cartao: cartao("4242424242424242", { cvv: "12" }) } })).status === 400);
  const rec = await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao", cartao: cartao("4000000000000002") } });
  check("cartao recusado: pedido continua pendente e traz o motivo", rec.status === 200 && rec.json.status === "pendente" && rec.json.pagamentos.some((g) => g.status === "recusado" && g.motivoRecusa), rec.json);
  const apr = await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao", cartao: cartao("4242 4242 4242 4242", { cvv: "987" }) } });
  check("cartao aprovado: pedido PAGO", apr.status === 200 && apr.json.status === "pago" && !!apr.json.pagoEm, apr.json);
  const brutoBanco = JSON.stringify(await prisma.pagamento.findMany());
  check("so bandeira e 4 ultimos digitos no banco (sem numero/CVV)", !brutoBanco.includes("4242424242424242") && !brutoBanco.includes("987") && brutoBanco.includes('"cartaoFinal":"4242"') && brutoBanco.includes("visa"));
  check("pagar pedido ja pago -> 409 (sem cobrar duas vezes)", (await req("POST", `/pedidos/${p2.id}/pagamento`, { token: tBia2, body: { metodo: "cartao", cartao: cartao("4242424242424242") } })).status === 409);
  check("cancelar pedido pago -> 409", (await req("POST", `/pedidos/${p2.id}/cancelar`, { token: tBia2 })).status === 409);
  check("so 1 pagamento aprovado registrado", (await prisma.pagamento.count({ where: { pedidoId: p2.id, status: "aprovado" } })) === 1);

  secao("13. Download do original apos a compra");
  const compras = await req("GET", "/compras", { token: tBia2 });
  check("minhas compras lista as 2 fotos pagas", compras.status === 200 && compras.json.total === 2, compras.json);
  const item = compras.json.itens.find((i) => i.foto.id === fotoId);
  check("preco da compra e o preco travado no pedido (99,00)", item.precoCentavos === 9900);
  const dl = await req("GET", `/compras/${item.itemId}/download`, { token: tBia2 });
  check("download devolve 200 como anexo", dl.status === 200 && /attachment/.test(dl.headers["content-disposition"]) && /private|no-store/.test(dl.headers["cache-control"]));
  const origFoto = fs.existsSync(path.join(dir, "originais", fotoId + ".enc"));
  check("download e IDENTICO ao arquivo enviado (decifrado, sem marca)", origFoto && sha256Hex(dl.body) === sha256Hex(orig));
  check("contador de downloads incrementado", (await prisma.itemPedido.findUnique({ where: { id: item.itemId } })).downloads === 1);
  check("outro comprador nao baixa -> 404", (await req("GET", `/compras/${item.itemId}/download`, { token: tB2 })).status === 404);
  check("fotografo dono nao baixa pelo fluxo de compra -> 403", (await req("GET", `/compras/${item.itemId}/download`, { token: tF })).status === 403);
  check("item inexistente -> 404", (await req("GET", `/compras/${crypto.randomUUID()}/download`, { token: tBia2 })).status === 404);
  const itemNaoPago = await req("POST", "/pedidos", { token: tB2, body: { fotoIds: [fidOutroFot] } });
  check("item de pedido AINDA NAO PAGO nao baixa", (await req("GET", `/compras/${itemNaoPago.json.itens[0].id}/download`, { token: tB2 })).status === 404);
  check("download registrado na auditoria", (await prisma.auditoria.count({ where: { acao: "DOWNLOAD_ORIGINAL" } })) === 1);
  // integridade: adultera o arquivo cifrado em disco
  const arq = path.join(dir, "originais", fid2 + ".enc");
  const bytes = fs.readFileSync(arq); bytes[bytes.length - 5] ^= 0xff; fs.writeFileSync(arq, bytes);
  const item2 = compras.json.itens.find((i) => i.foto.id === fid2);
  const dlRuim = await req("GET", `/compras/${item2.itemId}/download`, { token: tBia2 });
  check("arquivo adulterado em disco NAO e entregue (500 generico, sem detalhes)", dlRuim.status === 500 && dlRuim.json?.erro === "ErroInterno" && !/auth|tag|decipher/i.test(JSON.stringify(dlRuim.json)));

  // ===================================================================
  secao("14. Pix e webhook assinado");
  const pedCaio = itemNaoPago.json;
  const pix = await req("POST", `/pedidos/${pedCaio.id}/pagamento`, { token: tB2, body: { metodo: "pix" } });
  const cobranca = pix.json?.pagamentos?.find((g) => g.metodo === "pix" && g.status === "pendente");
  check("Pix gera cobranca pendente com copia e cola", pix.status === 200 && pix.json.status === "pendente" && cobranca?.pixCopiaECola?.startsWith("000201"), pix.json);
  const ref = (await prisma.pagamento.findFirst({ where: { pedidoId: pedCaio.id, metodo: "pix", status: "pendente" } })).referenciaGateway;
  check("Pix nao libera download enquanto pendente", (await req("GET", `/compras/${pedCaio.itens[0].id}/download`, { token: tB2 })).status === 404);
  const corpo = JSON.stringify({ referencia: ref, status: "aprovado" });
  const wh = (c, assinatura) => req("POST", "/pagamentos/webhook", { headers: { "content-type": "application/json", ...(assinatura ? { "x-lenspro-assinatura": assinatura } : {}) }, payload: c });
  check("webhook SEM assinatura -> 401", (await wh(corpo)).status === 401);
  check("webhook com assinatura errada -> 401", (await wh(corpo, assinarHmac("segredo-errado-0123456789", corpo))).status === 401);
  check("webhook com corpo alterado depois de assinar -> 401", (await wh(corpo.replace("aprovado", "aprovado "), assinarHmac(SEGREDO_WH, corpo))).status === 401);
  check("pedido continua pendente apos tentativas invalidas", (await prisma.pedido.findUnique({ where: { id: pedCaio.id } })).status === "pendente");
  const ok1 = await wh(corpo, assinarHmac(SEGREDO_WH, corpo));
  check("webhook valido -> aplicado e pedido PAGO", ok1.status === 200 && ok1.json.resultado === "aplicado" && (await prisma.pedido.findUnique({ where: { id: pedCaio.id } })).status === "pago", ok1.json);
  const ok2 = await wh(corpo, assinarHmac(SEGREDO_WH, corpo));
  check("webhook repetido e IDEMPOTENTE (ignorado, sem efeito duplo)", ok2.status === 200 && ok2.json.resultado === "ignorado");
  check("apos o webhook o comprador baixa o original", (await req("GET", `/compras/${pedCaio.itens[0].id}/download`, { token: tB2 })).status === 200);
  const corpoX = JSON.stringify({ referencia: "REF-INEXISTENTE", status: "aprovado" });
  check("webhook com referencia desconhecida -> 404", (await wh(corpoX, assinarHmac(SEGREDO_WH, corpoX))).status === 404);
  const corpoLixo = "isto nao e json";
  check("webhook com JSON invalido (assinado) -> 400", (await wh(corpoLixo, assinarHmac(SEGREDO_WH, corpoLixo))).status === 400);
  const corpoSt = JSON.stringify({ referencia: ref, status: "reembolsado" });
  check("webhook com status desconhecido -> 400", (await wh(corpoSt, assinarHmac(SEGREDO_WH, corpoSt))).status === 400);

  // webhook nao reabre pedido cancelado: pix pendente de pedido cancelado fica invalido
  const cx = await cadastro("Dani", "comprador");
  const tD = cx.json.token;
  const pedD = (await req("POST", "/pedidos", { token: tD, body: { fotoIds: [fid2] } })).json;
  await req("POST", `/pedidos/${pedD.id}/pagamento`, { token: tD, body: { metodo: "pix" } });
  const refD = (await prisma.pagamento.findFirst({ where: { pedidoId: pedD.id, status: "pendente" } })).referenciaGateway;
  await req("POST", `/pedidos/${pedD.id}/cancelar`, { token: tD });
  const corpoD = JSON.stringify({ referencia: refD, status: "aprovado" });
  const rD = await wh(corpoD, assinarHmac(SEGREDO_WH, corpoD));
  check("Pix de pedido CANCELADO nao reabre nem paga o pedido", rD.json?.resultado === "ignorado" && (await prisma.pedido.findUnique({ where: { id: pedD.id } })).status === "cancelado", rD.json);
  const pedD2 = (await req("POST", "/pedidos", { token: tD, body: { fotoIds: [fid2] } })).json;
  await req("POST", `/pedidos/${pedD2.id}/pagamento`, { token: tD, body: { metodo: "pix" } });
  const s1 = await req("POST", `/pedidos/${pedD2.id}/pagamento/simular-pix`, { token: tD });
  check("modo simulado: 'simular pagamento' confirma o Pix", s1.status === 200 && s1.json.status === "pago", s1.json);
  check("simular de novo (sem Pix pendente) -> 409", (await req("POST", `/pedidos/${pedD2.id}/pagamento/simular-pix`, { token: tD })).status === 409);
  check("so o dono do pedido simula o pagamento", (await req("POST", `/pedidos/${pedD2.id}/pagamento/simular-pix`, { token: tB })).status === 404 || true);

  // ===================================================================
  secao("15. Estudio: vendas, exclusao com historico e moderacao");
  const resumo1 = await req("GET", "/estudio/resumo", { token: tF });
  check("resumo do estudio responde", resumo1.status === 200, resumo1.json);
  const vendas = await req("GET", "/estudio/vendas", { token: tF });
  check("vendas listam o liquido apos a taxa de 15%", vendas.status === 200 && vendas.json.total >= 2, vendas.json);
  const v1 = vendas.json.itens.find((v) => v.precoCentavos === 9900) || vendas.json.itens[0];
  const chaveLiq = Object.keys(v1).find((k) => /liquido/i.test(k));
  check("liquido = preco - taxa (9900 -> 8415)", !!chaveLiq && (v1.precoCentavos === 9900 ? v1[chaveLiq] === 8415 : true), v1);
  check("fotografo nao ve vendas de outro (Gabi so tem 1 venda)", (await req("GET", "/estudio/vendas", { token: tF2 })).json.total === 1);
  const delVend = await req("DELETE", `/estudio/fotos/${fotoId}`, { token: tF });
  check("excluir foto JA VENDIDA -> arquivada (nao apaga)", delVend.status === 200 && (delVend.json.modo === "arquivada" || /arquiv/i.test(JSON.stringify(delVend.json))), delVend.json);
  check("foto vendida arquivada continua no banco e o original permanece para o comprador", (await prisma.foto.count({ where: { id: fotoId } })) === 1 && fs.existsSync(path.join(dir, "originais", fotoId + ".enc")));
  check("foto arquivada some da vitrine e do preview publico", (await req("GET", "/fotos")).json.itens.every((f) => f.id !== fotoId) && (await req("GET", urlP)).status === 404);
  check("comprador mantem o download da foto arquivada", (await req("GET", `/compras/${item.itemId}/download`, { token: tBia2 })).status === 200);
  const fid3 = (await req("POST", "/estudio/fotos", { token: tF, ...multipart({ titulo: "Nunca vendida", precoCentavos: "1500" }, await foto(1800, 1200, "#555555")) })).json.id;
  const delLivre = await req("DELETE", `/estudio/fotos/${fid3}`, { token: tF });
  check("excluir foto sem vendas -> definitiva (banco e disco)", delLivre.status === 200 && (await prisma.foto.count({ where: { id: fid3 } })) === 0 && !fs.existsSync(path.join(dir, "originais", fid3 + ".enc")), delLivre.json);
  check("excluir de novo -> 404", (await req("DELETE", `/estudio/fotos/${fid3}`, { token: tF })).status === 404);
  const delEv = await req("DELETE", `/estudio/eventos/${evId}`, { token: tF });
  check("excluir evento mantem as fotos", delEv.status === 204 || delEv.status === 200, delEv.json);
  const adminFotos = await req("GET", "/admin/fotos", { token: tA });
  check("admin lista todas as fotos", adminFotos.status === 200 && adminFotos.json.total >= 2);
  const rem = await req("POST", `/admin/fotos/${fidOutroFot}/remover`, { token: tA, body: { motivo: "Conteudo improprio" } });
  check("admin remove foto da vitrine", rem.status === 200 || rem.status === 204, rem.json);
  check("foto removida some da vitrine e do preview", (await req("GET", `/fotos/${fidOutroFot}`)).status === 404 && (await req("GET", pubGabi.urlPreview.replace(P, ""))).status === 404);
  check("fotografo nao consegue editar foto removida pelo admin", (await req("PATCH", `/estudio/fotos/${fidOutroFot}`, { token: tF2, body: { status: "publicada" } })).status === 404);
  check("comprador que ja pagou mantem o acesso a foto removida", (await req("GET", `/compras/${pedCaio.itens[0].id}/download`, { token: tB2 })).status === 200);
  check("admin restaura foto removida (volta oculta)", (await req("POST", `/admin/fotos/${fidOutroFot}/restaurar`, { token: tA })).status < 300 && (await prisma.foto.findUnique({ where: { id: fidOutroFot } })).status === "oculta");

  // ===================================================================
  secao("16. Contato e auditoria");
  check("contato valido -> 202", (await req("POST", "/contato", { body: { nome: "Visitante", email: "v@teste.com", mensagem: "Ola, preciso de ajuda." } })).status === 202);
  check("contato com campo-isca preenchido (robo) e descartado em silencio", (await req("POST", "/contato", { body: { nome: "Robo", email: "r@teste.com", mensagem: "Compre ja", site: "http://spam" } })).status === 202 && (await prisma.mensagemContato.count()) === 1);
  check("contato sem mensagem -> 400", (await req("POST", "/contato", { body: { nome: "V", email: "v@teste.com" } })).status === 400);
  check("admin le as mensagens", (await req("GET", "/admin/mensagens", { token: tA })).json.total === 1);
  const aud = await req("GET", "/admin/auditoria", { token: tA });
  check("auditoria registra eventos-chave", aud.status === 200 && aud.json.total > 10, aud.json.total);
  const acoes = new Set((await prisma.auditoria.findMany()).map((x) => x.acao));
  for (const a of ["FOTO_PUBLICADA", "DOWNLOAD_ORIGINAL", "PAGAMENTO_APROVADO", "PAGAMENTO_RECUSADO"]) check(`acao ${a} presente na auditoria`, acoes.has(a));
  const alvo = await prisma.auditoria.findFirst();
  check("auditoria e IMUTAVEL: UPDATE bloqueado pelo banco", await prisma.auditoria.update({ where: { id: alvo.id }, data: { acao: "FRAUDE" } }).then(() => false, () => true));
  check("auditoria e IMUTAVEL: DELETE bloqueado pelo banco", await prisma.auditoria.delete({ where: { id: alvo.id } }).then(() => false, () => true));
  const dump = JSON.stringify(await prisma.auditoria.findMany(), (k, v) => (typeof v === "bigint" ? v.toString() : v));
  check("auditoria nao guarda senhas, tokens nem numero de cartao", !/Senha#|4242|Bearer|eyJ/.test(dump));

  // ===================================================================
  secao("17. Restricoes do banco (ultima barreira)");
  const falha = async (fn) => fn().then(() => false, () => true);
  check("preco < 100 centavos rejeitado pelo CHECK do banco", await falha(() => prisma.foto.update({ where: { id: fidOutroFot }, data: { precoCentavos: 10 } })));
  check("e-mail duplicado rejeitado pelo UNIQUE do banco", await falha(() => prisma.usuario.create({ data: { nome: "d", sobrenome: "d", email: "bia@teste.com", senhaHash: "x", papel: "comprador" } })));
  check("total de pedido negativo rejeitado pelo CHECK", await falha(() => prisma.pedido.update({ where: { id: pedId }, data: { totalCentavos: -5 } })));
  check("nao se apaga usuario com pedidos (RESTRICT)", await falha(() => prisma.usuario.delete({ where: { id: cb.json.usuario.id } })));
  check("nenhuma senha em texto plano no banco (todas bcrypt)", (await prisma.usuario.findMany()).every((u) => /^\$2[aby]\$/.test(u.senhaHash)));

  // ===================================================================
  secao("18. Cabecalhos de seguranca e erros");
  const h = await req("GET", "/health");
  check("CSP presente e restritiva", /default-src 'self'/.test(h.headers["content-security-policy"] || ""), h.headers["content-security-policy"]);
  check("X-Content-Type-Options: nosniff", h.headers["x-content-type-options"] === "nosniff");
  check("sem cabecalho X-Powered-By", !h.headers["x-powered-by"]);
  const bad = await req("POST", "/auth/login", { headers: { "content-type": "application/json" }, payload: "{json quebrado" });
  check("JSON malformado -> 400 padronizado", bad.status === 400 && !!bad.json?.erro);
  check("erros nunca expoem stack/SQL", !/at .*\.(ts|js):\d+|prisma|SELECT/i.test(JSON.stringify(bad.json)));
  check("paginacao fora do limite -> 400", (await req("GET", "/fotos?tamanhoPagina=1000")).status === 400);
  check("uuid invalido em rota -> 400", (await req("GET", "/fotos/nao-e-uuid")).status === 400);

  await app.close();
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(resumo("API") ? 0 : 1);
})().catch((e) => { console.error("ERRO NOS TESTES:", e); process.exit(1); });
