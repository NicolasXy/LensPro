// spiderman
import { createHash } from "crypto";
import { iguaisEmTempoConstante } from "../core/crypto";
import { ErroGateway, ErroValidacao } from "../errors";
import {
  CobrancaPix,
  DadosCartao,
  EventoGateway,
  GatewayPagamento,
  PedidoCobranca,
  Repasse,
  ResultadoCartao,
} from "./Gateway";

/**
 * Gateway PagSeguro (PagBank) sobre a API de Pedidos (`/orders`).
 *
 *  - Pix: pedido com `qr_codes`; o "copia e cola" vem em `qr_codes[0].text`.
 *    Com SPLIT (venda dividida entre fotografos e plataforma) a documentacao do PagBank
 *    coloca a divisao em `charges[].splits` (e nao em `qr_codes`), entao o Pix dividido usa
 *    `charges` com `payment_method.type = "PIX"`. ATENCAO: onde vem o "copia e cola" nessa
 *    resposta nao esta nos exemplos da documentacao; `textoQrCode` procura nos locais
 *    provaveis e, se nao achar, a cobranca falha com 502 (nada e cobrado). Validar em sandbox.
 *  - Split: `charges[].splits = { method: "FIXED", receivers: [{ account: { id }, amount: { value } }] }`;
 *    a soma dos valores deve igualar o total e o dono do token (plataforma) precisa constar.
 *  - Cartao: pedido com `charges` (captura imediata). O navegador cifra o cartao
 *    com o SDK do PagBank (chave de `/public-keys`) e o servidor so repassa o
 *    texto cifrado em `card.encrypted`: numero/CVV nunca passam pelo LensPro.
 *  - Notificacoes: o PagBank envia o pedido atualizado para `notification_urls`
 *    com o cabecalho `x-authenticity-token` = SHA-256 de `<token>-<corpo bruto>`.
 *  - `reference_id` do pedido = referencia do pagamento no LensPro.
 *
 * Valores em centavos (inteiros). Chamadas com timeout, sem repeticao automatica
 * (a chave de idempotencia evita cobranca duplicada se o cliente tentar de novo).
 */
