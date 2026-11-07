# Arquitetura de Segurança — LensPro

Este documento descreve as proteções do sistema, o **porquê** de cada escolha e suas limitações. Os mecanismos de criptografia e controle de acesso seguem o padrão adotado no projeto `greencode` e foram adaptados a um marketplace de fotografias. Cada item cita o teste que o comprova (`server/tests/run-unit.js` = **U**, `run-api.js` = **A**, `run-pagseguro.js` = **P**, `run-seguranca.js` = **S**).

## 1. Criptografia de dados em repouso — AES-256-GCM

**O que é cifrado**

| Dado | Onde | Formato |
|---|---|---|
| Foto **original** | `data/originais/<uuid>.enc` | `"LPE1" \| IV (12 B) \| auth tag (16 B) \| texto cifrado` |
| **Chave Pix** do fotógrafo | `PerfilFotografo.pixChaveCifrada` | `v1.<iv>.<tag>.<dados>` (texto); o banco guarda também só a máscara `••••1234` |

**Por quê GCM:** além de sigilo, entrega **autenticidade** — qualquer alteração do arquivo (um bit) invalida a *auth tag* e a leitura falha (U §1, A §13). O IV de 96 bits é novo e aleatório a cada cifragem (duas cifragens do mesmo dado diferem).

**Camada extra de integridade:** o SHA-256 do original é gravado no banco na publicação e conferido a cada download (`CompraService.baixar`).

### 1.1. Chave mestra

- Origem: variável `ENCRYPTION_KEY` (64 hex = 32 bytes) **ou**, se vazia, `data/master.key` gerada na primeira execução com permissão `0600`. Arquivo corrompido/de tamanho errado é recusado (U §2).
- Uma única chave mestra cifra os originais e a chave Pix. **Limitação conhecida:** com a chave no mesmo disco, quem obtém o servidor inteiro obtém tudo. Mitigação: em produção injetar `ENCRYPTION_KEY` de um cofre de segredos (nunca no repositório) e guardar backup **separado** dos dados. Perder a chave = perder os originais.
- Rotação de chave não está implementada (exigiria recifrar os arquivos); o prefixo de versão `LPE1`/`v1` já permite introduzir um novo formato sem quebrar os antigos.

### 1.2. Escrita atômica

Arquivos são gravados em `.tmp` e renomeados, com permissão `0600`, então uma falha no meio não deixa original truncado (U §3). Se o banco recusar a gravação após o envio, os arquivos órfãos são removidos (A §9: "nenhuma foto inválida deixou rastro").

### 1.3. Path traversal

Os nomes dos arquivos são sempre o UUID da foto; um id que não seja UUID é recusado antes de tocar o disco (U §3).

## 2. Senhas — bcrypt

- Hash **bcrypt** (custo 12; 4 apenas nos testes), com salt embutido. Limite de 72 bytes do bcrypt validado explicitamente (senha maior é recusada, sem truncamento silencioso).
- **Política:** mínimo de 8 caracteres, com maiúscula, minúscula e número (U §5, A §1).
- **Login sem enumeração de usuários:** e-mail inexistente e senha errada devolvem a **mesma** mensagem e executam um bcrypt contra um hash *decoy*, para que o tempo de resposta também não revele a existência da conta (A §1).
- **Bloqueio por tentativas:** 5 falhas seguidas bloqueiam a conta por 15 min (`LOGIN_MAX_FALHAS`, `LOGIN_BLOQUEIO_MIN`), mesmo com a senha certa; expira com o tempo e login válido zera o contador (A §2). Somado ao *rate limit* por IP nas rotas de autenticação.
- Nenhuma resposta da API contém o hash (A §1, §5).

### 2.1. Recuperação de senha

Token aleatório de 256 bits enviado por e-mail; no banco fica **apenas o SHA-256** do token (um vazamento do banco não permite redefinir senhas). Validade de 1 h, **uso único**, e a resposta de "esqueci minha senha" é idêntica para e-mails existentes e inexistentes (A §3).

## 3. Sessão: cookie HttpOnly, CSRF e invalidação

