# 📷 LensPro — Plataforma de Fotografia

> Plataforma web moderna para fotógrafos de eventos, esportes e ensaios.

---

## 📌 Descrição do Sistema

O **LensPro** é uma aplicação web desenvolvida com **Python + Flask** que permite o cadastro de fotógrafos, exibição de eventos, galeria de fotos e contato com profissionais.

A plataforma oferece autenticação segura (login, cadastro e recuperação de senha por token), perfil do usuário e navegação por páginas públicas otimizadas.

---

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Versão | Uso |
|---|---|---|
| Python | 3.12 | Linguagem principal |
| Flask | latest | Framework web |
| Flask-SQLAlchemy | latest | ORM para banco de dados |
| PyMySQL | latest | Driver MySQL puro Python |
| Werkzeug | latest | Hashing seguro de senhas |
| python-dotenv | latest | Carregamento de variáveis de ambiente |
| Flask-Mail | latest | Envio de e-mails |
| MySQL | 8.0 | Banco de dados relacional |
| Docker | latest | Containerização |
| Docker Compose | latest | Orquestração de containers |

---

## ✅ Funcionalidades Principais

- 🔐 **Cadastro e Login** de usuários com senha criptografada (bcrypt via Werkzeug)
- 🔑 **Recuperação de senha** por token seguro (expira em 1h)
- 👤 **Perfil do usuário** autenticado
- 📸 **Galeria de fotos** (página pública)
- 🎉 **Eventos** disponíveis na plataforma
- 📋 **Lista de fotógrafos** cadastrados
- 📬 **Formulário de contato**
- 🔁 Redirecionamento automático de URLs com `.html`

---

## 🖼️ Prints das Telas

> **Instrução:** Substitua as imagens abaixo pelos prints reais do seu sistema.
> Salve os prints na pasta `docs/prints/`.

| Tela | Preview |
|---|---|
| Página Inicial | ![Home](./docs/prints/home.png) |
| Login | ![Login](./docs/prints/login.png) |
| Cadastro | ![Cadastro](./docs/prints/cadastro.png) |
| Perfil | ![Perfil](./docs/prints/perfil.png) |
| Galeria | ![Galeria](./docs/prints/galeria.png) |
| Eventos | ![Eventos](./docs/prints/eventos.png) |

---

## 📁 Estrutura de Pastas

```
lenspro/
│
├── app.py                  # Rotas e lógica principal da aplicação
├── config.py               # Configurações (lê variáveis do .env)
├── database.py             # Instância do SQLAlchemy
├── models.py               # Modelo da tabela de usuários
├── database.sql            # SQL para criação manual do banco
│
├── requirements.txt        # Dependências Python
├── Dockerfile              # Imagem Docker da aplicação
├── docker-compose.yml      # Sobe app + MySQL juntos
├── .env.example            # Modelo de variáveis de ambiente
├── .env                    # ⚠️ NÃO commitar — dados reais
├── .gitignore              # Arquivos ignorados pelo Git
│
├── README.md               # Documentação principal
├── GUIA_USUARIO.md         # Guia para usuários finais
│
├── static/
│   ├── style.css           # Estilos globais
│   └── app.js              # Scripts do frontend
│
└── templates/
    ├── index.html          # Página inicial
    ├── login.html          # Tela de login
    ├── cadastro.html       # Tela de cadastro
    ├── perfil.html         # Perfil do usuário
    ├── recuperar-senha.html
    ├── redefinir-senha.html
    ├── eventos.html
    ├── fotografos.html
    ├── galeria.html
    └── contato.html
```

---

## 🚀 Como Instalar o Projeto

### Pré-requisitos

- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) + [Docker Compose](https://docs.docker.com/compose/)
- **OU** Python 3.12 + MySQL 8.0 (para rodar sem Docker)

### 1. Clone o repositório

```bash
git clone https://github.com/SEU_USUARIO/lenspro.git
cd lenspro
```

---

## ⚙️ Como Configurar o `.env`

Copie o arquivo de exemplo e preencha com seus dados:

```bash
cp .env.example .env
```

Edite o `.env` com um editor de texto:

```env
# Gere uma chave segura com: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=cole-aqui-uma-chave-gerada

# Senha que você quer usar no banco MySQL
MYSQL_ROOT_PASSWORD=minha-senha-segura

# URL de conexão (localhost para rodar sem Docker)
DATABASE_URL=mysql+pymysql://root:minha-senha-segura@localhost/lenspro

# E-mail (opcional — necessário apenas para recuperação de senha)
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=seuemail@gmail.com
MAIL_PASSWORD=senha-de-app-do-google
```

> ⚠️ **IMPORTANTE:** Nunca suba o `.env` com dados reais para o GitHub.
> O `.gitignore` já está configurado para ignorá-lo.

---

## 🐳 Como Rodar com Docker

### Subir a aplicação completa (app + banco)

```bash
docker compose up -d
```

O Docker vai:
1. Baixar a imagem do MySQL 8.0
2. Criar o banco de dados `lenspro` automaticamente
3. Construir a imagem do Flask
4. Subir os dois containers

### Ver os logs em tempo real

```bash
docker compose logs -f
```

### Parar os containers

```bash
docker compose down
```

### Parar e remover os dados do banco

```bash
docker compose down -v
```

---

## 🌐 Como Acessar o Sistema

| Ambiente | URL |
|---|---|
| Local / Docker | http://localhost:5000 |
| AWS EC2 | http://IP_PUBLICO_DA_INSTANCIA:5000 |

---

## 🐳 Docker Hub

Imagem publicada em:

```
docker pull SEU_USUARIO_DOCKERHUB/lenspro:latest
```

Para rodar diretamente pela imagem publicada:

```bash
docker pull SEU_USUARIO_DOCKERHUB/lenspro:latest
```

---

## ☁️ Como Rodar na AWS EC2

1. Crie uma instância EC2 (Ubuntu 22.04)
2. Libere a porta **5000** no Security Group
3. Conecte via SSH e execute:

```bash
# Instala Docker
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo systemctl start docker
sudo usermod -aG docker ubuntu

# Clona o projeto
git clone https://github.com/SEU_USUARIO/lenspro.git
cd lenspro

# Configura o .env
cp .env.example .env
nano .env   # preencha com suas credenciais

# Sobe os containers
docker compose up -d
```

4. Acesse: `http://IP_PUBLICO_DA_INSTANCIA:5000`

---

## 👨‍💻 Autor

Desenvolvido como projeto da disciplina de **Design Inovador**.
