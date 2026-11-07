// spiderman
/**
 * Cifra o cartao no navegador com o SDK oficial do PagBank: so o texto cifrado vai ao
 * servidor do LensPro (que o repassa ao PagBank), entao numero e CVV nunca passam por ele.
 */
const URL_SDK = "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";

interface SdkPagSeguro {
  encryptCard(d: { publicKey: string; holder: string; number: string; expMonth: string; expYear: string; securityCode: string }): {
    encryptedCard?: string;
    hasErrors: boolean;
    errors?: { code: string; message: string }[];
  };
}

let carregando: Promise<SdkPagSeguro> | null = null;

function carregarSdk(): Promise<SdkPagSeguro> {
  const w = window as unknown as { PagSeguro?: SdkPagSeguro };
  if (w.PagSeguro) return Promise.resolve(w.PagSeguro);
  carregando ??= new Promise<SdkPagSeguro>((ok, erro) => {
    const s = document.createElement("script");
    s.src = URL_SDK;
    s.async = true;
    s.onload = () => (w.PagSeguro ? ok(w.PagSeguro) : erro(new Error("sdk")));
    s.onerror = () => {
      carregando = null;
      erro(new Error("sdk"));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

export async function cifrarCartao(chavePublica: string, c: { nome: string; numero: string; validade: string; cvv: string }): Promise<string> {
  let sdk: SdkPagSeguro;
  try {
    sdk = await carregarSdk();
  } catch {
    throw new Error("Não foi possível carregar o módulo seguro de pagamento. Verifique sua conexão e tente novamente.");
  }
  const [mes, ano] = c.validade.split("/");
  const r = sdk.encryptCard({ publicKey: chavePublica, holder: c.nome, number: c.numero.replace(/\D/g, ""), expMonth: mes, expYear: "20" + ano, securityCode: c.cvv });
  if (r.hasErrors || !r.encryptedCard) throw new Error(r.errors?.[0]?.message ?? "Dados do cartão inválidos.");
  return r.encryptedCard;
}