- **Cookie `lp_sessao`:** `HttpOnly` (o JavaScript da página nunca lê o token, então um XSS não o rouba), `SameSite=Strict`, `Path=/api` e `Secure` em produção. O front não guarda token em `sessionStorage`. O `Authorization: Bearer` continua aceito para clientes de API (S).
- **CSRF:** requisições que alteram dados e chegam **por cookie** exigem o cabeçalho `X-Lenspro-Csrf: 1`; um formulário de outro site não consegue enviá-lo (S). Com Bearer, não há CSRF por definição.
- JWT HS256 (`@fastify/jwt`) de 30 min; `alg=none` e assinatura de outro segredo são recusados (A §1).
- **Revogação imediata:** o usuário é relido do banco a **cada** requisição; conta desativada perde o acesso na hora (A §5).
- **Troca de senha invalida sessões:** o token leva `sv`, uma impressão digital do hash da senha; trocar ou redefinir a senha derruba todas as sessões antigas (S, A §3).
- **Renovação deslizante com teto:** `POST /auth/renovar` enquanto há atividade, mas a sessão **nunca passa de 12 h** desde o login (`sessaoMaximaSegundos`). `POST /auth/sair` apaga o cookie.

## 4. Controle de acesso (RBAC)

Três papéis (`comprador`, `fotografo`, `admin`). A autorização é imposta **no servidor**, em *hooks* `onRequest` por rota (`permitir(...)`), antes de qualquer validação do corpo:

- Rota privada sem token → **401**; papel errado → **403**; recurso de outro usuário → **404** (não revela existência).
- O cadastro público só aceita `comprador` ou `fotografo`; campos extras como `papel: "admin"` são ignorados (A §1). Administradores só são criados por outro administrador (A §5).
- Fotógrafos **não compram** e compradores não publicam (A §4).
- Uma varredura automática confirma que todas as rotas privadas respondem 401 sem token e que as da vitrine são públicas (A §4). Rotas inexistentes também exigem token antes de responder 404, para não revelar o mapa da API.

## 5. Proteção contra roubo das fotos

