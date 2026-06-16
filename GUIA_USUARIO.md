# 📖 Guia do Usuário — LensPro

Este guia explica como qualquer pessoa pode baixar e executar o sistema LensPro
em seu computador, mesmo sem experiência prévia com programação.

---

## ✅ Pré-requisitos

Antes de começar, você precisa ter instalado:

| Ferramenta | O que é | Download |
|---|---|---|
| **Git** | Baixa o projeto do GitHub | https://git-scm.com/downloads |
| **Docker Desktop** | Roda a aplicação em containers | https://www.docker.com/products/docker-desktop |

> **Dica:** Após instalar o Docker Desktop, abra-o e aguarde o ícone da baleia aparecer na barra de tarefas — isso indica que ele está pronto para uso.

---

## 1️⃣ Como Baixar o Projeto

Abra um terminal (Prompt de Comando, PowerShell ou Terminal do Mac/Linux) e execute:

```bash
git clone https://github.com/SEU_USUARIO/lenspro.git
cd lenspro
```

Isso vai criar uma pasta chamada `lenspro` com todos os arquivos do projeto.

---

## 2️⃣ Como Configurar o Arquivo `.env`

O arquivo `.env` guarda as configurações da aplicação (como a senha do banco de dados).

**Passo 1** — Copie o arquivo de exemplo:

```bash
# Linux / Mac
cp .env.example .env

# Windows (Prompt de Comando)
copy .env.example .env
```

**Passo 2** — Abra o `.env` com qualquer editor de texto (Bloco de Notas, VS Code, etc.) e preencha:

```env
SECRET_KEY=qualquer-texto-longo-e-aleatorio-aqui

MYSQL_ROOT_PASSWORD=minha-senha-123

DATABASE_URL=mysql+pymysql://root:minha-senha-123@localhost/lenspro

MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=seuemail@gmail.com
MAIL_PASSWORD=senha-de-app-do-google
```

> ⚠️ **Atenção:** A senha em `MYSQL_ROOT_PASSWORD` e em `DATABASE_URL` devem ser **iguais**.

---

## 3️⃣ Como Subir os Containers

Com o Docker Desktop aberto e rodando, execute no terminal (dentro da pasta `lenspro`):

```bash
docker compose up -d
```

Aguarde o download das imagens e a inicialização. Você verá mensagens como:

```
✔ Container lenspro_db   Started
✔ Container lenspro_web  Started
```

> **Primeira vez:** pode demorar alguns minutos porque o Docker precisa baixar
> as imagens do Python e do MySQL.

---

## 4️⃣ Como Acessar pelo Navegador

Após os containers iniciarem, abra seu navegador e acesse:

```
http://localhost:5000
```

Você verá a página inicial do **LensPro** ✅

### Páginas disponíveis:

| Página | Endereço |
|---|---|
| Início | http://localhost:5000 |
| Eventos | http://localhost:5000/eventos |
| Fotógrafos | http://localhost:5000/fotografos |
| Galeria | http://localhost:5000/galeria |
| Contato | http://localhost:5000/contato |
| Cadastro | http://localhost:5000/cadastro |
| Login | http://localhost:5000/login |

---

## 5️⃣ Como Parar o Sistema

Para parar os containers sem apagar os dados:

```bash
docker compose down
```

Para parar e **remover todos os dados** do banco (cuidado!):

```bash
docker compose down -v
```

---

## 🔍 Verificar se Está Funcionando

Para ver os containers rodando:

```bash
docker ps
```

Você deve ver algo como:

```
CONTAINER ID   IMAGE           STATUS          NAMES
abc123         lenspro-web     Up 2 minutes    lenspro_web
def456         mysql:8.0       Up 2 minutes    lenspro_db
```

Para ver os logs da aplicação:

```bash
docker compose logs -f web
```

---

## ❓ Problemas Comuns

### "Porta 5000 já está em uso"
Outro programa está usando a porta 5000. Encerre-o ou altere a porta no `docker-compose.yml`:
```yaml
ports:
  - "8080:5000"   # acesse via localhost:8080
```

### "Container web reiniciando"
O banco pode não estar pronto ainda. Aguarde 30 segundos e tente:
```bash
docker compose restart web
```

### "Erro de conexão com o banco"
Verifique se a senha em `MYSQL_ROOT_PASSWORD` é igual à senha em `DATABASE_URL` no seu `.env`.

---

## 📞 Suporte

Em caso de dúvidas, abra uma issue no repositório do GitHub.
