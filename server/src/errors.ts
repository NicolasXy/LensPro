// spiderman
/**
 * Erros de dominio e de HTTP. Os services apenas lancam estas excecoes; o
 * plugin plugins/erros.ts as converte em respostas { erro, mensagem }.
 */

/** Dado invalido informado pelo usuario (HTTP 400). */
export class ErroValidacao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroValidacao";
  }
}

/** Usuario autenticado, mas sem permissao para a operacao (HTTP 403). */
export class ErroPermissao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroPermissao";
  }
}

/** Recurso solicitado nao existe (HTTP 404). */
export class ErroNaoEncontrado extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroNaoEncontrado";
  }
}

/** Conflito de estado: duplicidade, regra de unicidade ou versao desatualizada (HTTP 409). */
export class ErroConflito extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroConflito";
  }
}

/** Credenciais ausentes, invalidas ou token expirado (HTTP 401). */
export class ErroNaoAutenticado extends Error {
  constructor(message = "Autenticacao necessaria.") {
    super(message);
    this.name = "ErroNaoAutenticado";
  }
}

/** Excesso de tentativas (login bloqueado temporariamente) (HTTP 429). */
export class ErroMuitasTentativas extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroMuitasTentativas";
  }
}

/** Falha ao falar com um servico externo (gateway de pagamento fora do ar, timeout...) (HTTP 502). */
export class ErroGateway extends Error {
  constructor(message = "Gateway de pagamento indisponivel. Tente novamente em instantes.") {
    super(message);
    this.name = "ErroGateway";
  }
}
