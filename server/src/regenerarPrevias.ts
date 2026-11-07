// spiderman
import { carregarConfiguracao } from "./config";
import { criarPrisma } from "./db/prisma";
import { Armazenamento } from "./core/armazenamento";
import { carregarChaveMestra } from "./core/chaveMestra";
import { MARCA_VERSAO, gerarVersoesMarcadas } from "./core/marcaDagua";

/**
 * Refaz previews e miniaturas de TODAS as fotos a partir dos originais cifrados,
 * aplicando o desenho atual da marca d'agua (versao MARCA_VERSAO). Use depois de trocar o
 * visual da marca ou o tamanho dos previews: `npm run previews:regenerar`.
 * Idempotente e seguro: o original nao e alterado; cada foto e tratada isoladamente.
 */
async function main(): Promise<void> {
  const config = carregarConfiguracao();
  const prisma = criarPrisma(config.databaseUrl);
  const arquivos = new Armazenamento(config.diretorioDados, carregarChaveMestra(config.diretorioDados, config.chaveMestraHex));
  const fotos = await prisma.foto.findMany({ include: { fotografo: { include: { perfil: true } } }, orderBy: { criadoEm: "asc" } });
  let ok = 0;
  let falhas = 0;
  for (const f of fotos) {
    try {
      const original = await arquivos.lerOriginal(f.id);
      const autor = f.fotografo.perfil?.nomeArtistico ?? `${f.fotografo.nome} ${f.fotografo.sobrenome}`;
      const v = await gerarVersoesMarcadas(original, autor);
      await arquivos.salvarPreviews(f.id, v.preview, v.miniatura);
      ok++;
    } catch (e) {
      falhas++;
      console.error(`Falha na foto ${f.id}: ${(e as Error).message}`);
    }
  }
  console.log(`Marca d'agua v${MARCA_VERSAO}: ${ok} foto(s) refeita(s), ${falhas} falha(s).`);
  await prisma.$disconnect();
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
