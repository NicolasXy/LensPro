# Rastreabilidade: pedidos do cliente e decisões próprias

Cada linha aponta onde o pedido é atendido e qual teste o comprova (`server/tests/run-api.js` = **A**, `run-unit.js` = **U**).

## A. Pedidos do cliente

| # | Pedido | Onde | Comprovação |
|---|---|---|---|
| 1 | Usar as criptografias e a segurança do sistema anterior (greencode) | `core/crypto.ts` (AES-256-GCM), `core/chaveMestra.ts`, `AuthService` (bcrypt, bloqueio), `plugins/autenticacao.ts` (JWT/RBAC), tabela `Auditoria` imutável, HMAC no webhook — ver [SECURITY.md](SECURITY.md) | U §1–3, A §1–5, A §16 |
| 2 | Atualizar a documentação no padrão do sistema anterior | `README.md`, `docs/API.md`, `SECURITY.md`, `FAILURE_SCENARIOS.md`, este arquivo, `openapi.json`, `GUIA_USUARIO.md` | — |
| 3 | Front em React para mais fluidez | `web/` (Vite + React 18 + TS, rotas *lazy*, carrinho local, sessão deslizante) | `vite build` sem erros; fluxo conferido no navegador |
| 4 | Melhorar o banco de dados | PostgreSQL + Prisma: 9 tabelas, UUID, `CHECK`s, índices, trigger, migração versionada | A §17 |
| 5 | Criação de usuários "já pronta" | cadastro público (comprador/fotógrafo), `POST /admin/usuarios` (qualquer papel), `seed.ts` com administrador, fotógrafos e compradores | A §1, A §5 |
| 6 | Duas interfaces: fotógrafo e comprador | `/estudio/*` (fotógrafo) e `/conta/*` + vitrine/carrinho/pagamento (comprador); `Protegida` redireciona por papel; servidor impõe o papel | A §4 |
| 7 | Fotógrafo publica fotos e define preços | `POST /estudio/fotos`, `PATCH /estudio/fotos/:id`; tela *Publicar* | A §8–§10 |
| 8 | Fotos anunciadas com marca d'água (anti-roubo) | `core/marcaDagua.ts`; só previews públicos; original cifrado | U §4, A §8 |
| 9 | Página de pagamento pronta | `web/src/pages/Pagamento.tsx` + `PagamentoService` (Pix copia e cola e cartão) + webhook | A §12–§14 |
| 10 | Estética adaptável/padronizada | `web/src/styles.css` (design system, agora tema **claro** e mobile-first) | conferido no navegador |
| 11 | Usar o código antigo como base | rotas e páginas mantidas: início, galeria, eventos, fotógrafos, contato, cadastro, login, recuperar/redefinir senha, perfil | — |
| 12 | Manter funcional | 4 suítes: 72 + 204 + 96 + 48; fluxo ponta a ponta no navegador sem erros de console | `npm test` |

## A.2. Prompt de evolução (full stack): bloco → onde está → como foi conferido

