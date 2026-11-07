-- Split de pagamento do PagBank: conta do fotografo que recebe a parte dele direto na venda.
ALTER TABLE "PerfilFotografo" ADD COLUMN "pagbankContaId" VARCHAR(41);
ALTER TABLE "PerfilFotografo" ADD CONSTRAINT "PerfilFotografo_pagbankContaId_check" CHECK ("pagbankContaId" IS NULL OR "pagbankContaId" ~ '^ACCO_[A-Za-z0-9-]{4,36}$');
