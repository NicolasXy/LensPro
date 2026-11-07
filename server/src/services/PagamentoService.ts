// spiderman
import { randomBytes } from "crypto";
import { Repositorios, UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { bandeiraDoCartao, luhnValido, validarCpf, validarNome } from "../core/validadores";
import { verificarHmac } from "../core/crypto";
import { MetodoPagamento } from "../generated/prisma/enums";
import { ErroConflito, ErroGateway, ErroNaoAutenticado, ErroNaoEncontrado, ErroPermissao, ErroValidacao } from "../errors";
import { Ator } from "./tipos";
import { DadosCartao, EventoGateway, GatewayPagamento, Repasse } from "./Gateway";
import { PedidoDto, PedidoService, pedidoDto } from "./PedidoService";

export interface DadosPagamento {
  metodo: MetodoPagamento;
  /** CPF do pagador: exigido pelo PagSeguro (repassado, nunca gravado). */
  cpf?: string;
  cartao?: Partial<DadosCartao>;
}

/** Cartao no gateway simulado: valida numero (Luhn), validade e CVV como um formulario real. */
function validarCartaoSimulado(c: Partial<DadosCartao> | undefined): DadosCartao {
  if (!c) throw new ErroValidacao("Informe os dados do cartao.");
  const numero = (c.numero ?? "").replace(/\D/g, "");
  if (!luhnValido(numero)) throw new ErroValidacao("Numero de cartao invalido.");
  const nome = validarNome(c.nome ?? "", "Nome no cartao", 60);
  const m = /^(\d{2})\/(\d{2})$/.exec((c.validade ?? "").trim());
  if (!m) throw new ErroValidacao("Validade deve estar no formato MM/AA.");
  const mes = Number(m[1]);
  const ano = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) throw new ErroValidacao("Mes de validade invalido.");
  const hoje = new Date();
  // O cartao vale ate o ULTIMO dia do mes informado.
  if (ano < hoje.getUTCFullYear() || (ano === hoje.getUTCFullYear() && mes < hoje.getUTCMonth() + 1)) {
    throw new ErroValidacao("Cartao vencido.");
  }
  const cvv = (c.cvv ?? "").trim();
  if (!/^\d{3,4}$/.test(cvv)) throw new ErroValidacao("CVV invalido.");
  return { numero, nome, validade: `${m[1]}/${m[2]}`, cvv };
}

/** Cartao no PagSeguro: so chega o texto cifrado pelo SDK do PagBank (o numero nao passa pelo servidor). */
function validarCartaoCifrado(c: Partial<DadosCartao> | undefined): DadosCartao {
  const cifrado = (c?.criptografado ?? "").trim();
  if (cifrado.length < 20 || cifrado.length > 4000 || /\s/.test(cifrado)) throw new ErroValidacao("Dados do cartao invalidos. Recarregue a pagina e tente novamente.");
  return { nome: validarNome(c?.nome ?? "", "Nome no cartao", 60), criptografado: cifrado };
}

const novaReferencia = (): string => "LP" + randomBytes(12).toString("hex");

/**
 * Pagamento dos pedidos. Fluxos:
 *  - Cartao: cobranca sincrona; aprovado => pedido "pago".
 *  - Pix: cria cobranca pendente (copia e cola); a confirmacao chega assincrona
 *    pelo WEBHOOK do gateway (autenticado) ou por consulta de reconciliacao.
 *    A confirmacao e IDEMPOTENTE e confere o VALOR pago.
 *
 * A chamada ao gateway (rede) acontece FORA de qualquer transacao do banco:
 *   1. transacao curta: trava o pedido, cria o pagamento "pendente" com a referencia;
 *   2. chamada ao gateway (com timeout e chave de idempotencia);
 *   3. transacao curta: grava o resultado (e marca o pedido pago, se aprovado).
 * Se a etapa 2 falhar, o pagamento e cancelado e o pedido segue pendente (nova tentativa).
 *
 * Do cartao so gravamos bandeira e 4 ultimos digitos; numero, validade e CVV
 * nunca vao ao banco nem aos logs. No PagSeguro o numero nem chega ao servidor.
 */