export interface OpcoesPagSeguro {
  token: string;
  ambiente: "sandbox" | "producao";
  urlNotificacao: string;
  /** Id (ACCO_...) da conta PagBank dona do token: recebedora principal, fica com a taxa da plataforma. */
  contaPlataforma: string;
  /** Injetavel nos testes. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Monta `charges[].splits`. Cada fotografo recebe o liquido dele; a plataforma recebe o restante
 * (a soma das taxas). Devolve null quando nao ha o que dividir (tudo e da propria plataforma).
 */
export function montarDivisao(contaPlataforma: string, totalCentavos: number, repasses: Repasse[]): Json | null {
  const porConta = new Map<string, number>();
  let daPlataforma = 0;
  for (const r of repasses) {
    if (!Number.isInteger(r.valorCentavos) || r.valorCentavos <= 0) throw new ErroGateway();
    if (r.contaId === contaPlataforma) daPlataforma += r.valorCentavos; // fotografo = dono do token: nada a dividir
    else porConta.set(r.contaId, (porConta.get(r.contaId) ?? 0) + r.valorCentavos);
  }
  const somaFotografos = [...porConta.values()].reduce((a, b) => a + b, 0);
  const plataforma = totalCentavos - somaFotografos; // taxas + (parte de fotografo que e a propria plataforma)
  if (plataforma < 0 || daPlataforma > plataforma) throw new ErroGateway();
  if (porConta.size === 0) return null;
  const recebedores: Json[] = [...porConta.entries()].map(([id, valor]) => ({
    account: { id },
    amount: { value: valor },
    reason: "Repasse LensPro",
    configurations: { custody: { apply: false } },
  }));
  if (plataforma > 0) {
    recebedores.push({ account: { id: contaPlataforma }, amount: { value: plataforma }, reason: "Taxa LensPro", configurations: { custody: { apply: false } } });
  }
  // A plataforma (dono do token) e obrigatoria na lista; sem taxa (valor 0) nao ha como montar um split valido.
  if (plataforma <= 0 || recebedores.length < 2) throw new ErroGateway();
  return { method: "FIXED", receivers: recebedores };
}

/** Procura o "copia e cola" do Pix numa resposta de pedido (qr_codes ou dentro da cobranca). */
function textoQrCode(r: Json): string | null {
  const qr = obj((Array.isArray(r.qr_codes) ? (r.qr_codes as unknown[]) : [])[0]);
  if (typeof qr.text === "string") return qr.text;
  const charge = cobrancaRelevante(r);
  const pix = obj(obj(charge?.payment_method).pix);
  for (const k of ["qr_code_text", "text", "emv", "qr_code"]) if (typeof pix[k] === "string") return pix[k] as string;
  const qc = obj(pix.qr_code);
  if (typeof qc.text === "string") return qc.text;
  return null;
}

const BASE = { sandbox: "https://sandbox.api.pagseguro.com", producao: "https://api.pagseguro.com" } as const;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

/** Data ISO-8601 com o fuso de Brasilia (-03:00), como nos exemplos da documentacao do PagBank. */
function isoBrasilia(d: Date): string {
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().replace("Z", "-03:00");
}

/** Mapeia o status de uma cobranca (charge) do PagBank para o do LensPro. */
function mapearStatus(status: unknown): "aprovado" | "recusado" | "cancelado" | "pendente" {
  switch (status) {
    case "PAID":
      return "aprovado";
    case "DECLINED":
      return "recusado";
    case "CANCELED":
      return "cancelado";
    default: // AUTHORIZED, IN_ANALYSIS, WAITING...
      return "pendente";
  }
}

/** Escolhe a cobranca relevante de um pedido (a paga, se houver; senao a mais recente). */
function cobrancaRelevante(pedido: Json): Json | null {
  const charges = Array.isArray(pedido.charges) ? (pedido.charges as unknown[]).map(obj) : [];
  if (charges.length === 0) return null;
  return charges.find((c) => c.status === "PAID") ?? charges[charges.length - 1];
}

/** Converte o pedido do PagBank (webhook ou consulta) em um evento do LensPro. */
export function interpretarPedidoPagBank(corpo: unknown): EventoGateway | null {
  const pedido = obj(corpo);
  const referencia = pedido.reference_id;
  const charge = cobrancaRelevante(pedido);
  if (typeof referencia !== "string" || !charge) return null;
  const status = mapearStatus(charge.status);
  if (status === "pendente") return null;
  const valor = obj(charge.amount).value;
  const motivo = obj(charge.payment_response).message;
  return {
    referencia,
    status,
    valorCentavos: typeof valor === "number" ? valor : undefined,
    motivo: typeof motivo === "string" ? motivo.slice(0, 200) : undefined,
  };
}

export class GatewayPagSeguro implements GatewayPagamento {
  readonly nome = "pagseguro" as const;
  readonly dividePagamento = true;
  private readonly base: string;
  private readonly http: typeof fetch;
  private readonly timeoutMs: number;
  private chave: { valor: string; ate: number } | null = null;

  constructor(private readonly op: OpcoesPagSeguro) {
    if (!op.token || op.token.length < 16) throw new Error("PAGSEGURO_TOKEN ausente ou curto demais.");
    if (!/^ACCO_[A-Za-z0-9-]{4,36}$/.test(op.contaPlataforma ?? "")) throw new Error("PAGSEGURO_CONTA_ID invalido (esperado ACCO_...).");
    this.base = BASE[op.ambiente];
    this.http = op.fetchImpl ?? fetch;
    this.timeoutMs = op.timeoutMs ?? 15000;
  }

