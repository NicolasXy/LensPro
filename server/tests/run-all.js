// spiderman
// Executa todas as suites em sequencia e falha se qualquer uma falhar.
const { spawnSync } = require("child_process");
const path = require("path");
let ok = true;
for (const f of ["run-unit.js", "run-api.js", "run-pagseguro.js", "run-seguranca.js"]) {
  console.log(`\n########## ${f} ##########`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", env: process.env });
  if (r.status !== 0) ok = false;
}
console.log(ok ? "\nTODAS AS SUITES PASSARAM" : "\nHA SUITES COM FALHA");
process.exit(ok ? 0 : 1);
