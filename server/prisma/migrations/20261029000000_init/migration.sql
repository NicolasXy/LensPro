-- spiderman
-- Migracao inicial do LensPro: tipos, tabelas, indices, chaves estrangeiras e
-- restricoes de integridade (CHECK) e imutabilidade (trigger) da auditoria.

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('admin', 'fotografo', 'comprador');
CREATE TYPE "StatusFoto" AS ENUM ('publicada', 'oculta', 'removida');
CREATE TYPE "StatusPedido" AS ENUM ('pendente', 'pago', 'cancelado', 'expirado');
CREATE TYPE "MetodoPagamento" AS ENUM ('pix', 'cartao');
CREATE TYPE "StatusPagamento" AS ENUM ('pendente', 'aprovado', 'recusado', 'cancelado');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(100) NOT NULL,
    "sobrenome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senhaHash" VARCHAR(100) NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "resetTokenHash" VARCHAR(64),
    "resetExpiraEm" TIMESTAMPTZ(3),
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PerfilFotografo" (
    "usuarioId" UUID NOT NULL,
    "nomeArtistico" VARCHAR(100) NOT NULL,
    "bio" VARCHAR(1000),
    "cidade" VARCHAR(80),
    "estado" VARCHAR(2),
    "especialidade" VARCHAR(80),
    "pixChaveCifrada" TEXT,
    "pixMascara" VARCHAR(40),
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfilFotografo_pkey" PRIMARY KEY ("usuarioId")
);

CREATE TABLE "Evento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fotografoId" UUID NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "descricao" VARCHAR(1000),
    "local" VARCHAR(150),
    "dataEvento" DATE NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Foto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fotografoId" UUID NOT NULL,
    "eventoId" UUID,
    "titulo" VARCHAR(150) NOT NULL,
    "descricao" VARCHAR(1000),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "precoCentavos" INTEGER NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "bytesOriginal" INTEGER NOT NULL,
    "formato" VARCHAR(10) NOT NULL,
    "sha256Original" VARCHAR(64) NOT NULL,
    "status" "StatusFoto" NOT NULL DEFAULT 'publicada',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pedido" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compradorId" UUID NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'pendente',
    "totalCentavos" INTEGER NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "pagoEm" TIMESTAMPTZ(3),
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemPedido" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedidoId" UUID NOT NULL,
    "fotoId" UUID NOT NULL,
    "fotografoId" UUID NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "taxaPlataformaCentavos" INTEGER NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedidoId" UUID NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'pendente',
    "valorCentavos" INTEGER NOT NULL,
    "referenciaGateway" VARCHAR(64) NOT NULL,
    "pixCopiaECola" TEXT,
    "cartaoBandeira" VARCHAR(20),
    "cartaoFinal" VARCHAR(4),
    "motivoRecusa" VARCHAR(200),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEm" TIMESTAMPTZ(3),
    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Auditoria" (
    "id" BIGSERIAL NOT NULL,
    "usuarioId" UUID,
    "acao" VARCHAR(60) NOT NULL,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MensagemContato" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "mensagem" VARCHAR(3000) NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MensagemContato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX "Usuario_resetTokenHash_key" ON "Usuario"("resetTokenHash");
CREATE INDEX "Usuario_papel_idx" ON "Usuario"("papel");
CREATE INDEX "Evento_fotografoId_idx" ON "Evento"("fotografoId");
CREATE INDEX "Evento_dataEvento_idx" ON "Evento"("dataEvento");
CREATE INDEX "Foto_fotografoId_idx" ON "Foto"("fotografoId");
CREATE INDEX "Foto_eventoId_idx" ON "Foto"("eventoId");
CREATE INDEX "Foto_status_criadoEm_idx" ON "Foto"("status", "criadoEm");
CREATE INDEX "Pedido_compradorId_criadoEm_idx" ON "Pedido"("compradorId", "criadoEm");
CREATE INDEX "Pedido_status_expiraEm_idx" ON "Pedido"("status", "expiraEm");
CREATE UNIQUE INDEX "ItemPedido_pedidoId_fotoId_key" ON "ItemPedido"("pedidoId", "fotoId");
CREATE INDEX "ItemPedido_fotoId_idx" ON "ItemPedido"("fotoId");
CREATE INDEX "ItemPedido_fotografoId_idx" ON "ItemPedido"("fotografoId");
CREATE UNIQUE INDEX "Pagamento_referenciaGateway_key" ON "Pagamento"("referenciaGateway");
CREATE INDEX "Pagamento_pedidoId_idx" ON "Pagamento"("pedidoId");
CREATE INDEX "Auditoria_usuarioId_idx" ON "Auditoria"("usuarioId");
CREATE INDEX "Auditoria_acao_criadoEm_idx" ON "Auditoria"("acao", "criadoEm");

-- AddForeignKey
ALTER TABLE "PerfilFotografo" ADD CONSTRAINT "PerfilFotografo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_fotografoId_fkey" FOREIGN KEY ("fotografoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_fotografoId_fkey" FOREIGN KEY ("fotografoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_fotoId_fkey" FOREIGN KEY ("fotoId") REFERENCES "Foto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricoes de integridade (ultima barreira, independente da aplicacao)
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_email_minusculo_chk" CHECK ("email" = lower("email"));
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_tentativas_chk" CHECK ("tentativasFalhas" >= 0);
ALTER TABLE "PerfilFotografo" ADD CONSTRAINT "PerfilFotografo_estado_chk" CHECK ("estado" IS NULL OR "estado" ~ '^[A-Z]{2}$');
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_preco_chk" CHECK ("precoCentavos" BETWEEN 100 AND 1000000);
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_dimensoes_chk" CHECK ("largura" > 0 AND "altura" > 0 AND "bytesOriginal" > 0);
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_formato_chk" CHECK ("formato" IN ('jpeg', 'png', 'webp'));
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_titulo_chk" CHECK (length(btrim("titulo")) > 0);
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_sha256_chk" CHECK ("sha256Original" ~ '^[0-9a-f]{64}$');
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_titulo_chk" CHECK (length(btrim("titulo")) > 0);
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_total_chk" CHECK ("totalCentavos" > 0);
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_pago_chk" CHECK (("status" = 'pago') = ("pagoEm" IS NOT NULL));
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_valores_chk" CHECK ("precoCentavos" > 0 AND "taxaPlataformaCentavos" >= 0 AND "taxaPlataformaCentavos" <= "precoCentavos" AND "downloads" >= 0);
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_valor_chk" CHECK ("valorCentavos" > 0);
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_cartao_chk" CHECK ("cartaoFinal" IS NULL OR "cartaoFinal" ~ '^[0-9]{4}$');

-- Auditoria imutavel: UPDATE/DELETE direto sao proibidos. Acoes disparadas por
-- chave estrangeira (ON DELETE SET NULL ao excluir um usuario) rodam em
-- pg_trigger_depth() > 1 e continuam permitidas.
CREATE FUNCTION lenspro_bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A tabela % e imutavel (somente INSERT).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Auditoria_imutavel"
BEFORE UPDATE OR DELETE ON "Auditoria"
FOR EACH ROW EXECUTE FUNCTION lenspro_bloquear_alteracao();
