# LensPro API

API REST (prefixo `/api/v1`) do marketplace de fotografias. Documentação interativa em `/docs` (Swagger UI) e contrato em [openapi.json](openapi.json) (`npm run docs:openapi`).

## 1. Como executar

```bash
docker compose up -d                       # PostgreSQL 16
cp server/.env.example server/.env         # edite JWT_SECRET (>= 32 chars) e WEBHOOK_SECRET (e, para pagamento real, as variáveis PAGSEGURO_*)
npm run setup                              # dependências, migrações, build, seed
npm start                                  # http://localhost:3000  (site em /, API em /api/v1, docs em /docs)
```

Configuração por variáveis de ambiente (`server/src/config.ts`; lista comentada em `server/.env.example`). A porta vem de `PORT`; o servidor encerra com *graceful shutdown* (SIGINT/SIGTERM, tempo limite `SHUTDOWN_TIMEOUT_MS`) e uma varredura a cada minuto expira pedidos pendentes vencidos.

## 2. Arquitetura em camadas

```
HTTP ─► rotas (JSON Schema + hooks de RBAC)
        └─► controllers   só HTTP: lê request, chama o service, monta a resposta
             └─► services regras de negócio, validações, cálculos, transições de status
                  └─► repositories   Prisma Client; sem regra de negócio
                       └─► PostgreSQL / armazenamento cifrado em disco
```

- `app.ts` é o *composition root*: monta plugins e injeta dependências. Não abre porta nem lê o ambiente, então os testes sobem o app com `app.inject` e a mesma configuração do servidor real.
- `UnidadeDeTrabalho` expõe `simples()` (leituras/escritas isoladas) e `transacao(fn)` (`$transaction`): as operações que precisam de atomicidade (criar pedido, pagar, publicar foto) passam por ela.
- Em produção o **mesmo processo** serve a API e o front React compilado (`web/dist`, com *fallback* de SPA para rotas fora de `/api/`).

## 3. Modelo de dados (`server/prisma/schema.prisma`)

```
Usuario 1──0..1 PerfilFotografo        (nome artístico, bio, cidade, Pix cifrado + máscara)
Usuario 1──N Evento ──1..N Foto (opcional)
Usuario 1──N Foto 1──N ItemPedido N──1 Pedido N──1 Usuario(comprador)
Pedido  1──N Pagamento                 (Pix/cartão; várias tentativas por pedido)
Usuario 1──N Auditoria (append-only)   MensagemContato (Fale conosco)
```

| Tabela | Pontos de atenção |
|---|---|
| `Usuario` | e-mail único e em minúsculas (`CHECK`); papel `admin/fotografo/comprador`; `versao`, tentativas de login, `bloqueadoAte`; `resetTokenHash` (SHA-256) |
| `Foto` | preço em **centavos** (`CHECK` 100–1.000.000); `tags text[]`; `status` `publicada/oculta/removida`; `sha256Original`; nunca guarda caminho do arquivo (derivado do `id`) |
| `Pedido` | `status` `pendente/pago/cancelado/expirado`; `CHECK (status='pago') = (pagoEm IS NOT NULL)`; `expiraEm` |
| `ItemPedido` | **preço e taxa da plataforma travados** no momento do pedido; `UNIQUE(pedidoId, fotoId)`; contador de downloads |
| `PerfilFotografo.pagbankContaId` | conta PagBank do fotógrafo (`CHECK` de formato `ACCO_…`); migração `20261104000000_split_pagbank` |
| `Pagamento` | `referenciaGateway` único; só bandeira + 4 últimos dígitos; `pixCopiaECola` |
| `Pagamento.gatewayPedidoId` | id do pedido no PagBank (consulta de status e reconciliação), índice próprio; migração `20261103000000_pagseguro` |
| `Auditoria` | trigger bloqueia UPDATE/DELETE |

UUIDs (`gen_random_uuid()`), `timestamptz`, `VarChar` com limites e índices nas colunas de filtro. A migração `20261029000000_init` contém as tabelas, `CHECK`s e o trigger.

## 4. Autenticação: cookie HttpOnly + JWT

`POST /auth/login` ou `/auth/cadastro` abre a sessão: o JWT (HS256, 30 min) vai num cookie `lp_sessao` (`HttpOnly`, `SameSite=Strict`, `Path=/api`, `Secure` em produção) e também no corpo (`{ token, tipo: "Bearer", expiraEm, usuario }`) para clientes de API, que podem usar `Authorization: Bearer`.

