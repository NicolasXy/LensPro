// spiderman
import { FastifyReply, FastifyRequest } from "fastify";
import { PedidoService } from "../services/PedidoService";
import { PagamentoService, DadosPagamento } from "../services/PagamentoService";
import { CompraService } from "../services/CompraService";
import { Pag, lerPaginacao, paginado } from "./util";

/** Area do comprador: pedidos, pagamento e biblioteca de fotos compradas. */
export class CompraController {
  constructor(
    private readonly pedidos: PedidoService,
    private readonly pagamentos: PagamentoService,
    private readonly compras: CompraService
  ) {}

  criarPedido = async (req: FastifyRequest<{ Body: { fotoIds: string[] } }>, reply: FastifyReply) =>
    reply.status(201).send(await this.pedidos.criar(req.ator, req.body.fotoIds));

  listarPedidos = async (req: FastifyRequest<{ Querystring: Pag }>) => {
    const p = lerPaginacao(req.query, 10);
    return paginado(await this.pedidos.listar(req.ator, p), p);
  };

  obterPedido = async (req: FastifyRequest<{ Params: { id: string } }>) => this.pedidos.obter(req.ator, req.params.id);

  cancelarPedido = async (req: FastifyRequest<{ Params: { id: string } }>) => this.pedidos.cancelar(req.ator, req.params.id);

  pagar = async (req: FastifyRequest<{ Params: { id: string }; Body: DadosPagamento }>) =>
    this.pagamentos.pagar(req.ator, req.params.id, req.body);

  configuracaoPagamento = async () => this.pagamentos.configuracao();

  verificarPagamento = async (req: FastifyRequest<{ Params: { id: string } }>) => this.pagamentos.verificarPagamento(req.ator, req.params.id);

  simularPix = async (req: FastifyRequest<{ Params: { id: string } }>) => this.pagamentos.simularPagamentoPix(req.ator, req.params.id);

  listarCompras = async (req: FastifyRequest<{ Querystring: Pag }>) => {
    const p = lerPaginacao(req.query, 24);
    return paginado(await this.compras.listar(req.ator, p), p);
  };

  /** Entrega o ORIGINAL (sem marca d'agua) como anexo; so para o comprador do item. */
  baixar = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const a = await this.compras.baixar(req.ator, req.params.id);
    return reply
      .header("Content-Type", a.mime)
      .header("Content-Disposition", `attachment; filename="${a.nomeArquivo}"`)
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(a.conteudo);
  };

  /** Notificacao do PagSeguro: corpo bruto + cabecalho x-authenticity-token. */
  webhookPagSeguro = async (req: FastifyRequest<{ Body: string }>, reply: FastifyReply) => {
    const r = await this.pagamentos.processarNotificacaoGateway(req.body, req.headers);
    return reply.status(200).send({ resultado: r });
  };

  /** Webhook do gateway: recebe o corpo BRUTO (para conferir a assinatura HMAC) e o cabecalho de assinatura. */
  webhook = async (req: FastifyRequest<{ Body: string }>, reply: FastifyReply) => {
    const assinatura = req.headers["x-lenspro-assinatura"];
    const r = await this.pagamentos.processarWebhook(req.body, Array.isArray(assinatura) ? assinatura[0] : assinatura);
    return reply.status(200).send({ resultado: r });
  };
}
