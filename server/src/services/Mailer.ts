// spiderman
import { createTransport, Transporter } from "nodemailer";
/**
 * Contrato de envio de e-mail. O LensPro original tinha o Flask-Mail
 * configurado, mas a recuperacao de senha apenas imprimia o link no console;
 * aqui o contrato esta isolado para que um transporte SMTP real (ex.:
 * nodemailer) seja plugado sem tocar nas regras de negocio.
 */
export interface EnviadorEmail {
  enviar(para: string, assunto: string, texto: string): Promise<void>;
}

/** Transporte SMTP real (nodemailer). `smtpUrl` ex.: smtps://usuario:senha@smtp.exemplo.com:465 */
export class EnviadorSmtp implements EnviadorEmail {
  private readonly transporte: Transporter;

  constructor(smtpUrl: string, private readonly remetente: string, transporte?: Transporter) {
    this.transporte = transporte ?? createTransport(smtpUrl);
  }

  async enviar(para: string, assunto: string, texto: string): Promise<void> {
    await this.transporte.sendMail({ from: this.remetente, to: para, subject: assunto, text: texto });
  }
}

/** Transporte de desenvolvimento: escreve o e-mail (com o link de recuperacao) no log do servidor. NUNCA usar em producao. */
export class EnviadorConsole implements EnviadorEmail {
  constructor(private readonly log: (msg: string) => void = (m) => console.log(m)) {}

  async enviar(para: string, assunto: string, texto: string): Promise<void> {
    this.log(`[EMAIL] Para: ${para} | Assunto: ${assunto}\n${texto}`);
  }
}

/** Transporte de testes: guarda as mensagens em memoria. */
export class EnviadorMemoria implements EnviadorEmail {
  readonly enviados: { para: string; assunto: string; texto: string }[] = [];

  async enviar(para: string, assunto: string, texto: string): Promise<void> {
    this.enviados.push({ para, assunto, texto });
  }
}
