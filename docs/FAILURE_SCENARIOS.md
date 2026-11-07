# Cenários de Falha Testados — LensPro

Cenários de falha e uso indevido cobertos por `server/tests/run-unit.js` (**U**, sem banco), `run-api.js` (**A**, API + PostgreSQL), `run-pagseguro.js` (**P**, gateway com `fetch` simulado) e `run-seguranca.js` (**S**, sessão, URLs assinadas, produção). Cada linha diz o que foi provocado e como o sistema responde. Rode com `cd server && npm test`.

**Regra geral:** validações ocorrem **antes** de qualquer escrita; uma operação rejeitada não deixa rastro parcial (nem linha no banco, nem arquivo em disco — A §9).

## 1. Falhas de validação de dados

| Cenário | Como foi provocado | Resposta |
|---|---|---|
| Senha fraca/curta/sem maiúscula, minúscula ou número; > 72 bytes | `POST /auth/cadastro` (U §5, A §1) | 400 |
| E-mail inválido | `email: "invalido"` | 400 |
| Tipo de conta `admin` no cadastro público | `tipo: "admin"` | 400 |
| Campo extra `papel: "admin"` no cadastro | corpo com `papel` | conta criada como **comprador** (campo ignorado) |
| Upload sem arquivo | multipart sem `arquivo` | 400 |
| Texto com extensão `.jpg`; script `.php` com `Content-Type: image/jpeg` | upload forjado | 400 (a imagem é decodificada de verdade) |
| GIF / imagem < 600 px / buffer vazio | U §4, A §9 | 400 |
| Preço < R$ 1,00, > R$ 10.000,00 ou não numérico | `precoCentavos` 50 / 9999999 / "abc" | 400 |
| Título com menos de 3 caracteres | `titulo: "ab"` | 400 |
| Foto em evento de **outro** fotógrafo | `eventoId` alheio | 400 |
| Arquivo acima do limite (`UPLOAD_MAX_MB`) | corpo > limite | 413 e nada gravado |
| Evento com data inexistente | `2026-02-31` | 400 |
| Estado com 3 letras | `estado: "ABC"` | 400 |
| Cartão com Luhn inválido, vencido, sem dados, CVV curto | `POST /pedidos/:id/pagamento` | 400 |
| JSON malformado; UUID inválido; `tamanhoPagina=1000` | requisições manuais | 400 padronizado, sem *stack* |

## 2. Autenticação e autorização

| Cenário | Resposta |
|---|---|
| Rota privada sem token (varredura de 12 rotas) | 401 em todas |
| Token adulterado / assinado com outro segredo / `alg=none` | 401 |
| Comprador em `/estudio` ou `/admin`; fotógrafo em `/admin`, `/compras` ou criando pedido | 403 |
| Comprador tentando publicar foto | 403 |
| Rota inexistente sem token / com token | 401 / 404 padronizado |
| Senha errada vs. e-mail inexistente | **mesma** resposta (sem enumeração) |
| 5 falhas seguidas de login | conta bloqueada (429) mesmo com a senha certa; libera após o prazo; login válido zera o contador |
| Conta **desativada** com token ainda válido | 401 imediato; reativar restaura |
| Administrador desativando a si mesmo | recusado |
| Edição com `versao` desatualizada (conta, perfil, foto) | 409 |
| Recuperação: e-mail inexistente | resposta idêntica; nenhum e-mail enviado |
| Token de recuperação inválido, expirado, reutilizado, com senha fraca | 4xx; token é de **uso único** |

## 3. Integridade, criptografia e persistência

| Cenário | Resposta |
|---|---|
| Original adulterado em disco (um bit) | download **não** é entregue: 500 genérico, sem detalhes internos (U §3, A §13) |
| Texto cifrado/auth tag adulterado, chave errada, arquivo truncado, chave de tamanho errado | falha de decifragem (U §1) |
| `master.key` corrompida | inicialização recusada (U §2) |
| `id` com `../../etc/passwd` ou que não é UUID | recusado antes de tocar o disco (U §3) |
| Banco recusa a gravação após salvar os arquivos | arquivos removidos (sem órfãos) |
| `UPDATE`/`DELETE` em `Auditoria` | bloqueado pelo trigger do banco (A §16) |
| Preço < 100 centavos, total negativo, e-mail duplicado direto no banco | rejeitado por `CHECK`/`UNIQUE` (A §17) |
| Apagar usuário que tem pedidos | bloqueado (`RESTRICT`) |
| Senhas no banco | todas bcrypt (`$2…`) |

## 4. Pedidos, pagamento e webhook

| Cenário | Resposta |
|---|---|
| Pedido vazio, foto inexistente/oculta, id malformado | 400 |
| Itens repetidos no pedido | contados uma vez |
| Preço do fotógrafo muda após o pedido | pedido mantém o preço travado |
| Segundo pedido do mesmo comprador | substitui o pendente anterior (que vira `cancelado`) |
| Outro comprador vê/cancela/paga meu pedido | 404 |
| Cancelar pedido já cancelado ou pago; pagar cancelado/expirado/pago | 409 |
| Pedido vencido | varredura o marca `expirado`; pagar → 409 |
| Cartão recusado (`…0002`) | pedido continua pendente, com o motivo; nova tentativa permitida |
| Cartão aprovado | pedido `pago`; só bandeira + 4 dígitos no banco; nunca cobra duas vezes |
| Webhook sem assinatura / assinatura errada / corpo alterado | 401; pedido continua pendente |
| Webhook válido | aplicado; pedido `pago` |
| Webhook **repetido** | ignorado (idempotente) |
| Webhook para Pix de pedido cancelado | ignorado; pedido segue cancelado |
| Webhook com referência desconhecida / JSON inválido / status desconhecido | 404 / 400 / 400 |
| Download antes do pagamento, de outro comprador, pelo fotógrafo dono, sem login, item inexistente | 404 / 404 / 403 / 401 / 404 |