| Camada | Medida |
|---|---|
| Publicação | decodificação real da imagem; JPEG/PNG/WebP; mínimo 600 px; limite `UPLOAD_MAX_MB` → 413 |
| Marca d'água v2 | no servidor, **nos pixels**: duas camadas de mosaico cruzadas + logotipo central + faixa de crédito com o nome do fotógrafo; preview 1200 px q68, miniatura 480 px derivada do preview marcado; EXIF removido (U §4) |
| URLs assinadas | `?e=<expira>&s=<HMAC>` (HMAC-SHA256 com chave derivada, comparação em tempo constante); sem assinatura/expirada → 403; validade ≈ 4–5 h (S) |
| Anti-hotlink | rejeita `Sec-Fetch-Dest`/`Sec-Fetch-Site` de outro site ou de *fetch* programático (S); *rate limit* por IP nas rotas de imagem |
| Navegador | componente `Imagem` com escudo transparente (sem menu de contexto, arrastar ou toque longo), `user-select: none`, imagem oculta na impressão |
| Original | cifrado em disco; nenhuma rota pública o entrega (A §8); só o dono de um pedido **pago** baixa |
| Entrega | `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `nosniff`; cada download é auditado |
| Moderação | admin remove foto da vitrine; quem já pagou mantém o acesso |

`npm run previews:regenerar` reaplica a marca atual a fotos já publicadas (decifra o original, gera o novo preview, regrava).

**Limite honesto:** nada impede *print de tela*. As camadas acima encarecem a cópia em massa, a incorporação em outros sites e o download direto; o que resta ao copiador é uma imagem pequena, com crédito do autor impresso, e o arquivo útil só existe após o pagamento.

## 6. Pagamento

- **Preço travado:** o pedido grava o preço de cada item na criação; o servidor recalcula, o carrinho do navegador não é confiável (A §11).
- **PagSeguro (cartão):** o número é cifrado **no navegador** pelo SDK do PagBank; o LensPro recebe e repassa apenas o texto cifrado e grava bandeira + 4 últimos dígitos. O **CPF** exigido pelo PagBank é repassado e nunca gravado. Os logs ocultam `cartao`, `cpf`, senhas, `token`, `Authorization` e `Cookie` (configuração `redact`, sem teste automatizado próprio).
- **Webhook PagSeguro:** `x-authenticity-token` = SHA-256 de `"{token}-{corpo bruto}"`, comparado em tempo constante **antes** de interpretar o corpo; inválido → 401 e nada muda (P). O webhook do modo simulado usa `X-Lenspro-Assinatura` (HMAC-SHA256 com `WEBHOOK_SECRET`) (A §14).
- **Valor conferido:** tanto o webhook quanto a reconciliação (`POST /pedidos/:id/pagamento/verificar`, que consulta `GET /orders/{id}` no PagBank) exigem que o **valor pago seja igual ao cobrado**; senão o pedido não é liberado e a divergência é auditada (P). O CPF e o texto cifrado do cartão não ficam no banco (P).
- **Idempotência:** `x-idempotency-key` nas chamadas; o mesmo webhook reenviado é ignorado; Pix de pedido cancelado/expirado não reabre o pedido; pagamento aprovado é único por pedido (A §12, §14, P).
- **Chamadas externas fora de transação:** o PagBank é chamado entre duas transações curtas (reserva → chamada → confirmação), sem segurar `FOR UPDATE` durante a rede. Falha do provedor → 502 e a tentativa fica cancelada, liberando nova tentativa (A §12).
- **Split (repasse):** a divisão é calculada **no servidor** a partir do preço e da taxa **travados no item** (nunca de valores do navegador); cada fotógrafo recebe o líquido, a plataforma o restante, e a soma precisa fechar com o total (senão a cobrança é abortada antes de chamar o PagBank). Fotógrafo sem conta vinculada → 409, nada é cobrado. O `account.id` (`ACCO_…`) só é devolvido ao dono do perfil, não aparece em perfil público, resposta de pedido nem auditoria (P).
- **Concorrência:** `SELECT … FOR UPDATE` e transições condicionais; comprador bloqueado ao criar pedido para impedir dois simultâneos.
- **Gateway simulado:** só em desenvolvimento. Com `NODE_ENV=production` o servidor **recusa iniciar** com ele (S).

## 7. Auditoria imutável

Tabela `Auditoria` com trigger no PostgreSQL que **bloqueia UPDATE e DELETE** (o próprio banco impede a adulteração, não só a aplicação; A §16). Registra login/cadastro, publicação, pedidos, pagamentos (gerado/aprovado/recusado), downloads, moderação e ações administrativas — sem senhas, tokens ou dados de cartão (A §16). A exclusão de um usuário define `usuarioId = NULL` (a trilha permanece).

## 8. Segurança da API HTTP

- **Helmet/CSP restritiva:** `default-src 'self'`; o único script de terceiro é o SDK do PagBank (`assets.pagseguro.com.br`), liberado só com o gateway real; `frame-ancestors 'none'`, `object-src 'none'`; HSTS e `upgrade-insecure-requests` somente em produção (A §18).
- **JSON Schema em todas as rotas** → 400 padronizado; JSON malformado e UUID inválido também → 400; paginação limitada a 100.
- **Erros:** resposta `{ erro, mensagem }`; erros internos viram 500 genérico, sem *stack* nem SQL (A §13, §18).
- **Rate limit** por IP em cadastro, login, recuperação, redefinição, contato e pagamento; `multipart` com limites de arquivo, campos e tamanho.
- **SQL injection:** acesso via Prisma (consultas parametrizadas); teste com `'; DROP TABLE` na busca (A §8).
- **Formulário de contato:** campo-isca (*honeypot*) anti-robô descartado silenciosamente (A §16).
- **CORS** fechado por padrão (`CORS_ORIGIN`).
- **Respostas da API** com `Cache-Control: no-store` (nenhum dado de cliente em cache de navegador/proxy); `Permissions-Policy` restritiva; arquivos estáticos com ponto (`.env`, `.git`) negados (sem teste dedicado nas suítes novas).
- **Produção (config):** recusa iniciar com segredos "troque…", sem `SMTP_URL`, com `URL_PUBLICA` sem HTTPS ou com gateway simulado; redireciona HTTP→HTTPS; `/docs` (Swagger) desligado, salvo `EXPOR_DOCS=true` (S).
- **Vazamento de dados:** a auditoria sanitiza o e-mail de tentativas de login (sem senha/token); a API nunca devolve hash, chave Pix completa ou caminho de arquivo; o perfil público não expõe e-mail nem Pix (A §6).
- **Banco como última barreira:** `CHECK`s (preço entre R$ 1,00 e R$ 10.000,00, totais positivos, e-mail em minúsculas, estado `^[A-Z]{2}$`…), `UNIQUE`s e `RESTRICT` (não se apaga usuário com pedidos) — A §17.

## 9. Resumo das escolhas e limitações

| Tema | Escolha | Limitação / alternativa |
|---|---|---|
| Cifra | AES-256-GCM, IV aleatório | sem rotação de chave |
| Chave mestra | env ou arquivo 0600 | mesmo servidor dos dados; usar cofre em produção |
| Senhas | bcrypt 12 + política + bloqueio | sem 2FA |
| Sessão | cookie HttpOnly + SameSite=Strict + CSRF; JWT 30 min, teto 12 h, `sv` | 1 consulta extra por requisição |
| Fotos | marca d'água v2 nos pixels, URLs assinadas, anti-hotlink, escudo no front | não impede *print* |
| Pagamento | PagSeguro (cartão cifrado no navegador), webhook autenticado, valor conferido, idempotência | **não verificado contra o PagBank real**; sem estorno |
| E-mail | SMTP (`nodemailer`), obrigatório em produção | — |
