// spiderman
import { FastifyInstance } from "fastify";
import { ErroGateway, ErroConflito, ErroMuitasTentativas, ErroNaoAutenticado, ErroNaoEncontrado, ErroPermissao, ErroValidacao } from "../errors";

/**
 * Tratamento centralizado de erros: converte as excecoes de dominio e do
 * Prisma em respostas HTTP padronizadas { erro, mensagem }. Os controllers
 * e services apenas lancam excecoes; nenhum deles monta resposta de erro.
 * Detalhes internos (stack, SQL) nunca vao para o cliente: 500 e generico.
 */
export function registrarTratamentoDeErros(app: FastifyInstance, servirFront?: (url: string) => boolean): void {
  app.setNotFoundHandler((req, reply) => {
    // Rotas do front (SPA) nao existem no servidor: devolvem o index.html para o React Router.
    if (servirFront && req.method === "GET" && !req.url.startsWith("/api/") && servirFront(req.url)) {
      return (reply as unknown as { sendFile: (f: string) => unknown }).sendFile("index.html");
    }
    reply.status(404).send({ erro: "RotaNaoEncontrada", mensagem: `Rota ${req.method} ${req.url.split("?")[0]} nao existe.` });
  });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; validation?: unknown; code?: string };

    if (e.validation) return reply.status(400).send({ erro: "ErroValidacao", mensagem: e.message });
    if (e instanceof ErroValidacao) return reply.status(400).send({ erro: "ErroValidacao", mensagem: e.message });
    if (e instanceof ErroNaoAutenticado) return reply.status(401).send({ erro: "NaoAutenticado", mensagem: e.message });
    if (e instanceof ErroPermissao) return reply.status(403).send({ erro: "ErroPermissao", mensagem: e.message });
    if (e instanceof ErroNaoEncontrado) return reply.status(404).send({ erro: "NaoEncontrado", mensagem: e.message });
    if (e instanceof ErroConflito) return reply.status(409).send({ erro: "Conflito", mensagem: e.message });
    if (e instanceof ErroGateway) return reply.status(502).send({ erro: "GatewayIndisponivel", mensagem: e.message });
    if (e instanceof ErroMuitasTentativas) return reply.status(429).send({ erro: "MuitasTentativas", mensagem: e.message });

    // Violacoes de restricao do banco (a ultima barreira de integridade).
    if (e.code === "P2002") return reply.status(409).send({ erro: "Conflito", mensagem: "Registro duplicado (restricao de unicidade do banco)." });
    if (e.code === "P2025") return reply.status(404).send({ erro: "NaoEncontrado", mensagem: "Registro nao encontrado." });
    if (e.code === "P2003") return reply.status(409).send({ erro: "Conflito", mensagem: "Operacao viola uma relacao entre registros." });
    if (/violates check constraint|e imutavel/.test(e.message ?? "")) {
      return reply.status(409).send({ erro: "Conflito", mensagem: "Operacao rejeitada por uma restricao de integridade do banco." });
    }

    // Erros com statusCode proprio do Fastify/plugins (JSON invalido, payload grande, rate limit etc.).
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      const nome = e.statusCode === 429 ? "MuitasTentativas" : e.statusCode === 413 ? "ArquivoGrande" : "RequisicaoInvalida";
      const msg = e.statusCode === 429 ? "Muitas requisicoes. Aguarde um instante e tente novamente." : e.statusCode === 413 ? "O arquivo excede o tamanho maximo permitido." : e.message;
      return reply.status(e.statusCode).send({ erro: nome, mensagem: msg });
    }

    req.log.error(err);
    return reply.status(500).send({ erro: "ErroInterno", mensagem: "Erro interno do servidor." });
  });
}