  private async chamar(metodo: "GET" | "POST", caminho: string, corpo?: unknown, idempotencia?: string): Promise<Json> {
    let resp: Response;
    try {
      resp = await this.http(this.base + caminho, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${this.op.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(idempotencia ? { "x-idempotency-key": idempotencia } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ErroGateway(); // timeout/rede: sem detalhes (nada de token nem corpo no erro)
    }
    const texto = await resp.text();
    let json: Json = {};
    try {
      json = obj(JSON.parse(texto));
    } catch {
      /* resposta vazia ou nao JSON */
    }
    if (resp.ok) return json;
    if (resp.status === 400 || resp.status === 409 || resp.status === 422) {
      const m = Array.isArray(json.error_messages) ? obj((json.error_messages as unknown[])[0]) : {};
      const detalhe = typeof m.description === "string" ? m.description : "dados rejeitados pelo gateway";
      throw new ErroValidacao(`Pagamento nao aceito: ${detalhe}.`.slice(0, 200));
    }
    // 401/403 (token/permissao), 5xx etc.: erro nosso ou do gateway, nao do comprador.
    throw new ErroGateway();
  }

  private corpoBase(p: PedidoCobranca): Json {
    const cpf = p.pagador.cpf;
    if (!cpf) throw new ErroValidacao("Informe o CPF.");
    return {
      reference_id: p.referencia,
      customer: { name: p.pagador.nome.slice(0, 100), email: p.pagador.email, tax_id: cpf },
      items: [{ reference_id: p.referencia, name: p.descricao.slice(0, 100), quantity: 1, unit_amount: p.valorCentavos }],
      notification_urls: [this.op.urlNotificacao],
    };
  }

  async criarCobrancaPix(p: PedidoCobranca): Promise<CobrancaPix> {
    const divisao = montarDivisao(this.op.contaPlataforma, p.valorCentavos, p.repasses ?? []);
    const pagamento: Json = divisao
      ? {
          charges: [
            {
              reference_id: p.referencia,
              description: "LensPro".slice(0, 63),
              amount: { value: p.valorCentavos, currency: "BRL" },
              payment_method: { type: "PIX", pix: { expiration_date: isoBrasilia(p.expiraEm) } },
              splits: divisao,
            },
          ],
        }
      : { qr_codes: [{ amount: { value: p.valorCentavos }, expiration_date: isoBrasilia(p.expiraEm) }] };
    const r = await this.chamar("POST", "/orders", { ...this.corpoBase(p), ...pagamento }, p.referencia);
    const texto = textoQrCode(r);
    if (texto === null || typeof r.id !== "string") throw new ErroGateway();
    return { gatewayPedidoId: r.id.slice(0, 64), copiaECola: texto };
  }

  async cobrarCartao(p: PedidoCobranca, cartao: DadosCartao): Promise<ResultadoCartao> {
    if (!cartao.criptografado) throw new ErroValidacao("Cartao nao informado.");
    const divisao = montarDivisao(this.op.contaPlataforma, p.valorCentavos, p.repasses ?? []);
    const r = await this.chamar(
      "POST",
      "/orders",
      {
        ...this.corpoBase(p),
        charges: [
          {
            reference_id: p.referencia,
            description: "LensPro".slice(0, 63),
            amount: { value: p.valorCentavos, currency: "BRL" },
            payment_method: {
              type: "CREDIT_CARD",
              installments: 1,
              capture: true,
              card: { encrypted: cartao.criptografado, store: false },
              holder: { name: cartao.nome, tax_id: p.pagador.cpf },
            },
            ...(divisao ? { splits: divisao } : {}),
          },
        ],
      },
      p.referencia
    );
    const charge = cobrancaRelevante(r);
    if (!charge || typeof r.id !== "string") throw new ErroGateway();
    const card = obj(obj(charge.payment_method).card);
    const status = mapearStatus(charge.status);
    const msg = obj(charge.payment_response).message;
    const final = typeof card.last_digits === "string" ? card.last_digits.slice(-4) : undefined;
    return {
      gatewayPedidoId: r.id.slice(0, 64),
      status: status === "aprovado" ? "aprovado" : status === "pendente" ? "pendente" : "recusado",
      motivo: status === "aprovado" || status === "pendente" ? undefined : typeof msg === "string" ? msg.slice(0, 200) : "Cartao recusado.",
      bandeira: typeof card.brand === "string" ? card.brand.toLowerCase().slice(0, 20) : undefined,
      final: final && /^\d{4}$/.test(final) ? final : undefined,
    };
  }

  async consultar(gatewayPedidoId: string): Promise<EventoGateway | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(gatewayPedidoId)) return null;
    return interpretarPedidoPagBank(await this.chamar("GET", `/orders/${gatewayPedidoId}`));
  }

  /** Chave publica do PagBank usada pelo SDK no navegador para cifrar o cartao (cache de 1 h). */
  async chavePublicaCartao(): Promise<string> {
    if (this.chave && this.chave.ate > Date.now()) return this.chave.valor;
    const r = await this.chamar("POST", "/public-keys", { type: "card" });
    if (typeof r.public_key !== "string") throw new ErroGateway();
    this.chave = { valor: r.public_key, ate: Date.now() + 3600_000 };
    return r.public_key;
  }

  /** `x-authenticity-token` = SHA-256 hex de "<token>-<corpo bruto>", comparado em tempo constante. */
  validarWebhook(corpoBruto: string, cabecalhos: Record<string, string | string[] | undefined>): boolean {
    const bruto = cabecalhos["x-authenticity-token"];
    const recebido = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim().toLowerCase();
    if (!recebido || !/^[0-9a-f]{64}$/.test(recebido)) return false;
    const esperado = createHash("sha256").update(`${this.op.token}-${corpoBruto}`, "utf8").digest("hex");
    return iguaisEmTempoConstante(esperado, recebido);
  }

  interpretarWebhook(corpo: unknown): EventoGateway | null {
    return interpretarPedidoPagBank(corpo);
  }
}
