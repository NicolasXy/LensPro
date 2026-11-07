// spiderman
// Utilitarios dos testes: contador de verificacoes e montagem de multipart.
let total = 0;
let falhas = 0;
const nomesFalhas = [];

function check(nome, cond, detalhe) {
  total++;
  if (cond) {
    console.log(`  ✔ ${nome}`);
  } else {
    falhas++;
    nomesFalhas.push(nome);
    console.log(`  ✘ ${nome}${detalhe !== undefined ? "  -> " + (typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)) : ""}`);
  }
}

function secao(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

function resumo(rotulo) {
  console.log(`\nResumo ${rotulo}: ${total - falhas}/${total}`);
  if (falhas) console.log("Falhas:\n - " + nomesFalhas.join("\n - "));
  return falhas === 0;
}

/** Monta um corpo multipart/form-data (campos de texto primeiro, arquivo por ultimo, como o front). */
function multipart(campos, arquivo, nomeArquivo = "foto.jpg", tipo = "image/jpeg", nomeCampo = "arquivo") {
  const b = "----lenspro" + Math.random().toString(16).slice(2);
  const partes = [];
  for (const [k, v] of Object.entries(campos)) {
    partes.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (arquivo) {
    partes.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${nomeCampo}"; filename="${nomeArquivo}"\r\nContent-Type: ${tipo}\r\n\r\n`));
    partes.push(arquivo);
    partes.push(Buffer.from("\r\n"));
  }
  partes.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(partes), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}

module.exports = { check, secao, resumo, multipart };
