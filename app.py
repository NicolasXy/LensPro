from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    flash,
    session
)

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from dotenv import load_dotenv
load_dotenv()

from database import db
from models import Usuario
from config import Config

import secrets
from datetime import datetime, timedelta

app = Flask(__name__)

app.config.from_object(Config)

db.init_app(app)

with app.app_context():
    db.create_all()


# =========================
# CORREÇÃO GLOBAL DE URLS (.html)
# =========================
@app.before_request
def limpar_extensao_html():
    path = request.path
    if path.endswith(".html"):
        if path == "/index.html":
            return redirect(url_for("index"))
        clean = path[:-5]
        qs = request.query_string.decode()
        return redirect(clean + ("?" + qs if qs else ""))


# =========================
# PÁGINAS PÚBLICAS
# =========================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/eventos")
def eventos():
    return render_template("eventos.html")


@app.route("/fotografos")
def fotografos():
    return render_template("fotografos.html")


@app.route("/galeria")
def galeria():
    return render_template("galeria.html")


@app.route("/contato", methods=["GET", "POST"])
def contato():

    if request.method == "POST":

        # Campos validados pelo HTML (required), mas checamos aqui também
        nome_contato = request.form.get("nome", "").strip()
        email_contato = request.form.get("email", "").strip()
        mensagem = request.form.get("mensagem", "").strip()

        if not nome_contato or not email_contato or not mensagem:
            flash("Por favor, preencha todos os campos.")
            return redirect(url_for("contato"))

        # Aqui você integraria o envio real de e-mail com Flask-Mail
        # Por ora, apenas confirmamos o recebimento
        flash("Mensagem enviada com sucesso! Entraremos em contato em breve.")
        return redirect(url_for("contato"))

    return render_template("contato.html")


# =========================
# CADASTRO
# =========================

@app.route("/cadastro", methods=["GET", "POST"])
def cadastro():

    if request.method == "POST":

        nome = request.form["nome"]
        sobrenome = request.form["sobrenome"]
        email = request.form["email"]
        senha = request.form["senha"]

        existe = Usuario.query.filter_by(
            email=email
        ).first()

        if existe:
            flash("Email já cadastrado.")
            return redirect(url_for("cadastro"))

        usuario = Usuario(
            nome=nome,
            sobrenome=sobrenome,
            email=email,
            senha=generate_password_hash(senha)
        )

        db.session.add(usuario)
        db.session.commit()

        flash("Conta criada com sucesso!")
        return redirect(url_for("login"))

    return render_template("cadastro.html")


# =========================
# LOGIN
# =========================

@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        email = request.form["email"]
        senha = request.form["senha"]

        usuario = Usuario.query.filter_by(
            email=email
        ).first()

        if not usuario:
            flash("Usuário não encontrado.")
            return redirect(url_for("login"))

        if not check_password_hash(usuario.senha, senha):
            flash("Senha incorreta.")
            return redirect(url_for("login"))

        session["usuario_id"] = usuario.id
        session["nome"] = usuario.nome
        session["sobrenome"] = usuario.sobrenome

        return redirect(url_for("perfil"))

    return render_template("login.html")


# =========================
# LOGOUT
# =========================

@app.route("/logout")
def logout():

    session.clear()
    return redirect(url_for("index"))


# =========================
# PERFIL
# =========================

@app.route("/perfil")
def perfil():

    if "usuario_id" not in session:
        return redirect(url_for("login"))

    return render_template(
        "perfil.html",
        nome=session["nome"],
        sobrenome=session.get("sobrenome", "")
    )


# =========================
# RECUPERAR SENHA
# =========================

@app.route(
    "/recuperar-senha",
    methods=["GET", "POST"]
)
def recuperar_senha():

    if request.method == "POST":

        email = request.form["email"]

        usuario = Usuario.query.filter_by(
            email=email
        ).first()

        if usuario:

            token = secrets.token_urlsafe(32)

            usuario.token_reset = token
            usuario.token_expira = (
                datetime.utcnow() + timedelta(hours=1)
            )

            db.session.commit()

            # Em produção, envie por e-mail via Flask-Mail
            print(
                f"[RESET] http://localhost:5000/redefinir-senha/{token}"
            )

        flash("Se existir uma conta, enviamos instruções.")
        return redirect(url_for("login"))

    return render_template("recuperar-senha.html")


# =========================
# REDEFINIR SENHA
# =========================

@app.route(
    "/redefinir-senha/<token>",
    methods=["GET", "POST"]
)
def redefinir_senha(token):

    usuario = Usuario.query.filter_by(
        token_reset=token
    ).first()

    if not usuario:
        flash("Token inválido.")
        return redirect(url_for("login"))

    if usuario.token_expira < datetime.utcnow():
        flash("Token expirado. Solicite um novo.")
        return redirect(url_for("recuperar_senha"))

    if request.method == "POST":

        nova_senha = request.form["senha"]

        usuario.senha = generate_password_hash(nova_senha)
        usuario.token_reset = None
        usuario.token_expira = None

        db.session.commit()

        flash("Senha alterada com sucesso!")
        return redirect(url_for("login"))

    # Passa o token para o template poder montar o action do form
    return render_template("redefinir-senha.html", token=token)


# =========================
# EXECUÇÃO
# =========================

if __name__ == "__main__":
    app.run(
        debug=True,
        host="0.0.0.0",
        port=5000
    )