### 4.1. PagSeguro (suíte P, com o PagBank simulado)

| Cenário | Resposta |
|---|---|
| CPF inválido; cartão enviado em texto puro (sem `criptografado`) | 400, nada é enviado ao provedor |
| Webhook sem `x-authenticity-token`, com token errado ou corpo alterado | 401; pedido continua pendente |
| Webhook "pago" com **valor diferente** do cobrado | pedido não é liberado; divergência auditada |
| Webhook repetido; referência desconhecida; estado intermediário (WAITING) | ignorado (200, idempotente) |
| Estorno/cancelamento **depois** de pago | não desfaz a compra (fora do escopo; não quebra) |
| Webhook perdido | `POST /pedidos/:id/pagamento/verificar` consulta o gateway e conclui o pedido |
| PagBank fora do ar / resposta inválida | 502; pedido segue pendente e o comprador pode tentar de novo |
| Cartão recusado pelo emissor | pedido pendente, com o motivo; nova tentativa permitida |
| Cartão cifrado e CPF | não ficam no banco nem na auditoria |

## 5. Fotos, estúdio e moderação

| Cenário | Resposta |
|---|---|
| Foto oculta | some da vitrine e do detalhe público; republicar a traz de volta |
| Outro fotógrafo edita/exclui minha foto ou evento | 404 |
| Excluir foto **já vendida** | arquivada: continua no banco e em disco; some da vitrine; o comprador mantém o download |
| Excluir foto sem vendas | removida do banco **e** do disco |
| Excluir evento | fotos permanecem |
| Admin remove foto | some da vitrine e do preview; fotógrafo não consegue republicar; quem já pagou ainda baixa; restaurar volta como oculta |
| Busca com `'; DROP TABLE "Foto";--` | tratada como texto; tabela intacta |
| Contato com campo-isca preenchido (robô) | 202, mas descartado |

### 4.2. Split / repasse (suíte P, §9–§11)

| Cenário | Resposta |
|---|---|
| Fotógrafo sem conta PagBank vinculada | 409 com o nome do fotógrafo; nenhuma chamada ao PagBank, nenhum pagamento criado, pedido segue pendente |
| `pagbankContaId` fora do formato `ACCO_…` | 400 |
| Pedido com 2 fotógrafos | um recebedor por fotógrafo (líquido) + plataforma (soma das taxas); soma = total |
| Vários itens do mesmo fotógrafo | viram um único recebedor |
| Fotógrafo é a própria conta da plataforma | sem split (nada a dividir) |
| Taxa 0% com PagSeguro; repasse > total; valor ≤ 0 | recusado antes de chamar o PagBank |
| Pix dividido cuja resposta não traz o "copia e cola" | 502, nada cobrado, nova tentativa liberada |
| `PAGSEGURO_CONTA_ID` ausente/inválido | servidor não inicia |

### 5.1. Proteção das imagens e sessão (suíte S)

| Cenário | Resposta |
|---|---|
| Preview/miniatura sem assinatura, com assinatura adulterada ou expirada | 403 |
| Imagem incorporada em outro site (`cross-site`) ou aberta direto numa aba (`Sec-Fetch-Dest: document`) | 403 |
| Escrita por cookie **sem** `X-Lenspro-Csrf` | 403 |
| Sessão após trocar a senha | 401 (`sv` não confere) |
| Renovação depois de 12 h de sessão | recusada; novo login |
| `/auth/sair` | cookie apagado (`Max-Age=0`) |
| Cookie adulterado | 401 |
| E-mail digitado por engano com a senha no login | não vai para a auditoria |
| Produção com segredo "troque…", sem SMTP, sem HTTPS ou com gateway simulado | servidor **recusa iniciar** |
| `/docs` em produção | desligado (cai no front, nunca no Swagger) |
| Resposta da API | `Cache-Control: no-store` |

## 6. Rastreabilidade sob falha

A auditoria registra tentativas de login (sucesso/falha/bloqueio), publicação, pedidos, pagamentos (gerado/aprovado/recusado), webhooks ignorados, downloads e ações do administrador, **sem** senhas, tokens, números de cartão ou JWT (A §16).

## 7. Limitações conhecidas (escopo, não "falhas")

- **PagSeguro não verificado contra o PagBank real** (sem credenciais/rede aqui): os testes usam um `fetch` simulado que segue a documentação. Rode uma compra em *sandbox* antes de produção.
- **Split não verificado no PagBank real** (ver README: Pix dividido e habilitação da conta). Sem reembolso/estorno (não reverte o split), sem 2FA, sem rotação da chave mestra.
- O SMTP foi testado com transporte simulado; configure `SMTP_URL` e teste o envio real.
- Não há teste automatizado do front; foi verificado em navegador (home, galeria, login, estúdio, admin e compra por Pix, em desktop e celular). Cartão com o SDK do PagBank não foi exercitado no navegador.
- Um teste de integração falhou uma única vez numa execução e passou nas seguintes (causa não identificada; suspeita de temporização).
