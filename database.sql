CREATE DATABASE lenspro
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE lenspro;

CREATE TABLE usuarios (

    id INT AUTO_INCREMENT PRIMARY KEY,

    nome VARCHAR(100) NOT NULL,

    sobrenome VARCHAR(100) NOT NULL,

    email VARCHAR(150) NOT NULL UNIQUE,

    senha VARCHAR(255) NOT NULL,

    token_reset VARCHAR(255),

    token_expira DATETIME,

    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);