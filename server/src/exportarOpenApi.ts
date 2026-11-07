// spiderman
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { carregarConfiguracao } from "./config";
import { criarApp } from "./app";
import { criarPrisma } from "./db/prisma";

/**
 * Gera docs/openapi.json (contrato da API) sem precisar de banco: o
 * PrismaClient so abre conexao na primeira consulta.
 * Uso: npm run docs:openapi (dentro de server/)
 */
async function main(): Promise<void> {
  const url = "postgresql://x:x@localhost:5432/x";
  const prisma = criarPrisma(url);
  const config = carregarConfiguracao({
    DATABASE_URL: url,
    JWT_SECRET: "x".repeat(40),
    WEBHOOK_SECRET: "x".repeat(20),
    DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "lp-openapi-")),
    LOG_LEVEL: "silent",
    LIMITE_AUTH_POR_MINUTO: "0",
  });
  const { app } = await criarApp(config, prisma);
  await app.ready();
  const destino = path.join(__dirname, "..", "..", "docs", "openapi.json");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(app.swagger(), null, 2) + "\n");
  console.log(`OpenAPI gravado em ${destino}`);
  await app.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