| Bloco | Pedido | Onde | Comprovação |
|---|---|---|---|
| 1 UX/UI | Tema claro por padrão, consistente em todas as telas; **identidade creme/preto/rosa (Outfit)** inspirada na referência enviada | `web/src/styles.css` (variáveis `:root`, `color-scheme: light`, bloco "Identidade visual"), `main.tsx` (fonte), `Layout.tsx` (cabeçalho em pílulas), `Home.tsx` (hero com busca e cartão "Em destaque"), `index.html` (`theme-color`), cores fixas escuras removidas de `EventoDetalhe.tsx` | capturas de home, galeria, login, cadastro, estúdio, admin, pagamento |
| 1 UX/UI | Mobile-first | regras base = celular; `@media (min-width: 560/821/961px)` ampliam; menu recolhível, sidebar vira barra rolável, alvos ≥ 44 px, campos 16 px (sem zoom no iOS) | viewport 390 px sem rolagem horizontal; desktop 1280 px |
| 1 UX/UI | Refinamento sutil | bordas finas, transições, carrossel com fade, skeletons, `prefers-reduced-motion` | — |
| 1 UX/UI | Interface só com texto (sem emojis/ícones) | rótulos em `App.tsx`, `Layout.tsx`, `Home.tsx`, páginas de estúdio/admin/pagamento; busca por glifos de emoji/ícone em `web/src` sem resultados | capturas novas em `docs/prints` |
| 1 UX/UI | Reskin sem remover função | só CSS + marcação mínima (busca na home, cartão "Em destaque", inicial na conta); todas as rotas, botões, formulários e fluxos foram mantidos | 4 suítes (72/204/96/48), `tsc`/`vite build`, fluxo de compra por Pix no navegador (desktop e celular), sem erros de console |
| 2 Segurança | Auditar cripto/hash/sessões | sessão em cookie `HttpOnly` + CSRF, `sv` invalida sessões ao trocar a senha, teto de 12 h, `config.ts` com guardas de produção | S, A §1–§5 |
| 2 Segurança | Eliminar vazamento de dados do cliente | `Cache-Control: no-store` na API, `Permissions-Policy`, logs com `redact` (senha, cartão, CPF, token, cookie), auditoria sem senha digitada no campo de e-mail, CPF/cartão cifrado nunca gravados, `/docs` desligado em produção | S, P |
| 2 Segurança | Limpar código sem mudar a estrutura | `noUnusedLocals/Parameters` no `tsconfig`, remoção do que sobrava; mesmas camadas e rotas | `tsc` limpo; suítes antigas seguem passando |
| 3 Funcional | Proteção contra download não autorizado + marca d'água padronizada | marca v2 (`core/marcaDagua.ts`), URLs assinadas (`core/urlAssinada.ts`), anti-hotlink, componente `Imagem` usado em todas as telas públicas, `previews:regenerar` | S, U §4 |
| 3 Funcional | Home dinâmica: "Trabalhos em destaque" + galeria rotativa | `GET /destaques` (`FotoService.destaquesDaHome`), `web/src/pages/Home.tsx` (`Carrossel`) | S (destaques), captura da home |
| 3 Funcional | Repasse de parte da venda ao fotógrafo | split em `charges[].splits` (`GatewayPagSeguro.montarDivisao`, `PagamentoService.montarRepasses`), campo no Estúdio, migração `20261104000000_split_pagbank` | P §9–§11 (96 verificações). **Não testado no PagBank real** |
| 3 Funcional | Integração PagSeguro completa | `services/GatewayPagSeguro.ts`, `PagamentoService.ts`, `pages/Pagamento.tsx`, `web/src/pagseguro.ts`, migração `20261103000000_pagseguro` | P §1–§8 (PagBank simulado). **Não testado contra o PagBank real** |
| 4 Docs | Documentação técnica e de usuário atualizadas | este conjunto de arquivos, `openapi.json` regenerado, capturas novas | — |
| Regras | NÃO QUEBRAR / FOCO NO UPGRADE | rotas e contratos antigos preservados; mudanças aditivas (campos e rotas novos). Exceção deliberada: `urlPreview`/`urlMiniatura` agora trazem `?e=&s=` e o preview sem assinatura dá 403 | suítes de regressão A e U ajustadas apenas onde o contrato de imagem mudou |

## B. Fluxos do protótipo e destino

| Protótipo (Flask) | Agora |
|---|---|
| `/`, `/galeria`, `/eventos`, `/fotografos`, `/contato` | mesmas rotas no React, alimentadas pela API |
| `/cadastro`, `/login`, `/logout`, `/perfil` | `/cadastro`, `/entrar`, sair no menu, perfil por papel (`/conta`, `/estudio`, `/admin`) |
| `/recuperar-senha`, `/redefinir-senha/<token>` | mesmas rotas; token só como SHA-256 no banco |
| Formulário de contato sem persistência | grava `MensagemContato`; admin lê em *Mensagens* |

## C. Decisões nossas (vale confirmar)

Não vieram do cliente; ajustáveis por configuração ou pequena mudança de código.

1. **Taxa da plataforma de 15%** (`TAXA_PLATAFORMA_PERCENT`) sobre cada venda; o fotógrafo vê o líquido.
2. **Reserva de 30 min** do pedido (`PEDIDO_EXPIRA_MIN`) e um pedido pendente por comprador.
3. **Faixa de preço** R$ 1,00 a R$ 10.000,00 e upload até 25 MB (JPEG/PNG/WebP, ≥ 600 px).
4. **Licença:** uma compra dá direito a baixar o original quantas vezes quiser (o contador é auditado); não há limite nem licenciamento por uso.
5. **Fotógrafo e admin não compram.** O cadastro público escolhe entre comprador e fotógrafo.
6. **Gateway:** PagSeguro como provedor real; simulado só em desenvolvimento. O QR Code do Pix é desenhado no navegador.
7. **Repasse por split do PagBank:** a parte do fotógrafo (preço − taxa) é paga na própria compra, direto na conta PagBank dele (`pagbankContaId`), sem custódia. Sem conta vinculada, a foto não pode ser paga. A chave Pix cifrada fica só como reserva.
8. **Foto vendida nunca some do comprador:** exclusão do fotógrafo arquiva; moderação oculta.
9. **Contas desativadas** perdem acesso imediatamente (usuário relido a cada requisição).
10. **Estorno/reembolso fora do escopo** e CPF do pagador exigido só quando o gateway é o PagSeguro (repassado, não gravado).
11. **MySQL → PostgreSQL**: o antigo `database.sql` foi substituído pela migração Prisma; os dados antigos não são importados.
