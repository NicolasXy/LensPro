# Guia do Usuário — LensPro

Passo a passo para rodar o LensPro no seu computador, mesmo sem experiência com programação.

## 1. O que instalar

| Ferramenta | Para quê | Download |
|---|---|---|
| **Node.js 22 (LTS)** | executa o sistema | https://nodejs.org |
| **Docker Desktop** | roda o banco de dados (PostgreSQL) | https://www.docker.com/products/docker-desktop |
| **Git** (opcional) | baixar o projeto | https://git-scm.com/downloads |

Após instalar o Docker Desktop, abra-o e espere o ícone da baleia indicar que está pronto.

## 2. Preparar

Abra o terminal (PowerShell no Windows, Terminal no Linux/Mac) **dentro da pasta `lenspro`** e execute, um de cada vez:

```bash
docker compose up -d
```

Copie o arquivo de configuração:

- Windows: `Copy-Item server\.env.example server\.env`
- Linux/Mac: `cp server/.env.example server/.env`

Abra `server/.env` em um editor de texto. Para testar no seu computador, troque os dois segredos por textos longos e aleatórios (o JWT_SECRET precisa de **32 caracteres ou mais**; o WEBHOOK_SECRET, de 16 ou mais). Para gerar um:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Em seguida, instale e prepare tudo (leva alguns minutos):

```bash
npm run setup
```

## 3. Iniciar

```bash
npm start
```

Abra **http://localhost:3000** no navegador. Para parar, pressione `Ctrl + C` no terminal. Da próxima vez, basta `docker compose up -d` (se o Docker foi fechado) e `npm start`.

## 4. Entrar com os usuários de demonstração

Senha de todos: `Lenspro#2026`

| Quem | E-mail | O que vê |
|---|---|---|
| Administrador | admin@lenspro.com | painel de administração |
| Fotógrafo | carlos@lenspro.com | Estúdio (publicar fotos, vendas) |
| Comprador | cliente@lenspro.com | vitrine, carrinho, minhas fotos |

A tela de login do ambiente de desenvolvimento tem atalhos com essas contas. Você também pode criar sua conta em **Criar conta**, escolhendo "Quero comprar fotos" ou "Sou fotógrafo".

## 5. Conhecendo as telas

- **Cabeçalho:** logo à esquerda, abas (*Início, Eventos, Fotógrafos, Galeria, Contato*; a aba atual fica preta), carrinho com a contagem, **Entrar** (ou, logado, um botão preto com seu nome e a inicial) e **Sair**. No celular, as abas ficam no botão **Menu**.
- **Sem emojis nem ícones:** todos os botões e avisos são texto.
- **Visual:** fundo creme, textos pretos, rosa só nos destaques. Funciona do celular ao computador.
- **Área do fotógrafo e administração:** menu lateral (no celular vira uma barra rolável no topo).

## 6. Como comprar fotos (comprador)

