from database import db
from datetime import datetime

class Usuario(db.Model):

    __tablename__ = "usuarios"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    nome = db.Column(
        db.String(100),
        nullable=False
    )

    sobrenome = db.Column(
        db.String(100),
        nullable=False
    )

    email = db.Column(
        db.String(150),
        unique=True,
        nullable=False
    )

    senha = db.Column(
        db.String(255),
        nullable=False
    )

    token_reset = db.Column(
        db.String(255),
        nullable=True
    )

    token_expira = db.Column(
        db.DateTime,
        nullable=True
    )

    criado_em = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )
