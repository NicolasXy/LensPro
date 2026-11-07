# LensPro

Marketplace de fotografias: **fotógrafos** publicam e precificam suas fotos; **compradores** navegam por previews com **marca d'água**, pagam (Pix ou cartão) e baixam o **original** sem marca. O backend aplica criptografia em repouso, controle de acesso por papel, trilha de auditoria imutável e pagamento real via **PagSeguro (PagBank)**, com webhook autenticado.

> Esta versão (2.0) substitui o protótipo Flask + MySQL (login, cadastro, recuperação de senha, perfil, eventos, fotógrafos, galeria, contato) por uma aplicação **Fastify + Prisma + PostgreSQL** com **front React**. Todas as páginas e fluxos do protótipo foram mantidos e evoluídos; a identidade (Poppins, destaque em vermelho-rosa) foi mantida, agora em **tema claro por padrão e mobile-first**.

## Sumário

1. [Visão geral](#visão-geral)
2. [Telas](#telas) · [Requisitos](#requisitos)
3. [Instalação](#instalação)
4. [Executando o sistema](#executando-o-sistema)
5. [Usuários de demonstração](#usuários-de-demonstração)
6. [Papéis e permissões](#papéis-e-permissões)
7. [Como funciona a proteção das fotos](#como-funciona-a-proteção-das-fotos)
8. [Pagamento](#pagamento)
9. [Testes automatizados](#testes-automatizados)
10. [Estrutura do projeto](#estrutura-do-projeto)
11. [Variáveis de ambiente](#variáveis-de-ambiente)
12. [Migração do protótipo (Flask/MySQL)](#migração-do-protótipo-flaskmysql)
13. [Limitações conhecidas](#limitações-conhecidas)
14. [Documentação adicional](#documentação-adicional)

## Visão geral

| Área | Tecnologia |
|---|---|
| API | Node.js 20.19+ / TypeScript, Fastify 5 (JSON Schema em todas as rotas, plugins, hooks) |
| Banco | PostgreSQL 16 via Prisma 7 (UUID, `CHECK`s, índices, trigger de imutabilidade) |
| Front | React 18 + TypeScript + Vite 6 + React Router 7 (rotas com *code splitting*); fonte **Outfit** servida pelo próprio site (`@fontsource-variable/outfit`, sem CDN, compatível com a CSP) |
| Imagens | `sharp` (decodificação real, marca d'água, previews, remoção de EXIF) |
| Segurança | AES-256-GCM, bcrypt, sessão em cookie `HttpOnly` + CSRF (JWT 30 min), RBAC, bloqueio por tentativas, URLs de preview assinadas, webhook autenticado, Helmet/CSP, rate limit |
| Pagamento | PagSeguro/PagBank (Orders API: Pix com QR Code e cartão cifrado no navegador); gateway simulado só em desenvolvimento |

Duas interfaces, uma por papel:

- **Estúdio (fotógrafo):** painel com indicadores, publicar fotos (envio, título, preço, tags, evento), gerenciar fotos (editar preço, ocultar, excluir), eventos, vendas com valor líquido, perfil público e chave Pix.
- **Vitrine/Home dinâmica:** carrossel rotativo com fotos publicadas, *Trabalhos em destaque* (mais vendidos e recentes, intercalando fotógrafos) e fotógrafos parceiros, tudo vindo de `GET /destaques`.
- **Comprador:** vitrine com busca/filtros, carrinho, página de pagamento (Pix com QR Code e copia e cola, ou cartão), "minhas fotos" com download do original, pedidos e dados da conta.
- **Administração:** painel, usuários (criar qualquer papel, ativar/desativar, redefinir senha), moderação de fotos, auditoria e mensagens do "Fale conosco".

## Telas

**Interface somente com texto:** o site não usa emojis nem ícones (menu lateral, botões, avisos, passos do pagamento e controles do carrossel são palavras: "Anterior", "Próxima", "Menu"). Ícones só voltam se você os pedir.

**Identidade visual:** fundo **creme**, tinta preta, **rosa** (`#ff4560`) só como acento e a fonte Outfit. Títulos grandes e compactos, com uma palavra em itálico rosa; rótulos pequenos em caixa-alta com ponto rosa (*eyebrows*); botões em pílula (preto por padrão, rosa na busca); cantos discretos e bordas finas em vez de sombras pesadas. No cabeçalho: logo com ponto, abas em pílula (a ativa em preto), carrinho, *Entrar* em texto e a conta em pílula preta com a inicial do usuário. Tudo é *mobile-first* (menu recolhível no celular). Os tokens ficam no início de `web/src/styles.css` (`:root`) e o bloco "Identidade visual" no fim do arquivo.

**Página inicial:** título com busca em pílula (envia para `/galeria?q=…`, com atalhos *Populares*), foto grande rotativa com o cartão flutuante **"Em destaque"** (título, fotógrafo e preço da foto atual), *Trabalhos em destaque*, fotógrafos parceiros e números da vitrine.

| Home dinâmica | Galeria (previews com marca d'água) |
|---|---|
| ![Home](docs/prints/home.png) | ![Galeria](docs/prints/galeria.png) |

| Home no celular | Pagamento (Pix, celular) |
|---|---|
| ![Home mobile](docs/prints/home-mobile.png) | ![Pagamento](docs/prints/pagamento-pix.png) |

| Estúdio: publicar foto | Estúdio: vendas | Administração |
|---|---|---|
| ![Publicar](docs/prints/estudio-publicar.png) | ![Vendas](docs/prints/estudio-vendas.png) | ![Usuários](docs/prints/admin-usuarios.png) |

## Requisitos

- Node.js **20.19+** (ou 22.12+/24+) e npm
- PostgreSQL **16** (Docker opcional — `docker-compose.yml` incluso)

## Instalação

### Ubuntu 24.04 LTS ou superior

```bash
# 1. Node.js 22 (se ainda não tiver) e Docker
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs docker.io docker-compose-v2

# 2. Banco de dados
docker compose up -d

# 3. Configuração
cp server/.env.example server/.env
#   edite server/.env: JWT_SECRET (mín. 32 caracteres) e WEBHOOK_SECRET
#   gerar segredo: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Dependências, migrações, build e dados de demonstração
npm run setup
```

### Windows 10 ou superior (PowerShell)

```powershell
# Instale Node.js LTS (https://nodejs.org) e Docker Desktop
docker compose up -d
Copy-Item server\.env.example server\.env   # edite JWT_SECRET e WEBHOOK_SECRET
npm run setup
```

`npm run setup` instala as dependências de `server/` e `web/`, gera o Prisma Client, aplica as migrações (`prisma migrate deploy`), compila a API, aplica o *seed* (idempotente) e compila o front.

## Executando o sistema

```bash
npm start            # API + front compilado em http://localhost:3000
```

Desenvolvimento com recarga automática (dois terminais):

```bash
npm run dev:server   # API em :3000
npm run dev:web      # Vite em :5173 (proxy de /api para :3000)
```

- Site: <http://localhost:3000>
- Documentação interativa da API (Swagger UI): <http://localhost:3000/docs>
- Saúde: `GET /api/v1/health`

## Usuários de demonstração

O *seed* cria os usuários abaixo (senha `Lenspro#2026`, ou o valor de `SEED_SENHA`) e fotos geradas proceduralmente, que passam pelo **mesmo** pipeline do upload real (marca d'água + original cifrado):

| Papel | E-mail |
|---|---|
| Administrador | `admin@lenspro.com` |
| Fotógrafos | `carlos@lenspro.com`, `mariana@lenspro.com`, `pedro@lenspro.com` |
| Compradores | `cliente@lenspro.com`, `rafael@lenspro.com` |

> Somente para desenvolvimento. Em produção, não rode o seed (ou troque todas as senhas).

A criação de contas já vem pronta: o cadastro público cria apenas **comprador** ou **fotógrafo**; o **administrador** cria qualquer papel em *Administração → Usuários* (ou `POST /api/v1/admin/usuarios`). O primeiro administrador vem do seed.

## Papéis e permissões

| Ação | Visitante | Comprador | Fotógrafo | Admin |
|---|:-:|:-:|:-:|:-:|
| Ver vitrine, eventos, fotógrafos (previews marcados) | Sim | ✔ | Sim | ✔ |
| Criar pedido, pagar, baixar originais comprados | | Sim | | |
| Publicar/editar/excluir as próprias fotos e eventos, ver vendas | | | Sim | |
| Gerenciar usuários, moderar fotos, ver auditoria e mensagens | | | | Sim |

Fotógrafos e administradores **não compram** (evita auto-compra e conflito de interesse). A regra é imposta no servidor por *hooks* `onRequest` de cada rota (`permitir(...)`); o front apenas esconde o que o papel não usa.

## Como funciona a proteção das fotos

1. No envio, a imagem é **decodificada de verdade** (`sharp`): arquivo que só "parece" imagem é recusado.
2. O **original** é cifrado com AES-256-GCM (`data/originais/<id>.enc`); o SHA-256 fica no banco para checar integridade.
3. O **preview** (1200 px, JPEG q68, EXIF removido) recebe a **marca d'água v2**: duas camadas de mosaico diagonal cruzadas, logotipo central e uma faixa de crédito com o nome do fotógrafo. A miniatura (480 px) deriva do preview já marcado. Para reaplicar a marca em fotos antigas: `npm run previews:regenerar` (em `server/`).
4. **URLs de preview assinadas e com validade:** `urlPreview`/`urlMiniatura` trazem `?e=<expira>&s=<HMAC>`; sem assinatura válida a rota responde 403, e o link copiado expira em até ~5 h. Há ainda *rate limit* e bloqueio de *hotlink* (`Sec-Fetch-Dest`/`Sec-Fetch-Site`), então a imagem não pode ser embutida em outro site nem raspada em massa.
5. No front, o componente `Imagem` coloca um escudo transparente sobre a foto (bloqueia menu de contexto, arrastar e toque longo) e as fotos somem na impressão.
6. **Nenhuma rota pública entrega o original.** O único caminho que decifra é `GET /api/v1/compras/:id/download`: exige pedido **pago** do próprio comprador, confere o SHA-256, audita e responde `Cache-Control: private, no-store`.

> Honestidade: nenhuma proteção impede *print de tela*. O objetivo é que o que se obtém seja pequeno, marcado nos pixels com crédito do autor e de baixa qualidade, e que o arquivo útil só exista após o pagamento.

## Pagamento

O provedor fica atrás da interface `GatewayPagamento`. Há duas implementações, escolhidas por `PAGAMENTO_GATEWAY`:

| Gateway | Uso | Observação |
|---|---|---|
| `pagseguro` | produção e sandbox | Orders API do PagBank (Pix com `qr_codes`, cartão com `charges`) |
| `simulado` | só desenvolvimento | **Recusado** quando `NODE_ENV=production` |

**Configurar o PagSeguro**

1. Gere no painel do PagBank (ambiente *sandbox* para testar) o token da conta; para o cartão, a chave pública é obtida pelo próprio servidor, sem configuração extra.
2. Em `server/.env`: `PAGAMENTO_GATEWAY="pagseguro"`, `PAGSEGURO_TOKEN`, `PAGSEGURO_CONTA_ID` (ACCO_… da conta dona do token), `PAGSEGURO_AMBIENTE="sandbox"` (ou `producao`) e `PAGSEGURO_NOTIFICACAO_URL` — URL **pública HTTPS** do `POST /api/v1/pagamentos/webhook/pagseguro` (em desenvolvimento, use um túnel como ngrok).
3. Reinicie. A tela de pagamento passa a pedir o **CPF** (exigido pelo PagBank; é repassado e **nunca gravado**), esconde o aviso de demonstração e o botão "Simular pagamento".

**Como o fluxo é protegido**

- **Cartão:** o número é cifrado **no navegador** com o SDK oficial do PagBank; o LensPro só recebe o texto cifrado e guarda bandeira + 4 últimos dígitos.
- **Pix:** QR Code desenhado no navegador a partir do "copia e cola"; a página consulta o pedido a cada 5 s.
- **Webhook:** cabeçalho `x-authenticity-token` = SHA-256 de `"{token}-{corpo bruto}"`, comparado em tempo constante antes de interpretar o corpo; confirmação **idempotente**.
- **Reconciliação:** `POST /pedidos/:id/pagamento/verificar` pergunta o status ao PagBank (cobre webhook perdido ou ambiente sem URL pública).
- **Valor:** o valor pago precisa ser **igual** ao cobrado; divergência não libera o pedido e fica na auditoria.
- A chamada ao PagBank acontece **fora** das transações do banco (fluxo em três fases) e usa `x-idempotency-key`; indisponibilidade do provedor vira `502` sem perder o pedido.
- **Split (repasse ao fotógrafo):** cada venda é dividida **pelo PagBank no momento da compra** (`charges[].splits`, método `FIXED`, sem custódia): o fotógrafo recebe preço − taxa direto na conta PagBank dele; a plataforma (dono do token) recebe a soma das taxas. Compra com fotos de vários fotógrafos gera um recebedor por fotógrafo. Detalhes abaixo.
- **Regras:** preço travado no pedido por 30 min (`PEDIDO_EXPIRA_MIN`), um pedido pendente por comprador, taxa da plataforma `TAXA_PLATAFORMA_PERCENT` (15%) gravada por item.

**Split: como configurar**

1. A conta PagBank da plataforma (dona do token) informa seu id em `PAGSEGURO_CONTA_ID` (`ACCO_…`). Com o PagSeguro, `TAXA_PLATAFORMA_PERCENT` deve ser ≥ 1 (o split exige parte positiva para a plataforma).
2. Cada fotógrafo informa o id da conta PagBank dele em **Estúdio → Perfil e repasse** (`PUT /estudio/perfil`, campo `pagbankContaId`). O id não é segredo, mas a API só o devolve ao próprio fotógrafo.
3. Se algum fotógrafo do pedido **não** tem conta vinculada, o pagamento é recusado (409) com mensagem clara e **nada é cobrado**.
4. Pré-requisitos do lado do PagBank (fora do código): todos os recebedores precisam de conta PagBank adequada e a sua conta precisa estar **habilitada para split** (o PagBank pode exigir aprovação). Veja <https://developer.pagbank.com.br/docs/configurador-de-split>.

**Modo simulado (dev):** Pix pendente até o botão "Simular pagamento" ou o webhook `POST /api/v1/pagamentos/webhook` (`X-Lenspro-Assinatura` = HMAC-SHA256 do corpo com `WEBHOOK_SECRET`); cartão `4242 4242 4242 4242` aprova, `…0002` é recusado, `…9995` saldo insuficiente.

## Testes automatizados

```bash
cd server
# banco de teste (uma vez):
#   createdb lenspro_test  e aplique TODAS as migrações em ordem:
#   for m in prisma/migrations/*/migration.sql; do psql lenspro_test -f $m; done
# TEST_DATABASE_URL (padrão: postgresql://lenspro:lenspro@localhost:5432/lenspro_test)
npm test             # compila e roda tests/run-all.js
node tests/run-unit.js       # 72 verificações, sem banco
node tests/run-api.js        # 204 verificações de integração (app.inject + PostgreSQL)
node tests/run-pagseguro.js  # 96 verificações do gateway PagSeguro (fetch simulado)
node tests/run-seguranca.js  # 48 verificações de sessão/cookie/CSRF, URLs assinadas, hotlink, produção
```

> O teste de API executa `TRUNCATE` em **todas as tabelas** do banco apontado por `TEST_DATABASE_URL`. Nunca aponte para o banco real.

Cobertura: criptografia (adulteração, chave errada, truncamento), chave mestra, armazenamento cifrado, marca d'água nos pixels, validação de upload, cadastro/login/bloqueio/recuperação de senha, varredura RBAC de todas as rotas privadas, revogação imediata, Pix cifrado, pedidos/pagamentos, webhook (assinatura inválida, repetido, cancelado), download e integridade, exclusão/arquivamento, moderação, auditoria imutável, `CHECK`s do banco e cabeçalhos de segurança. Detalhes em [docs/FAILURE_SCENARIOS.md](docs/FAILURE_SCENARIOS.md).

## Estrutura do projeto

```
lenspro/
├── package.json                  scripts de conveniência (setup, start, dev, test)
├── docker-compose.yml            PostgreSQL 16 local
├── docs/                         API.md, SECURITY.md, FAILURE_SCENARIOS.md, REQUISITOS.md, openapi.json
├── GUIA_USUARIO.md               guia passo a passo para quem não programa
├── server/
│   ├── prisma/                   schema.prisma + migrations (SQL com CHECKs e trigger)
│   ├── assets/                   marca d'água (PNG) — regenere com `npm run marca-dagua`
│   ├── scripts/gerarMarcaDagua.js
│   ├── tests/                    run-unit.js, run-api.js, run-pagseguro.js, run-seguranca.js, run-all.js
│   └── src/
│       ├── server.ts             porta, shutdown gracioso, varredura de pedidos vencidos
│       ├── app.ts                composition root (plugins, serviços, rotas, serve o front)
│       ├── config.ts  errors.ts  seed.ts  exportarOpenApi.ts
│       ├── routes/rotas.ts       todas as rotas /api/v1 com JSON Schema
│       ├── controllers/          somente HTTP
│       ├── services/             regras de negócio (Auth, Foto, Pedido, Pagamento, Compra…)
│       ├── repositories/         acesso ao banco (Prisma)
│       ├── db/                   Prisma + UnidadeDeTrabalho (transações)
│       ├── core/                 crypto, chaveMestra, armazenamento, marcaDagua, validadores
│       └── plugins/              autenticação (JWT + RBAC) e tratamento de erros
└── web/                          front React (Vite)
    └── src/ pages/ (públicas, conta, estudio, admin) · components/ · api.ts · auth.tsx · cart.tsx
```

Camadas: **rotas → controllers → services → repositories**. Controllers não tocam o banco; services não conhecem o Fastify; transações passam pela `UnidadeDeTrabalho`.

## Variáveis de ambiente

Ver `server/.env.example` (comentado). Obrigatórias: `DATABASE_URL`, `JWT_SECRET` (≥ 32 caracteres), `WEBHOOK_SECRET` (≥ 16). Pagamento: `PAGAMENTO_GATEWAY`, `PAGSEGURO_TOKEN`, `PAGSEGURO_CONTA_ID`, `PAGSEGURO_AMBIENTE`, `PAGSEGURO_NOTIFICACAO_URL`. E-mail: `SMTP_URL`, `EMAIL_REMETENTE`. Outras: `EXPOR_DOCS`. **Em produção** o servidor recusa iniciar com segredos "troque…", sem SMTP, sem HTTPS na `URL_PUBLICA` ou com o gateway simulado. `ENCRYPTION_KEY` (64 hex) é opcional: vazia, a chave mestra é gerada em `data/master.key` (permissão 0600) na primeira execução.

## Migração do protótipo (Flask/MySQL)

| Protótipo | Agora |
|---|---|
| Flask + Jinja, páginas `.html` | API Fastify + front React (SPA), mesmas rotas de página (`/galeria`, `/eventos`, `/fotografos`, `/contato`, `/cadastro`, `/recuperar-senha`…) |
| MySQL, tabela única `usuarios` | PostgreSQL com 9 tabelas (usuários, perfis, eventos, fotos, pedidos, itens, pagamentos, auditoria, mensagens) |
| Senha com hash Werkzeug | bcrypt + política de senha forte + bloqueio por tentativas |
| Token de reset em texto no banco | apenas o SHA-256 do token (1 h, uso único) |
| Sessão de cookie | cookie `HttpOnly` + `SameSite=Strict` (JWT 30 min, renovação por atividade, teto de 12 h) |
| E-mail só impresso no console | `EnviadorEmail`: SMTP (`nodemailer`) em produção, console em desenvolvimento |

Os dados do protótipo eram apenas contas de teste; recadastre-as ou crie-as pelo painel de administração. As senhas antigas (hash Werkzeug) não são importadas.

## Limitações conhecidas

- **PagSeguro não foi testado contra o PagBank real:** a integração segue a documentação da Orders API e foi verificada com um `fetch` simulado (96 verificações, incluindo o split). Falta rodar uma compra completa em *sandbox* com suas credenciais; o comportamento do SDK de cartão no navegador (e a CSP que o libera) também só se confirma lá.
- **Split do PagBank implementado pela documentação, não testado no PagBank real.** Pontos em aberto: (a) o **Pix dividido** é enviado em `charges` (a documentação coloca `splits` ali, não em `qr_codes`), e o local do "copia e cola" na resposta não aparece nos exemplos: o código procura nos locais prováveis e, se não achar, falha com 502 sem cobrar; (b) a conta da plataforma e as dos fotógrafos precisam estar habilitadas para split pelo PagBank; (c) taxas do PagBank sobre a venda e quem as arca não foram modeladas (hoje a plataforma fica com o restante, descontando eventual tarifa por fora).
- **Sem estorno/reembolso**: um estorno após o split não é revertido automaticamente entre as contas.
- A chave Pix cadastrada pelo fotógrafo fica cifrada como reserva (não é usada pelo split).
- **Cartão exige navegador** com o SDK do PagBank (script de `assets.pagseguro.com.br`, liberado na CSP apenas com o gateway real).
- **Chave mestra:** `data/master.key` fica no mesmo servidor dos dados; em produção injete `ENCRYPTION_KEY` de um cofre e faça backup separado (perdê-la torna os originais irrecuperáveis).
- **Sem 2FA** e sem rotação da chave mestra.
- **Print de tela** não pode ser impedido (ver proteção das fotos).
- **`prisma migrate deploy`:** as migrações SQL foram validadas aplicando-as no PostgreSQL; rode `npm run setup` no seu ambiente para confirmar o fluxo oficial.
- Fotos removidas por moderação deixam de ter preview, mas quem já comprou mantém o download.
- Não há teste automatizado do front; ele foi verificado em navegador (home, galeria, login, estúdio, admin, compra por Pix, em desktop e celular).

## Documentação adicional

- [docs/API.md](docs/API.md) — arquitetura, modelo de dados, endpoints, decisões e trade-offs
- [docs/SECURITY.md](docs/SECURITY.md) — criptografia, senhas, sessão, RBAC, marca d'água, pagamento
- [docs/FAILURE_SCENARIOS.md](docs/FAILURE_SCENARIOS.md) — cenários de falha cobertos pelos testes
- [docs/REQUISITOS.md](docs/REQUISITOS.md) — rastreabilidade dos pedidos e decisões próprias
- [docs/openapi.json](docs/openapi.json) — contrato OpenAPI (`npm run docs:openapi`)
- [GUIA_USUARIO.md](GUIA_USUARIO.md) — guia para quem não programa