export class PagamentoService {
  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly gateway: GatewayPagamento,
    private readonly pedidos: PedidoService,
    private readonly webhookSecret: string
  ) {}

  /** Configuracao que o front precisa para montar a tela de pagamento. */
  async configuracao(): Promise<{ gateway: "simulado" | "pagseguro"; chavePublicaCartao: string | null }> {
    const chave = this.gateway.chavePublicaCartao ? await this.gateway.chavePublicaCartao() : null;
    return { gateway: this.gateway.nome, chavePublicaCartao: chave };
  }

  /**
   * Divisao da venda (gateways que dividem o pagamento, como o PagSeguro): soma o LIQUIDO
   * (preco - taxa travados no item) de cada fotografo e a conta PagBank dele. Fotografo sem
   * conta vinculada: a venda nao pode ser dividida, entao o pagamento e recusado com
   * mensagem clara (nunca cobra para ficar com o dinheiro dele).
   */
  private async montarRepasses(itens: { fotografoId: string; precoCentavos: number; taxaPlataformaCentavos: number }[]): Promise<Repasse[]> {
    const liquido = new Map<string, number>();
    for (const i of itens) liquido.set(i.fotografoId, (liquido.get(i.fotografoId) ?? 0) + i.precoCentavos - i.taxaPlataformaCentavos);
    const db = this.uow.simples();
    const repasses: Repasse[] = [];
    const sem: string[] = [];
    for (const [fotografoId, valorCentavos] of liquido) {
      const perfil = await db.perfis.buscar(fotografoId);
      if (!perfil?.pagbankContaId) sem.push(perfil?.nomeArtistico ?? "fotografo");
      else repasses.push({ contaId: perfil.pagbankContaId, valorCentavos });
    }
    if (sem.length > 0) {
      throw new ErroConflito(`Nao e possivel pagar agora: ${sem.join(", ")} ainda nao ${sem.length > 1 ? "vincularam" : "vinculou"} a conta de recebimento PagBank. Remova ${sem.length > 1 ? "essas fotos" : "as fotos desse fotografo"} do carrinho ou tente mais tarde.`);
    }
    return repasses;
  }

  async pagar(ator: Ator, pedidoId: string, dados: DadosPagamento): Promise<PedidoDto> {
    const pedido = await this.pedidos.carregarDoComprador(ator, pedidoId); // valida dono e expira se vencido
    const real = this.gateway.nome === "pagseguro";
    const cpf = real ? validarCpf(dados.cpf) : undefined;
    const cartao = dados.metodo === "cartao" ? (real ? validarCartaoCifrado(dados.cartao) : validarCartaoSimulado(dados.cartao)) : undefined;

    const repasses = this.gateway.dividePagamento ? await this.montarRepasses(pedido.itens) : undefined;

    const referencia = novaReferencia();
    const pagamento = await this.uow.transacao(async (r) => {
      await r.pedidos.bloquear(pedidoId);
      const p = await r.pedidos.buscarPorId(pedidoId);
      if (!p || p.compradorId !== ator.id) throw new ErroNaoEncontrado("Pedido nao encontrado.");
      if (p.status !== "pendente") throw new ErroConflito("Este pedido nao esta mais pendente.");
      // Uma nova tentativa invalida a cobranca anterior ainda aberta (ex.: Pix antigo).
      await r.pedidos.cancelarPagamentosPendentes(pedidoId);
      const novo = await r.pedidos.criarPagamento({
        pedidoId,
        metodo: dados.metodo,
        status: "pendente",
        valorCentavos: p.totalCentavos,
        referenciaGateway: referencia,
      });
      await r.auditoria.registrar(ator.id, dados.metodo === "pix" ? "PAGAMENTO_PIX_GERADO" : "PAGAMENTO_CARTAO_ENVIADO", { pedidoId, gateway: this.gateway.nome, recebedores: repasses?.length ?? 0 });
      return novo;
    });

    const cobranca = {
      referencia,
      valorCentavos: pagamento.valorCentavos,
      descricao: `LensPro - pedido ${pedidoId.slice(0, 8)} (${pedido.itens.length} foto(s))`,
      pagador: { nome: ator.nome, email: ator.email, cpf },
      expiraEm: pedido.expiraEm,
      repasses,
    };

    try {
      if (dados.metodo === "pix") {
        const c = await this.gateway.criarCobrancaPix(cobranca);
        await this.uow.transacao(async (r) => {
          await r.pedidos.atualizarPagamentoPendente(pagamento.id, { gatewayPedidoId: c.gatewayPedidoId ?? null, pixCopiaECola: c.copiaECola });
        });
      } else {
        const c = await this.gateway.cobrarCartao(cobranca, cartao!);
        const bandeira = c.bandeira ?? (cartao!.numero ? bandeiraDoCartao(cartao!.numero) : null);
        await this.uow.transacao(async (r) => {
          await r.pedidos.bloquear(pedidoId);
          await r.pedidos.atualizarPagamentoPendente(pagamento.id, {
            gatewayPedidoId: c.gatewayPedidoId ?? null,
            cartaoBandeira: bandeira,
            cartaoFinal: c.final ?? null,
          });
          if (c.status === "aprovado") {
            await this.aplicar(r, pagamento.id, pedidoId, "aprovado");
          } else if (c.status === "recusado") {
            await this.aplicar(r, pagamento.id, pedidoId, "recusado", c.motivo ?? "Recusado.");
          } // "pendente": segue aguardando o gateway decidir (webhook/consulta)
        });
      }
    } catch (e) {
      // Falha ao falar com o gateway (ou dados rejeitados): a cobranca nao existe; libera nova tentativa.
      await this.uow.transacao(async (r) => {
        await r.pedidos.resolverPagamentoPendente(pagamento.id, "cancelado", e instanceof ErroGateway ? "Gateway indisponivel." : "Dados rejeitados.");
        await r.auditoria.registrar(ator.id, "PAGAMENTO_FALHA_GATEWAY", { pedidoId, gateway: this.gateway.nome });
      });
      throw e;
    }
    return this.pedidos.obter(ator, pedidoId);
  }

  /** Aplica o resultado a um pagamento pendente dentro de uma transacao. Devolve false se ele ja estava resolvido. */
  private async aplicar(
    r: Repositorios,
    pagamentoId: string,
    pedidoId: string,
    status: "aprovado" | "recusado" | "cancelado",
    motivo?: string
  ): Promise<boolean> {
    const aplicou = await r.pedidos.resolverPagamentoPendente(pagamentoId, status, motivo);
    if (!aplicou) return false;
    if (status === "aprovado") {
      const ok = await r.pedidos.transicionar(pedidoId, "pendente", "pago", { pagoEm: new Date() });
      await r.auditoria.registrar(null, ok ? "PAGAMENTO_APROVADO" : "PAGAMENTO_APROVADO_SEM_PEDIDO_PENDENTE", { pedidoId });
    } else {
      await r.auditoria.registrar(null, status === "recusado" ? "PAGAMENTO_RECUSADO" : "PAGAMENTO_CANCELADO", { pedidoId, motivo: motivo ?? "" });
    }
    return true;
  }

  /** Aplica um resultado comunicado pelo gateway. Idempotente; so aprova se o valor pago confere. */
  private async resolver(evento: EventoGateway): Promise<"aplicado" | "ignorado"> {
    return this.uow.transacao(async (r) => {
      const pg = await r.pedidos.buscarPagamentoPorReferencia(evento.referencia);
      if (!pg) throw new ErroNaoEncontrado("Referencia de pagamento desconhecida.");
      await r.pedidos.bloquear(pg.pedidoId);
      if (evento.status === "aprovado" && evento.valorCentavos !== undefined && evento.valorCentavos !== pg.valorCentavos) {
        // Pagamento com valor diferente do cobrado: nunca libera as fotos automaticamente.
        await r.auditoria.registrar(null, "WEBHOOK_VALOR_DIVERGENTE", { referencia: evento.referencia, esperado: pg.valorCentavos, recebido: evento.valorCentavos });
        return "ignorado";
      }
      const aplicou = await this.aplicar(r, pg.id, pg.pedidoId, evento.status, evento.motivo);
      if (!aplicou) {
        // Reentrega do mesmo webhook, ou pagamento que ja foi cancelado/expirado: nada a fazer.
        await r.auditoria.registrar(null, "WEBHOOK_IGNORADO", { referencia: evento.referencia, status: evento.status });
        return "ignorado";
      }
      return "aplicado";
    });
  }

  /**
   * Webhook proprio (gateway simulado): HMAC-SHA256 do CORPO BRUTO no cabecalho
   * X-Lenspro-Assinatura, verificado em tempo constante ANTES de interpretar o conteudo.
   */
  async processarWebhook(corpoBruto: string, assinatura: string | undefined): Promise<"aplicado" | "ignorado"> {
    if (this.gateway.nome !== "simulado") throw new ErroNaoEncontrado("Rota nao disponivel.");
    if (!assinatura || !verificarHmac(this.webhookSecret, corpoBruto, assinatura)) {
      throw new ErroNaoAutenticado("Assinatura do webhook invalida.");
    }
    let dados: { referencia?: unknown; status?: unknown; motivo?: unknown };
    try {
      dados = JSON.parse(corpoBruto);
    } catch {
      throw new ErroValidacao("Corpo do webhook invalido.");
    }
    if (typeof dados.referencia !== "string" || !["aprovado", "recusado", "cancelado"].includes(String(dados.status))) {
      throw new ErroValidacao("Webhook sem referencia ou status valido.");
    }
    return this.resolver({
      referencia: dados.referencia,
      status: dados.status as "aprovado" | "recusado" | "cancelado",
      motivo: typeof dados.motivo === "string" ? dados.motivo.slice(0, 200) : undefined,
    });
  }

  /** Notificacao do gateway real (PagSeguro): autenticidade conferida antes de qualquer leitura do corpo. */
  async processarNotificacaoGateway(corpoBruto: string, cabecalhos: Record<string, string | string[] | undefined>): Promise<"aplicado" | "ignorado"> {
    const g = this.gateway;
    if (!g.validarWebhook || !g.interpretarWebhook) throw new ErroNaoEncontrado("Rota nao disponivel.");
    if (!g.validarWebhook(corpoBruto, cabecalhos)) throw new ErroNaoAutenticado("Notificacao nao autenticada.");
    let corpo: unknown;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      throw new ErroValidacao("Corpo da notificacao invalido.");
    }
    const evento = g.interpretarWebhook(corpo);
    if (!evento) return "ignorado"; // estados intermediarios (em analise, autorizado...)
    try {
      return await this.resolver(evento);
    } catch (e) {
      // Referencia que nao e nossa: confirma (200) para o gateway nao reenviar para sempre.
      if (e instanceof ErroNaoEncontrado) return "ignorado";
      throw e;
    }
  }

  /**
   * Reconciliacao: pergunta ao gateway o estado do pagamento pendente do pedido.
   * Cobre o webhook perdido/atrasado (e ambientes sem URL publica, como localhost).
   */
  async verificarPagamento(ator: Ator, pedidoId: string): Promise<PedidoDto> {
    const p = await this.pedidos.carregarDoComprador(ator, pedidoId);
    if (p.status === "pendente" && this.gateway.consultar) {
      const pendente = await this.uow.simples().pedidos.buscarPagamentoPendenteDoPedido(pedidoId);
      if (pendente?.gatewayPedidoId) {
        const evento = await this.gateway.consultar(pendente.gatewayPedidoId);
        if (evento && evento.referencia === pendente.referenciaGateway) await this.resolver(evento);
      }
    }
    return this.pedidos.obter(ator, pedidoId);
  }

  /** Apenas no gateway simulado: o comprador "paga" o Pix pendente (faz o papel do banco/webhook). */
  async simularPagamentoPix(ator: Ator, pedidoId: string): Promise<PedidoDto> {
    if (this.gateway.nome !== "simulado") throw new ErroPermissao("Simulacao de pagamento desabilitada.");
    const p = await this.pedidos.carregarDoComprador(ator, pedidoId);
    const pix = p.pagamentos.find((g) => g.metodo === "pix" && g.status === "pendente");
    if (!pix) throw new ErroConflito("Nao ha Pix pendente neste pedido. Gere o Pix primeiro.");
    await this.resolver({ referencia: pix.referenciaGateway, status: "aprovado" });
    return pedidoDto(await this.pedidos.carregarDoComprador(ator, pedidoId));
  }
}