- **CSRF:** escritas autenticadas por cookie exigem o cabeçalho `X-Lenspro-Csrf: 1` (o front envia sempre).
- `POST /auth/renovar` renova enquanto há atividade (teto absoluto de 12 h); `POST /auth/sair` apaga o cookie.
- O token carrega `sv` (impressão digital da senha): trocar/redefinir a senha invalida as sessões antigas. O usuário é relido a cada requisição, então desativar a conta vale na hora.

Detalhes em [SECURITY.md](SECURITY.md#3-sessão-cookie-httponly-csrf-e-invalidação).

## 5. Transações e concorrência

- **Concorrência otimista:** edição de usuário, perfil, foto e evento aceita `versao`; o `UPDATE … WHERE id AND versao` afetando 0 linhas devolve **409**.
- **Bloqueio pessimista:** `SELECT … FOR UPDATE` no comprador (criar pedido) e no pedido (pagar, webhook, cancelar), evitando dois pedidos simultâneos e dupla confirmação.
- **Transições condicionais** (`pendente → pago`) fazem o webhook repetido virar *no-op* (idempotência).
- **Consistência arquivo × banco:** originais/previews são gravados antes da transação; se ela falhar, os arquivos são removidos.

## 6. Endpoints (prefixo `/api/v1`)

Erros: `{ "erro": "<Tipo>", "mensagem": "…" }` com 400 (validação), 401 (sem/inválido token), 403 (papel, CSRF, URL de imagem inválida), 404, 409 (conflito/versão/estado), 413 (arquivo grande), 429 (tentativas/limite), 502 (provedor de pagamento indisponível). Todas as respostas da API levam `Cache-Control: no-store`. Listas paginadas: `?pagina=1&tamanhoPagina=20` → `{ itens, total, pagina, tamanhoPagina, totalPaginas }`.

### Sistema

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/api/v1/health` | Verifica se a API esta no ar |

### Autenticacao

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/api/v1/auth/cadastro` | Cria conta de comprador ou fotografo e ja devolve o token |
| `POST` | `/api/v1/auth/login` | Login: abre a sessão (cookie HttpOnly) e devolve o JWT (30 min) |
| `POST` | `/api/v1/auth/sair` | Encerra a sessão (apaga o cookie) |
| `POST` | `/api/v1/auth/recuperar-senha` | Pede o link de recuperacao (resposta sempre igual) |
| `POST` | `/api/v1/auth/redefinir-senha` | Define a nova senha com o token do link |

### Conta

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/api/v1/auth/renovar` | Renova o token (sessao deslizante de 30 min por inatividade) |
| `GET` | `/api/v1/auth/eu` | Dados da conta logada (e perfil, se fotografo) |
| `PATCH` | `/api/v1/auth/eu` | Altera nome e sobrenome |
| `PUT` | `/api/v1/auth/senha` | Troca a propria senha |

### Contato

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/api/v1/contato` | Formulario Fale conosco |

### Vitrine

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/api/v1/destaques` | Home: `destaques` (mais vendidas + recentes, intercalando fotógrafos), `rotativas` (carrossel) e números da vitrine; cache de 60 s |
| `GET` | `/api/v1/fotos` | Lista fotos publicadas (somente previews com marca d'agua; `urlPreview`/`urlMiniatura` já vêm assinadas) |
| `GET` | `/api/v1/fotos/tags` | Tags mais usadas |
| `GET` | `/api/v1/fotos/{id}` | Detalhe publico da foto |
| `GET` | `/api/v1/fotos/{id}/preview` | Preview com marca d'água v2 (JPEG até 1200 px); exige URL assinada `?e=&s=` (403 sem ela) |
| `GET` | `/api/v1/fotos/{id}/miniatura` | Miniatura com marca d'água (480 px); exige URL assinada |
| `GET` | `/api/v1/eventos` | Lista eventos ativos |
| `GET` | `/api/v1/eventos/{id}` | Detalhe do evento |
| `GET` | `/api/v1/fotografos` | Lista fotografos |
| `GET` | `/api/v1/fotografos/{id}` | Perfil publico do fotografo |

### Estudio

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/api/v1/estudio/resumo` | Indicadores do fotografo |
| `GET` | `/api/v1/estudio/vendas` | Vendas (com o liquido apos a taxa) |
| `PUT` | `/api/v1/estudio/perfil` | Atualiza o perfil publico, a chave Pix (cifrada) e `pagbankContaId` (conta PagBank `ACCO_…` que recebe a parte do fotografo por split; `null` desvincula) |
| `POST` | `/api/v1/estudio/fotos` | Publica uma foto (multipart: arquivo, titulo, precoCentavos, descricao, tags, eventoId). Gera preview com marca d'agua e cifra o original. |
| `GET` | `/api/v1/estudio/fotos` | Minhas fotos |
| `PATCH` | `/api/v1/estudio/fotos/{id}` | Edita titulo, preco, tags, evento ou visibilidade |
| `DELETE` | `/api/v1/estudio/fotos/{id}` | Exclui (definitiva sem vendas; arquivada se ja vendida) |
| `GET` | `/api/v1/estudio/eventos` | Meus eventos |
| `POST` | `/api/v1/estudio/eventos` | Cria evento |
| `PATCH` | `/api/v1/estudio/eventos/{id}` | Edita evento |
| `DELETE` | `/api/v1/estudio/eventos/{id}` | Exclui evento (fotos permanecem) |

### Compras

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/api/v1/pedidos` | Cria pedido com as fotos do carrinho (precos travados por 30 min) |
| `GET` | `/api/v1/pedidos` | Meus pedidos |
| `GET` | `/api/v1/pedidos/{id}` | Detalhe do pedido |
| `POST` | `/api/v1/pedidos/{id}/cancelar` | Cancela pedido pendente |
| `GET` | `/api/v1/compras` | Minhas fotos compradas |
| `GET` | `/api/v1/compras/{id}/download` | Baixa o ORIGINAL (sem marca d'agua) de uma foto comprada |

### Pagamento

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/api/v1/pagamento/config` | Gateway ativo (`simulado`/`pagseguro`) e chave pública para cifrar o cartão no navegador |
| `POST` | `/api/v1/pedidos/{id}/pagamento` | Paga com Pix (QR Code + copia e cola) ou cartão. Corpo: `metodo`, `cpf` (PagSeguro), `cartao` (`{nome, criptografado}` no PagSeguro; `{numero, nome, validade, cvv}` no simulado) |
| `POST` | `/api/v1/pedidos/{id}/pagamento/verificar` | Consulta o gateway e atualiza o pedido (reconciliação de webhook perdido) |
| `POST` | `/api/v1/pedidos/{id}/pagamento/simular-pix` | (Só modo simulado; 4xx com o PagSeguro) confirma o Pix pendente |
| `POST` | `/api/v1/pagamentos/webhook/pagseguro` | Notificação do PagSeguro (`x-authenticity-token` = SHA-256 de `token-corpo`) |
| `POST` | `/api/v1/pagamentos/webhook` | Webhook do gateway (header X-Lenspro-Assinatura = HMAC-SHA256 do corpo) |

### Admin

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/api/v1/admin/resumo` | Indicadores da plataforma |
| `GET` | `/api/v1/admin/usuarios` | Lista usuarios |
| `POST` | `/api/v1/admin/usuarios` | Cria usuario com qualquer papel |
| `PATCH` | `/api/v1/admin/usuarios/{id}/ativo` | Ativa/desativa conta (vale na hora) |
| `PATCH` | `/api/v1/admin/usuarios/{id}` | Altera nome do usuario |
| `PUT` | `/api/v1/admin/usuarios/{id}/senha` | Redefine a senha de um usuario |
| `GET` | `/api/v1/admin/fotos` | Todas as fotos (moderacao) |
| `POST` | `/api/v1/admin/fotos/{id}/remover` | Remove foto da vitrine (compradores mantem o acesso) |
| `POST` | `/api/v1/admin/fotos/{id}/restaurar` | Restaura foto removida (volta oculta) |
| `GET` | `/api/v1/admin/auditoria` | Trilha de auditoria |
| `GET` | `/api/v1/admin/mensagens` | Mensagens do Fale conosco |

### Fluxos principais

**Comprar:** `POST /pedidos {fotoIds}` → `GET /pagamento/config` → `POST /pedidos/:id/pagamento {metodo:"pix"|"cartao", cpf, cartao?}` → (Pix) webhook do PagSeguro, `…/pagamento/verificar` (o front consulta a cada 5 s) ou, só em dev, `…/simular-pix` → `GET /compras` → `GET /compras/:itemId/download`.

**Vender:** `PUT /estudio/perfil` (chave Pix) → `POST /estudio/fotos` (multipart: `titulo`, `precoCentavos`, `descricao`, `tags` separadas por vírgula, `eventoId`, **`arquivo` por último**) → `GET /estudio/vendas` (bruto, taxa e líquido).

**Split:** com o PagSeguro, `POST /pedidos/:id/pagamento` monta `charges[].splits` (`FIXED`, centavos): um recebedor por fotógrafo com o líquido (preço − taxa travados nos itens) e a conta da plataforma (`PAGSEGURO_CONTA_ID`) com a soma das taxas. Pix dividido usa `charges` com `payment_method.type="PIX"`; sem divisão (ex.: o único fotógrafo é a própria plataforma) o Pix segue por `qr_codes`. Fotógrafo sem conta → 409.

**Webhook (simulado):** `POST /pagamentos/webhook` com corpo JSON `{"referencia","status":"aprovado|recusado|cancelado"}` e `X-Lenspro-Assinatura: hex(HMAC_SHA256(WEBHOOK_SECRET, corpoBruto))`.

**Webhook (PagSeguro):** o PagBank envia a notificação com `x-authenticity-token`; o servidor confere SHA-256(`{PAGSEGURO_TOKEN}-{corpo bruto}`) em tempo constante antes de interpretar o corpo, localiza o pagamento por `reference_id` e só libera o pedido se o **valor pago for igual ao cobrado**. Se a notificação não chegar, `…/pagamento/verificar` consulta `GET /orders/{id}` no PagBank.

## 7. Decisões arquiteturais, trade-offs e alternativas rejeitadas

| Decisão | Motivo | Alternativa rejeitada |
|---|---|---|
| Monólito (API + front servido pelo mesmo processo) | simples de rodar e implantar para o porte do sistema; sem CORS em produção | microsserviços/CDN separada: custo operacional sem ganho agora |
| React SPA com rotas *lazy* | navegação fluida (pedido do cliente), carrinho e painéis sem recarregar página | SSR (Next.js): complexidade maior; as páginas públicas não dependem de SEO pesado |
| Preços em centavos inteiros | evita erro de ponto flutuante | `Decimal`: desnecessário sem frações de centavo |
| Marca d'água no servidor, na publicação | o navegador nunca recebe o original; custo pago uma vez | marca por CSS/canvas no cliente: trivial de remover |
| Original cifrado em disco local | simples, testável, sem dependências externas | S3 + SSE-KMS: melhor em produção multi-servidor (mesma interface `Armazenamento`) |
| Gateway atrás de interface: PagSeguro real + simulador (só dev) | fluxo completo sem credenciais em desenvolvimento; provedor trocável | integração acoplada ao provedor. Nota: a integração PagSeguro foi feita pela documentação e testada com `fetch` simulado, **não contra o PagBank real** |
| Chamada ao gateway fora das transações | não segurar `FOR UPDATE` durante a rede; falha externa não trava o banco | chamar dentro da transação: simples, mas bloqueia linhas e arrisca estado inconsistente |
| Um pedido pendente por comprador (o novo substitui o anterior) | evita reservas acumuladas e total ambíguo | vários pedidos abertos: confuso no checkout |
| Fotógrafo/admin não compram | evita auto-compra/inflar vendas; tela de compra só para compradores | permitir com restrição por foto: regra mais complexa |
| Foto vendida é **arquivada** ao excluir; sem vendas é apagada | quem pagou nunca perde o arquivo | apagar sempre: quebraria compras |
| Cookie `HttpOnly` + cabeçalho CSRF | XSS não rouba a sessão; `SameSite=Strict` + cabeçalho próprio barram CSRF | `sessionStorage` (versão anterior): legível por qualquer script injetado |
| URLs de preview assinadas | impede hotlink/raspagem e links eternos sem tornar o preview autenticado (a vitrine continua pública) | exigir login para ver fotos: ruim para a vitrine |
| Moderação oculta, não apaga | preserva direito do comprador e evidências | exclusão física |

## 8. Regras assumidas pelo desenvolvimento

Não houve cliente para confirmar as regras; as escolhas abaixo estão em [REQUISITOS.md](REQUISITOS.md#c-decisões-nossas-vale-confirmar) e podem ser ajustadas por variável de ambiente (taxa 15%, reserva de 30 min, limite de upload 25 MB, preço R$ 1,00–R$ 10.000,00).

## 9. Testes

`cd server && npm test`: 4 suítes — 72 unitárias, 204 de integração (PostgreSQL), 96 do gateway PagSeguro (incluindo o split) (com `fetch` simulado) e 48 de segurança (cookie/CSRF, URLs assinadas, hotlink, guardas de produção). Detalhes no [README](../README.md#testes-automatizados) e em [FAILURE_SCENARIOS.md](FAILURE_SCENARIOS.md).
