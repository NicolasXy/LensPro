// spiderman
// Testes unitarios (sem banco): criptografia, armazenamento cifrado, marca d'agua, validadores e BR Code do Pix.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { check, secao, resumo } = require("./helpers");

const C = require("../dist/core/crypto");
const { Armazenamento } = require("../dist/core/armazenamento");
const { carregarChaveMestra } = require("../dist/core/chaveMestra");
const { gerarVersoesMarcadas, inspecionarImagem, LADO_PREVIEW } = require("../dist/core/marcaDagua");
const V = require("../dist/core/validadores");
const { gerarBrCode, GatewaySimulado } = require("../dist/services/Gateway");

async function fotoDeTeste(w = 2400, h = 1600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#2b5876"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="#f6d365"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

(async () => {
  secao("1. Criptografia AES-256-GCM");
  const chave = C.gerarChaveDados();
  check("chave gerada tem 32 bytes", chave.length === 32);
  const msg = Buffer.from("conteudo secreto da foto original");
  const enc = C.cifrarBuffer(chave, msg);
  check("cifrar/decifrar devolve o conteudo original", C.decifrarBuffer(chave, enc).equals(msg));
  check("texto cifrado nao contem o texto plano", !enc.includes(msg));
  check("cabecalho do formato LPE1 presente", enc.subarray(0, 4).toString() === "LPE1");
  check("IV aleatorio: duas cifragens do mesmo dado diferem", !C.cifrarBuffer(chave, msg).equals(enc));
  const adulterado = Buffer.from(enc);
  adulterado[adulterado.length - 1] ^= 0xff;
  check("adulteracao do texto cifrado e detectada (auth tag)", (() => { try { C.decifrarBuffer(chave, adulterado); return false; } catch { return true; } })());
  const adulteradoTag = Buffer.from(enc);
  adulteradoTag[4 + 12] ^= 0x01;
  check("adulteracao da auth tag e detectada", (() => { try { C.decifrarBuffer(chave, adulteradoTag); return false; } catch { return true; } })());
  check("chave errada nao decifra", (() => { try { C.decifrarBuffer(C.gerarChaveDados(), enc); return false; } catch { return true; } })());
  check("arquivo truncado e rejeitado", (() => { try { C.decifrarBuffer(chave, enc.subarray(0, 20)); return false; } catch { return true; } })());
  check("chave com tamanho invalido e rejeitada", (() => { try { C.cifrarBuffer(Buffer.alloc(16), msg); return false; } catch { return true; } })());
  const t = C.cifrarTexto(chave, "chave-pix@exemplo.com");
  check("cifrarTexto/decifrarTexto fazem ida e volta", C.decifrarTexto(chave, t) === "chave-pix@exemplo.com");
  check("campo cifrado nao revela o texto", !t.includes("pix") && t.startsWith("v1."));
  check("sha256Hex confere com o modulo crypto", C.sha256Hex("abc") === crypto.createHash("sha256").update("abc").digest("hex"));
  check("tokens aleatorios sao unicos e longos", C.gerarToken() !== C.gerarToken() && C.gerarToken().length >= 40);
  check("comparacao em tempo constante: iguais", C.iguaisEmTempoConstante("abc", "abc"));
  check("comparacao em tempo constante: diferentes", !C.iguaisEmTempoConstante("abc", "abd") && !C.iguaisEmTempoConstante("abc", "abcd"));
  const sig = C.assinarHmac("segredo-do-webhook-123", '{"a":1}');
  check("HMAC valido e aceito", C.verificarHmac("segredo-do-webhook-123", '{"a":1}', sig));
  check("HMAC com corpo alterado e recusado", !C.verificarHmac("segredo-do-webhook-123", '{"a":2}', sig));
  check("HMAC com segredo errado e recusado", !C.verificarHmac("outro-segredo-123456", '{"a":1}', sig));
  check("HMAC vazio/lixo e recusado sem lancar", !C.verificarHmac("segredo-do-webhook-123", "{}", "") && !C.verificarHmac("segredo-do-webhook-123", "{}", "zz"));

  secao("2. Chave mestra");
  const dirChave = fs.mkdtempSync(path.join(os.tmpdir(), "lp-chave-"));
  const k1 = carregarChaveMestra(dirChave, "");
  const k2 = carregarChaveMestra(dirChave, "");
  check("chave gerada na 1a execucao e reaproveitada nas seguintes", k1.length === 32 && k1.equals(k2));
  check("master.key criado com permissao 600 (POSIX)", process.platform === "win32" || (fs.statSync(path.join(dirChave, "master.key")).mode & 0o777) === 0o600);
  const hex = crypto.randomBytes(32).toString("hex");
  check("ENCRYPTION_KEY tem precedencia sobre o arquivo", carregarChaveMestra(dirChave, hex).toString("hex") === hex);
  fs.writeFileSync(path.join(dirChave, "master.key"), "lixo");
  check("arquivo de chave corrompido e recusado", (() => { try { carregarChaveMestra(dirChave, ""); return false; } catch { return true; } })());

  secao("3. Armazenamento cifrado em disco");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-arm-"));
  const arm = new Armazenamento(dir, chave);
  const original = await fotoDeTeste();
  const id = crypto.randomUUID();
  await arm.salvarOriginal(id, original);
  const bruto = fs.readFileSync(path.join(dir, "originais", id + ".enc"));
  check("original em disco NAO e uma imagem legivel (sem cabecalho JPEG)", !(bruto[0] === 0xff && bruto[1] === 0xd8) && bruto.length > original.length);
  check("lerOriginal devolve exatamente os bytes enviados", (await arm.lerOriginal(id)).equals(original));
  check("arquivo do original com permissao 600 (POSIX)", process.platform === "win32" || (fs.statSync(path.join(dir, "originais", id + ".enc")).mode & 0o777) === 0o600);
  bruto[100] ^= 0x01;
  fs.writeFileSync(path.join(dir, "originais", id + ".enc"), bruto);
  check("original adulterado em disco e detectado ao ler", await arm.lerOriginal(id).then(() => false, () => true));
  check("id com path traversal e recusado", await arm.lerOriginal("../../etc/passwd").then(() => false, () => true));
  check("id que nao e UUID e recusado", await arm.salvarOriginal("abc", original).then(() => false, () => true));
  check("preview inexistente devolve null", (await arm.lerPreview(crypto.randomUUID(), "grande")) === null);
  await arm.salvarPreviews(id, Buffer.from("p"), Buffer.from("m"));
  check("previews gravados e lidos", (await arm.lerPreview(id, "grande")).toString() === "p" && (await arm.lerPreview(id, "mini")).toString() === "m");
  await arm.remover(id);
  check("remover apaga original e previews", !fs.existsSync(path.join(dir, "originais", id + ".enc")) && (await arm.lerPreview(id, "grande")) === null);
  check("nenhum arquivo temporario sobra apos gravacoes", fs.readdirSync(path.join(dir, "originais")).every((f) => !f.endsWith(".tmp")));

  secao("4. Marca d'agua e validacao de imagens");
  const v = await gerarVersoesMarcadas(original);
  const metaP = await sharp(v.preview).metadata();
  const metaM = await sharp(v.miniatura).metadata();
  check("dimensoes originais registradas (2400x1600)", v.largura === 2400 && v.altura === 1600);
  check("preview e JPEG e tem no maximo 1200 px", metaP.format === "jpeg" && Math.max(metaP.width, metaP.height) <= LADO_PREVIEW);
  check("miniatura e JPEG com no maximo 480 px", metaM.format === "jpeg" && Math.max(metaM.width, metaM.height) <= 480);
  check("preview e bem menor que o original", v.preview.length < original.length);
  // A marca precisa estar nos PIXELS: comparamos com o mesmo redimensionamento SEM marca.
  const semMarca = await sharp(original).resize({ width: metaP.width }).jpeg({ quality: 72 }).toBuffer();
  const a = await sharp(v.preview).raw().toBuffer();
  const b = await sharp(semMarca).raw().toBuffer();
  let dif = 0;
  for (let i = 0; i < a.length; i += 97) dif += Math.abs(a[i] - b[i]);
  const mediaDif = dif / (a.length / 97);
  check("a marca d'agua altera os pixels do preview (diferenca media > 3)", mediaDif > 3, mediaDif);
  const centro = async (buf) => sharp(buf).extract({ left: Math.floor(metaP.width * 0.3), top: Math.floor(metaP.height * 0.4), width: Math.floor(metaP.width * 0.4), height: Math.floor(metaP.height * 0.2) }).raw().toBuffer();
  const ca = await centro(v.preview), cb = await centro(semMarca);
  let d2 = 0;
  for (let i = 0; i < ca.length; i += 31) d2 += Math.abs(ca[i] - cb[i]);
  check("logotipo central cobre a regiao do meio da foto", d2 / (ca.length / 31) > 8, d2 / (ca.length / 31));
  const comExif = await sharp(original).withExif({ IFD0: { Copyright: "SEGREDO-EXIF" } }).jpeg().toBuffer();
  const vx = await gerarVersoesMarcadas(comExif);
  check("metadados EXIF do original NAO vazam para o preview", !vx.preview.includes(Buffer.from("SEGREDO-EXIF")) && (await sharp(vx.preview).metadata()).exif === undefined);
  const png = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#336699" } }).png().toBuffer();
  check("PNG e aceito e gera preview JPEG", (await gerarVersoesMarcadas(png)).formato === "png");
  const webp = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#336699" } }).webp().toBuffer();
  check("WebP e aceito", (await inspecionarImagem(webp)).formato === "webp");
  check("texto disfarcado de imagem e recusado", await gerarVersoesMarcadas(Buffer.from("isto nao e uma imagem")).then(() => false, (e) => e.name === "ErroValidacao"));
  const gif = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#336699" } }).gif().toBuffer();
  check("GIF (formato nao aceito) e recusado", await inspecionarImagem(gif).then(() => false, (e) => e.name === "ErroValidacao"));
  const pequena = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).jpeg().toBuffer();
  check("imagem menor que 600 px e recusada", await inspecionarImagem(pequena).then(() => false, (e) => e.name === "ErroValidacao"));
  check("buffer vazio e recusado", await inspecionarImagem(Buffer.alloc(0)).then(() => false, (e) => e.name === "ErroValidacao"));
  const retrato = await sharp(original).resize(1200, 1800, { fit: "cover" }).jpeg().toBuffer();
  const vr = await gerarVersoesMarcadas(retrato);
  const mr = await sharp(vr.preview).metadata();
  check("foto em retrato respeita o limite no lado maior", mr.height <= LADO_PREVIEW && mr.width < mr.height);
  const giradaExif = await sharp(await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#884422" } }).jpeg().toBuffer()).withMetadata({ orientation: 6 }).toBuffer();
  const ig = await inspecionarImagem(giradaExif);
  check("orientacao EXIF 90 graus inverte largura/altura registradas", ig.largura === 900 && ig.altura === 1600, ig);

  secao("5. Validadores");
  const ok = (f) => { try { f(); return true; } catch { return false; } };
  check("senha forte aceita", ok(() => V.validarForcaSenha("Senha#123")));
  check("senha curta recusada", !ok(() => V.validarForcaSenha("Ab1")));
  check("senha sem maiuscula recusada", !ok(() => V.validarForcaSenha("senha1234")));
  check("senha sem minuscula recusada", !ok(() => V.validarForcaSenha("SENHA1234")));
  check("senha sem numero recusada", !ok(() => V.validarForcaSenha("SenhaSenha")));
  check("senha acima de 72 bytes recusada (limite do bcrypt)", !ok(() => V.validarForcaSenha("Aa1" + "x".repeat(80))));
  check("e-mail normalizado em minusculas", V.normalizarEmail("  Ana@Exemplo.COM ") === "ana@exemplo.com");
  check("e-mail invalido recusado", !ok(() => V.normalizarEmail("sem-arroba")) && !ok(() => V.normalizarEmail("a@b")));
  check("preco minimo R$ 1,00 e maximo R$ 10.000,00", ok(() => V.validarPreco(100)) && ok(() => V.validarPreco(1000000)) && !ok(() => V.validarPreco(99)) && !ok(() => V.validarPreco(1000001)));
  check("preco nao inteiro/NaN recusado", !ok(() => V.validarPreco(19.9)) && !ok(() => V.validarPreco(NaN)));
  check("tags normalizadas (minusculas, sem duplicadas, ate 10)", JSON.stringify(V.normalizarTags(["Praia", "praia", " Sol ", ""])) === '["praia","sol"]' && V.normalizarTags(Array.from({ length: 15 }, (_, i) => "t" + i)).length === 10);
  check("data valida AAAA-MM-DD", ok(() => V.validarDataIso("2026-02-28", "d")) && !ok(() => V.validarDataIso("2026-02-30", "d")) && !ok(() => V.validarDataIso("28/02/2026", "d")));
  check("Luhn: numeros de teste", V.luhnValido("4242424242424242") && V.luhnValido("4000000000000002") && !V.luhnValido("4242424242424241") && !V.luhnValido("123"));
  check("bandeiras", V.bandeiraDoCartao("4242424242424242") === "visa" && V.bandeiraDoCartao("5555555555554444") === "mastercard" && V.bandeiraDoCartao("378282246310005") === "amex");

  secao("6. Gateway simulado e BR Code do Pix");
  const br = gerarBrCode({ chave: "pagamentos@lenspro.example", nome: "LENSPRO", cidade: "SAO PAULO", valorCentavos: 7480, txid: "LPTESTE123" });
  check("BR Code comeca com o indicador de formato e termina com CRC16", br.startsWith("000201") && /6304[0-9A-F]{4}$/.test(br));
  check("BR Code inclui o valor 74.80 e a chave Pix", br.includes("540574.80") && br.includes("br.gov.bcb.pix"));
  const crc = (txt) => { let c = 0xffff; for (const x of Buffer.from(txt)) { c ^= x << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, "0"); };
  check("CRC16 do BR Code confere", crc(br.slice(0, -4)) === br.slice(-4));
  const gw = new GatewaySimulado();
  const cob = { referencia: "LPTESTE123456", valorCentavos: 1000, descricao: "t", pagador: { nome: "A", email: "a@a.com" }, expiraEm: new Date() };
  const pix = await gw.criarCobrancaPix(cob);
  check("cobranca Pix simulada devolve o copia e cola (BR Code) com a referencia como txid", pix.copiaECola.length > 50 && pix.copiaECola.includes("LPTESTE123456"));
  const cartao = (numero) => gw.cobrarCartao(cob, { nome: "A", numero, validade: "12/39", cvv: "123" });
  check("cartao 4242... aprovado (visa, final 4242)", (await cartao("4242424242424242")).status === "aprovado" && (await cartao("4242424242424242")).final === "4242");
  check("cartao ...0002 recusado pelo emissor", (await cartao("4000000000000002")).status === "recusado");
  check("cartao ...9995 recusado por saldo", (await cartao("4000000000009995")).motivo === "Saldo insuficiente.");

  secao("7. CPF");
  check("CPF valido (com ou sem mascara)", V.validarCpf("529.982.247-25") === "52998224725" && V.validarCpf("52998224725") === "52998224725");
  check("CPF invalido recusado (digito, repetido, curto, vazio)", !ok(() => V.validarCpf("52998224726")) && !ok(() => V.validarCpf("11111111111")) && !ok(() => V.validarCpf("123")) && !ok(() => V.validarCpf("")));

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dirChave, { recursive: true, force: true });
  process.exit(resumo("unitarios") ? 0 : 1);
})().catch((e) => { console.error("ERRO NOS TESTES:", e); process.exit(1); });