1. Na **página inicial**, use a **busca** (título, evento, tag ou fotógrafo) ou os atalhos *Populares*; veja a foto grande rotativa (setas e bolinhas trocam a foto; o cartão "Em destaque" mostra título, fotógrafo e preço) e os *Trabalhos em destaque*. Clique em qualquer foto para ver os detalhes.
2. Navegue pela **Galeria** (as fotos têm marca d'água e o nome do fotógrafo; é só uma prévia protegida: não dá para salvar nem arrastar a imagem).
3. Clique em uma foto e em **Adicionar ao carrinho**.
4. No **Carrinho**, clique em **Ir para o pagamento**. O preço fica reservado por 30 minutos.
5. Na página de **Pagamento**, escolha:
   - **Pix:** escaneie o **QR Code** com o app do banco ou copie o código "copia e cola". A página confirma sozinha quando o pagamento cair (não precisa recarregar).
   - **Cartão:** preencha os dados; eles são protegidos no seu navegador e não passam pelo LensPro.
   - Com o **PagSeguro** ativo, informe também o **CPF** (exigido pelo banco; não é guardado).
   - Somente no **modo de demonstração** (sem pagamento real): botão **Simular pagamento**; cartão `4242 4242 4242 4242` aprova e `4000 0000 0000 0002` simula recusa (validade futura, CVV qualquer).
6. Depois de pago, vá em **Minha conta → Minhas fotos** e clique em **Baixar original** (sem marca d'água).

## 7. Como vender fotos (fotógrafo)

1. Entre com uma conta de fotógrafo e abra o **Estúdio**.
2. Em **Perfil e repasse**, preencha seus dados e o **ID da sua conta PagBank** (começa com `ACCO_`; você encontra na sua conta PagBank). É por essa conta que você recebe a sua parte de cada venda, na hora da compra. Sem ela, suas fotos não podem ser compradas quando o pagamento real está ativo. A chave Pix fica guardada (cifrada) apenas como reserva.
3. (Opcional) Em **Eventos**, cadastre um evento para agrupar fotos.
4. Em **Publicar fotos**, escolha o arquivo (JPEG, PNG ou WebP, até 25 MB), título, **preço** e tags. O sistema gera a prévia com marca d'água automaticamente e guarda o original protegido.
5. Em **Minhas fotos**, altere preço, oculte ou exclua. Fotos já vendidas não são apagadas: ficam arquivadas para quem comprou.
6. Em **Vendas**, veja cada venda com o valor bruto, a taxa da plataforma e o seu líquido. O líquido é o que o PagBank já pagou na sua conta, separado da taxa da plataforma.

## 8. Administração

Em **Administração**, o administrador cria usuários de qualquer tipo, ativa/desativa contas, redefine senhas, remove fotos impróprias da vitrine (*Moderação de fotos*), consulta a trilha de auditoria e lê as mensagens do "Fale conosco".

## 9. Esqueci minha senha

Em **Entrar → Esqueci minha senha**, informe o e-mail. Se o servidor tiver e-mail (SMTP) configurado, o link chega na caixa de entrada; no ambiente de desenvolvimento sem SMTP, ele aparece no **terminal onde o sistema está rodando** (linha `[EMAIL] …`). Abra o link, defina a nova senha (mínimo 8 caracteres com maiúscula, minúscula e número).

## 10. Ativar o pagamento real (PagSeguro)

1. Crie uma conta no PagSeguro/PagBank e gere o **token** (comece pelo ambiente *sandbox*, de testes).
2. Em `server/.env` preencha: `PAGAMENTO_GATEWAY="pagseguro"`, `PAGSEGURO_TOKEN="…"`, `PAGSEGURO_CONTA_ID` (o ID `ACCO_…` da sua conta PagBank, a dona do token), `PAGSEGURO_AMBIENTE="sandbox"` e `PAGSEGURO_NOTIFICACAO_URL` com o endereço **público** (https) do seu site terminando em `/api/v1/pagamentos/webhook/pagseguro`. No seu computador, use um serviço de túnel (como o ngrok) para ter esse endereço.
3. Reinicie o sistema (`Ctrl + C` e `npm start`).
4. Faça uma compra de teste. Se a notificação do banco não chegar, a página também confere sozinha a cada poucos segundos.

> Os fotógrafos também precisam informar a conta PagBank deles no Estúdio (a venda é dividida na hora, e o PagBank pode exigir que sua conta seja habilitada para divisão de pagamentos).

> Importante: esta integração, incluindo a divisão da venda, ainda **não foi testada com o PagSeguro de verdade** (só com um simulador). Teste no *sandbox* antes de vender de verdade. Para publicar na internet, veja `README.md` (em produção o sistema exige e-mail SMTP, HTTPS e segredos próprios).

## 11. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `DATABASE_URL nao definida` / `JWT_SECRET deve ser definido…` | confira se criou `server/.env` e preencheu os segredos |
| Não conecta no banco | abra o Docker Desktop e rode `docker compose up -d` |
| Porta 3000 ocupada | altere `PORT` em `server/.env` |
| Conta bloqueada por tentativas | aguarde 15 minutos (ou o administrador redefine a senha) |
| Fui deslogado depois de trocar a senha | é proposital: trocar a senha encerra as outras sessões; entre de novo |
| A foto aparece com erro "Recarregue a página" | o link da imagem expira após algumas horas; recarregue a página |
| O Pix não confirmou | aguarde alguns segundos; se pagou, a página confere sozinha; senão, entre em contato com o suporte |
| Perdi a chave `server/data/master.key` | as fotos originais cifradas **não** podem ser recuperadas; faça backup da pasta `server/data` |
| Quero recomeçar do zero | `docker compose down -v` e `npm run setup` (apaga banco e fotos) |
