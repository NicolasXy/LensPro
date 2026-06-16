# ─────────────────────────────────────────────
# Imagem base: Python 3.12 slim (leve e segura)
# ─────────────────────────────────────────────
FROM python:3.12-slim

# Diretório de trabalho dentro do container
WORKDIR /app

# Instala dependências de sistema necessárias para pacotes Python
# (gcc + libssl-dev são usados para compilar o pacote "cryptography")
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copia apenas o requirements.txt primeiro (melhor cache do Docker)
COPY requirements.txt .

# Instala dependências Python sem cache (menor imagem)
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante dos arquivos do projeto
COPY . .

# Expõe a porta que o Flask usa
EXPOSE 5000

# Comando de inicialização da aplicação
CMD ["python", "app.py"]
