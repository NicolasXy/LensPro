// spiderman
// Gera os PNGs da marca d'agua usados em src/core/marcaDagua.ts:
//   assets/marca-ladrilho.png  -> padrao diagonal repetido sobre toda a foto
//   assets/marca-central.png   -> logotipo grande no centro
// Os PNGs ja vem prontos no projeto (a renderizacao do texto depende das
// fontes instaladas); rode `npm run marca-dagua` somente para trocar o texto/estilo.
const sharp = require("sharp");
const path = require("path");

const TEXTO = "LensPro";
const saida = (n) => path.join(__dirname, "..", "assets", n);

async function ladrilho() {
  const L = 420, A = 260;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}">
    <g transform="rotate(-28 ${L / 2} ${A / 2})" font-family="Poppins, DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" text-anchor="middle">
      <text x="${L / 2}" y="${A / 2}" font-size="46" fill="#000" fill-opacity="0.28" stroke="#000" stroke-opacity="0.28" stroke-width="3">${TEXTO}</text>
      <text x="${L / 2 - 1}" y="${A / 2 - 1}" font-size="46" fill="#fff" fill-opacity="0.62">${TEXTO}</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(saida("marca-ladrilho.png"));
}

// Segunda camada: diagonal oposta (+28 graus), menor e em outro passo. Duas diagonais cruzadas
// e com periodos diferentes tornam inviavel a remocao automatica por "inpainting" ou filtros.
async function ladrilhoCruzado() {
  const L = 340, A = 230;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}">
    <g transform="rotate(28 ${L / 2} ${A / 2})" font-family="Poppins, DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" text-anchor="middle">
      <text x="${L / 2}" y="${A / 2}" font-size="34" fill="#000" fill-opacity="0.22" stroke="#000" stroke-opacity="0.22" stroke-width="2.5">${TEXTO}</text>
      <text x="${L / 2 - 1}" y="${A / 2 - 1}" font-size="34" fill="#fff" fill-opacity="0.50">${TEXTO}</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(saida("marca-ladrilho2.png"));
}

async function central() {
  const L = 900, A = 220;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}">
    <g font-family="Poppins, DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" text-anchor="middle">
      <text x="${L / 2}" y="${A * 0.68}" font-size="150" fill="#000" fill-opacity="0.30" stroke="#000" stroke-opacity="0.30" stroke-width="8">${TEXTO}</text>
      <text x="${L / 2 - 2}" y="${A * 0.68 - 2}" font-size="150" fill="#fff" fill-opacity="0.70">${TEXTO}</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(saida("marca-central.png"));
}

ladrilho().then(ladrilhoCruzado).then(central).then(() => console.log("Marca d'agua gerada em assets/."));
