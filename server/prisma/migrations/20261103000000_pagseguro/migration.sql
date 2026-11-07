-- Integracao PagSeguro/PagBank: guarda o id do pedido no gateway (consulta de status e reconciliacao).
ALTER TABLE "Pagamento" ADD COLUMN "gatewayPedidoId" VARCHAR(64);
CREATE INDEX "Pagamento_gatewayPedidoId_idx" ON "Pagamento"("gatewayPedidoId");
