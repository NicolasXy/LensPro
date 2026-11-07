// spiderman
import { MetodoPagamento } from "../generated/prisma/enums";
import { bandeiraDoCartao } from "../core/validadores";

/**
 * Contrato do gateway de pagamento. O LensPro fala SEMPRE com esta
 * interface; as implementacoes sao o GatewaySimulado (desenvolvimento e
 * testes) e o GatewayPagSeguro (PagBank, producao). Trocar de provedor e
 * escrever uma nova classe que a implemente (ver docs/API.md).
 */
export interface Pagador {
  nome: string;
  email: string;
  /** CPF (so digitos). Exigido pelo PagBank; repassado ao gateway e NUNCA gravado. */
  cpf?: string;
}

/** Dados de uma cobranca: a referencia e gerada pelo LensPro e identifica o pagamento nos dois lados. */
export interface PedidoCobranca {
  referencia: string;
  valorCentavos: number;
  descricao: string;
  pagador: Pagador;
  expiraEm: Date;
  /**
   * Parte de cada fotografo (conta do gateway + centavos), ja liquida da taxa. O gateway que
   * suporta divisao a envia como split; a parte da plataforma e o restante (valor - soma).
   */
  repasses?: Repasse[];
}

export interface Repasse {
  contaId: string;
  valorCentavos: number;
}

/**
 * Cartao. No gateway simulado chegam numero/validade/CVV; no PagSeguro o
 * navegador cifra o cartao com o SDK do PagBank e so o texto cifrado
 * (`criptografado`) chega aqui: o numero real nunca passa pelo servidor.
 */
export interface DadosCartao {
  nome: string;
  numero?: string;
  validade?: string; // MM/AA
  cvv?: string;
  criptografado?: string;
}

export interface CobrancaPix {
  gatewayPedidoId?: string;
  copiaECola: string;
}

export interface ResultadoCartao {
  gatewayPedidoId?: string;
  /** "pendente" = em analise antiga; a decisao chega depois (webhook ou consulta). */
  status: "aprovado" | "recusado" | "pendente";
  motivo?: string;
  bandeira?: string;
  final?: string;
}

/** Resultado de um pagamento comunicado pelo gateway (webhook ou consulta). */
export interface EventoGateway {
  referencia: string;
  status: "aprovado" | "recusado" | "cancelado";
  valorCentavos?: number;
  motivo?: string;
}

export interface GatewayPagamento {
  readonly nome: "simulado" | "pagseguro";
  /** true = a venda e dividida no proprio gateway (cada fotografo precisa de conta vinculada). */
  readonly dividePagamento: boolean;
  criarCobrancaPix(p: PedidoCobranca): Promise<CobrancaPix>;
  cobrarCartao(p: PedidoCobranca, cartao: DadosCartao): Promise<ResultadoCartao>;
  /** Consulta o estado atual de um pedido no gateway (reconciliacao quando o webhook se perde). */
  consultar?(gatewayPedidoId: string): Promise<EventoGateway | null>;
  /** Chave publica para o navegador cifrar o cartao (PagSeguro). */
  chavePublicaCartao?(): Promise<string>;
  /** Confere a autenticidade de uma notificacao do gateway (corpo bruto + cabecalhos). */
  validarWebhook?(corpoBruto: string, cabecalhos: Record<string, string | string[] | undefined>): boolean;
  /** Converte o corpo de uma notificacao em um evento (null = nada a fazer). */
  interpretarWebhook?(corpo: unknown): EventoGateway | null;
}

/** CRC16/CCITT-FALSE exigido pelo BR Code do Pix (campo 63). */
function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, "0") + valor;
}

/** Monta um "Pix copia e cola" no formato BR Code (EMV) valido, com CRC16. */
export function gerarBrCode(p: { chave: string; nome: string; cidade: string; valorCentavos: number; txid: string }): string {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", p.chave);
  const corpo =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (p.valorCentavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", p.nome.slice(0, 25)) +
    campo("60", p.cidade.slice(0, 15)) +
    campo("62", campo("05", p.txid.slice(0, 25))) +
    "6304";
  return corpo + crc16(corpo);
}

/**
 * Gateway SIMULADO (ambiente de desenvolvimento e testes). Nao movimenta
 * dinheiro: o Pix fica pendente ate o "webhook" (que aqui o proprio comprador
 * dispara pelo botao "Simular pagamento") e o cartao e aprovado ou recusado por
 * regras fixas, para a pagina de pagamento poder ser testada de ponta a ponta:
 *   - cartao terminado em 0002  -> recusado (emissor)
 *   - cartao terminado em 9995  -> recusado (saldo insuficiente)
 *   - qualquer outro numero valido (Luhn) -> aprovado
 * O numero do cartao existe so em memoria durante esta chamada: nada dele e gravado.
 */
export class GatewaySimulado implements GatewayPagamento {
  readonly nome = "simulado" as const;
  readonly dividePagamento = false;

  async criarCobrancaPix(p: PedidoCobranca): Promise<CobrancaPix> {
    const copiaECola = gerarBrCode({
      chave: "pagamentos@lenspro.example",
      nome: "LENSPRO",
      cidade: "SAO PAULO",
      valorCentavos: p.valorCentavos,
      txid: p.referencia,
    });
    return { copiaECola };
  }

  async cobrarCartao(_p: PedidoCobranca, cartao: DadosCartao): Promise<ResultadoCartao> {
    const numero = (cartao.numero ?? "").replace(/\D/g, "");
    const final = numero.slice(-4);
    const base = { final, bandeira: bandeiraDoCartao(numero) };
    if (final === "0002") return { ...base, status: "recusado", motivo: "Cartao recusado pelo emissor." };
    if (final === "9995") return { ...base, status: "recusado", motivo: "Saldo insuficiente." };
    return { ...base, status: "aprovado" };
  }
}

export type { MetodoPagamento };
