// spiderman
import { FastifyInstance, RouteHandlerMethod } from "fastify";
import { permitir } from "../plugins/autenticacao";
import { AuthController } from "../controllers/AuthController";
import { CatalogoController } from "../controllers/CatalogoController";
import { EstudioController } from "../controllers/EstudioController";
import { CompraController } from "../controllers/CompraController";
import { AdminController } from "../controllers/AdminController";
import { schemaId, schemaPaginacao } from "../controllers/util";

export interface Controladores {
  auth: AuthController;
  catalogo: CatalogoController;
  estudio: EstudioController;
  compra: CompraController;
  admin: AdminController;
}

const uuid = { type: "string", format: "uuid" } as const;
const senhaSchema = { type: "string", minLength: 8, maxLength: 72 } as const;
const emailSchema = { type: "string", minLength: 5, maxLength: 150 } as const;
const versao = { type: "integer", minimum: 1 } as const;

/**
 * Todas as rotas da API (prefixo /api/v1), com o JSON Schema de entrada que
 * o Fastify valida ANTES de chamar o controller. O acesso por papel e
 * imposto em hooks `onRequest` de rota (permitir(...)), que rodam antes da
 * validacao do corpo: quem nao pode, recebe 403 sem sequer ver erros de validacao.
 */
export async function registrarRotas(app: FastifyInstance, controladores: Controladores, opcoes: { limiteAuth: number }): Promise<void> {
  // Os handlers tipados por rota (Body/Params/Querystring) sao compativeis com o schema registrado;
  // aqui os tratamos como handlers genericos do Fastify (a validacao real e feita pelo JSON Schema).
  const c = controladores as unknown as { [K in keyof Controladores]: Record<string, RouteHandlerMethod> };
  const publica = { publica: true };
  // Limite por IP nas rotas sensiveis a forca bruta/abuso (desligado quando 0, nos testes).
  const limitada = (max: number, ehPublica = true) => {
    const base = { publica: ehPublica };
    return opcoes.limiteAuth > 0 ? { ...base, rateLimit: { max, timeWindow: "1 minute" } } : base;
  };
  const so = (...p: Parameters<typeof permitir>) => ({ onRequest: [permitir(...p)] });
  const tag = (t: string) => ({ tags: [t] });

  // ---------------- Saude ----------------
  app.get("/health", { config: publica, schema: { ...tag("Sistema"), summary: "Verifica se a API esta no ar" } }, async () => ({ status: "ok" }));

  // ---------------- Autenticacao e conta ----------------
  app.post(
    "/auth/cadastro",
    {
      config: limitada(opcoes.limiteAuth),
      schema: {
        ...tag("Autenticacao"),
        summary: "Cria conta de comprador ou fotografo e ja devolve o token",
        body: {
          type: "object",
          required: ["nome", "sobrenome", "email", "senha", "tipo"],
          properties: {
            nome: { type: "string", minLength: 1, maxLength: 100 },
            sobrenome: { type: "string", minLength: 1, maxLength: 100 },
            email: emailSchema,
            senha: senhaSchema,
            tipo: { type: "string", enum: ["comprador", "fotografo"] },
            nomeArtistico: { type: "string", maxLength: 100 },
          },
        },
      },
    },
    c.auth.cadastro
  );
  app.post(
    "/auth/login",
    {
      config: limitada(opcoes.limiteAuth),
      schema: {
        ...tag("Autenticacao"),
        summary: "Login: devolve JWT (30 min)",
        body: { type: "object", required: ["email", "senha"], properties: { email: emailSchema, senha: { type: "string", minLength: 1, maxLength: 200 } } },
      },
    },
    c.auth.login
  );
  app.post(
    "/auth/recuperar-senha",
    {
      config: limitada(Math.max(3, Math.floor(opcoes.limiteAuth / 4))),
      schema: { ...tag("Autenticacao"), summary: "Pede o link de recuperacao (resposta sempre igual)", body: { type: "object", required: ["email"], properties: { email: emailSchema } } },
    },
    c.auth.recuperar
  );
  app.post(
    "/auth/redefinir-senha",
    {
      config: limitada(opcoes.limiteAuth),
      schema: {
        ...tag("Autenticacao"),
        summary: "Define a nova senha com o token do link",
        body: { type: "object", required: ["token", "novaSenha"], properties: { token: { type: "string", minLength: 20, maxLength: 100 }, novaSenha: senhaSchema } },
      },
    },
    c.auth.redefinir
  );
  app.post("/auth/sair", { config: publica, schema: { ...tag("Conta"), summary: "Encerra a sessao do navegador (apaga o cookie HttpOnly)" } }, c.auth.sair);
  app.post("/auth/renovar", { config: limitada(120, false), schema: { ...tag("Conta"), summary: "Renova o token (sessao deslizante de 30 min por inatividade)" } }, c.auth.renovar);
  app.get("/auth/eu", { schema: { ...tag("Conta"), summary: "Dados da conta logada (e perfil, se fotografo)" } }, c.auth.eu);
  app.patch(
    "/auth/eu",
    {
      schema: {
        ...tag("Conta"),
        summary: "Altera nome e sobrenome",
        body: { type: "object", properties: { nome: { type: "string", maxLength: 100 }, sobrenome: { type: "string", maxLength: 100 }, versao } },
      },
    },
    c.auth.atualizarEu
  );
  app.put(
    "/auth/senha",
    {
      config: limitada(10, false),
      schema: {
        ...tag("Conta"),
        summary: "Troca a propria senha",
        body: { type: "object", required: ["senhaAtual", "novaSenha"], properties: { senhaAtual: { type: "string", maxLength: 200 }, novaSenha: senhaSchema } },
      },
    },
    c.auth.alterarSenha
  );
  app.post(
    "/contato",
    {
      config: limitada(5),
      schema: {
        ...tag("Contato"),
        summary: "Formulario Fale conosco",
        body: {
          type: "object",
          required: ["nome", "email", "mensagem"],
          properties: {
            nome: { type: "string", maxLength: 100 },
            email: emailSchema,
            mensagem: { type: "string", maxLength: 3000 },
            site: { type: "string", maxLength: 200, description: "Campo-isca anti-robo: deve ficar vazio." },
          },
        },
      },
    },
    c.auth.contatar
  );

  // ---------------- Vitrine publica ----------------
  app.get(
    "/fotos",
    {
      config: publica,
      schema: {
        ...tag("Vitrine"),
        summary: "Lista fotos publicadas (somente previews com marca d'agua)",
        querystring: {
          type: "object",
          properties: {
            ...schemaPaginacao,
            q: { type: "string", maxLength: 100 },
            tag: { type: "string", maxLength: 30 },
            eventoId: uuid,
            fotografoId: uuid,
            ordem: { type: "string", enum: ["recentes", "preco_asc", "preco_desc"] },
            precoMin: { type: "integer", minimum: 0 },
            precoMax: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    c.catalogo.listarFotos
  );
  app.get("/destaques", { config: publica, schema: { ...tag("Vitrine"), summary: "Home: trabalhos em destaque, fotos rotativas e numeros da vitrine" } }, c.catalogo.destaques);
  app.get("/fotos/tags", { config: publica, schema: { ...tag("Vitrine"), summary: "Tags mais usadas" } }, c.catalogo.tags);
  app.get("/fotos/:id", { config: publica, schema: { ...tag("Vitrine"), summary: "Detalhe publico da foto", params: schemaId } }, c.catalogo.obterFoto);
  app.get("/fotos/:id/preview", { config: limitada(600), schema: { ...tag("Vitrine"), summary: "Preview com marca d'agua (JPEG ate 1200 px); exige URL assinada (?e=&s=) obtida na listagem", params: schemaId, querystring: { type: "object", properties: { e: { type: "integer" }, s: { type: "string", maxLength: 64 } } } } }, c.catalogo.preview);
  app.get("/fotos/:id/miniatura", { config: limitada(900), schema: { ...tag("Vitrine"), summary: "Miniatura com marca d'agua (480 px); exige URL assinada", params: schemaId, querystring: { type: "object", properties: { e: { type: "integer" }, s: { type: "string", maxLength: 64 } } } } }, c.catalogo.miniatura);
  app.get(
    "/eventos",
    { config: publica, schema: { ...tag("Vitrine"), summary: "Lista eventos ativos", querystring: { type: "object", properties: { ...schemaPaginacao, q: { type: "string", maxLength: 100 } } } } },
    c.catalogo.listarEventos
  );
  app.get("/eventos/:id", { config: publica, schema: { ...tag("Vitrine"), summary: "Detalhe do evento", params: schemaId } }, c.catalogo.obterEvento);
  app.get(
    "/fotografos",
    { config: publica, schema: { ...tag("Vitrine"), summary: "Lista fotografos", querystring: { type: "object", properties: { ...schemaPaginacao, q: { type: "string", maxLength: 100 } } } } },
    c.catalogo.listarFotografos
  );
  app.get("/fotografos/:id", { config: publica, schema: { ...tag("Vitrine"), summary: "Perfil publico do fotografo", params: schemaId } }, c.catalogo.obterFotografo);

  // ---------------- Estudio (fotografo) ----------------
  const E = so("fotografo");
  app.get("/estudio/resumo", { ...E, schema: { ...tag("Estudio"), summary: "Indicadores do fotografo" } }, c.estudio.resumo);
  app.get("/estudio/vendas", { ...E, schema: { ...tag("Estudio"), summary: "Vendas (com o liquido apos a taxa)", querystring: { type: "object", properties: schemaPaginacao } } }, c.estudio.vendas);
  app.put(
    "/estudio/perfil",
    {
      ...E,
      schema: {
        ...tag("Estudio"),
        summary: "Atualiza o perfil publico, a chave Pix (guardada cifrada) e a conta PagBank que recebe a parte do fotografo (split)",
        body: {
          type: "object",
          properties: {
            nomeArtistico: { type: "string", maxLength: 100 },
            bio: { type: ["string", "null"], maxLength: 1000 },
            cidade: { type: ["string", "null"], maxLength: 80 },
            estado: { type: ["string", "null"], maxLength: 2 },
            especialidade: { type: ["string", "null"], maxLength: 80 },
            pixChave: { type: ["string", "null"], maxLength: 77 },
            pagbankContaId: { type: ["string", "null"], maxLength: 41 },
            versao,
          },
        },
      },
    },
    c.auth.atualizarPerfil
  );
  app.post(
    "/estudio/fotos",
    {
      ...E,
      schema: {
        ...tag("Estudio"),
        summary: "Publica uma foto (multipart: arquivo, titulo, precoCentavos, descricao, tags, eventoId). Gera preview com marca d'agua e cifra o original.",
        consumes: ["multipart/form-data"],
      },
    },
    c.estudio.publicarFoto
  );
  app.get(
    "/estudio/fotos",
    {
      ...E,
      schema: {
        ...tag("Estudio"),
        summary: "Minhas fotos",
        querystring: { type: "object", properties: { ...schemaPaginacao, status: { type: "string", enum: ["publicada", "oculta"] }, q: { type: "string", maxLength: 100 }, eventoId: uuid } },
      },
    },
    c.estudio.listarFotos
  );
  app.patch(
    "/estudio/fotos/:id",
    {
      ...E,
      schema: {
        ...tag("Estudio"),
        summary: "Edita titulo, preco, tags, evento ou visibilidade",
        params: schemaId,
        body: {
          type: "object",
          properties: {
            titulo: { type: "string", maxLength: 150 },
            descricao: { type: ["string", "null"], maxLength: 1000 },
            tags: { type: "array", items: { type: "string", maxLength: 30 }, maxItems: 20 },
            precoCentavos: { type: "integer" },
            eventoId: { type: ["string", "null"], format: "uuid" },
            status: { type: "string", enum: ["publicada", "oculta"] },
            versao,
          },
        },
      },
    },
    c.estudio.atualizarFoto
  );
  app.delete("/estudio/fotos/:id", { ...E, schema: { ...tag("Estudio"), summary: "Exclui (definitiva sem vendas; arquivada se ja vendida)", params: schemaId } }, c.estudio.excluirFoto);
  app.get("/estudio/eventos", { ...E, schema: { ...tag("Estudio"), summary: "Meus eventos", querystring: { type: "object", properties: schemaPaginacao } } }, c.estudio.listarEventos);
  app.post(
    "/estudio/eventos",
    {
      ...E,
      schema: {
        ...tag("Estudio"),
        summary: "Cria evento",
        body: {
          type: "object",
          required: ["titulo", "dataEvento"],
          properties: {
            titulo: { type: "string", minLength: 3, maxLength: 150 },
            descricao: { type: ["string", "null"], maxLength: 1000 },
            local: { type: ["string", "null"], maxLength: 150 },
            dataEvento: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
        },
      },
    },
    c.estudio.criarEvento
  );
  app.patch(
    "/estudio/eventos/:id",
    {
      ...E,
      schema: {
        ...tag("Estudio"),
        summary: "Edita evento",
        params: schemaId,
        body: {
          type: "object",
          properties: {
            titulo: { type: "string", maxLength: 150 },
            descricao: { type: ["string", "null"], maxLength: 1000 },
            local: { type: ["string", "null"], maxLength: 150 },
            dataEvento: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            ativo: { type: "boolean" },
            versao,
          },
        },
      },
    },
    c.estudio.atualizarEvento
  );
  app.delete("/estudio/eventos/:id", { ...E, schema: { ...tag("Estudio"), summary: "Exclui evento (fotos permanecem)", params: schemaId } }, c.estudio.excluirEvento);

  // ---------------- Compras (comprador) ----------------
  const B = so("comprador");
  app.post(
    "/pedidos",
    {
      ...B,
      schema: {
        ...tag("Compras"),
        summary: "Cria pedido com as fotos do carrinho (precos travados por 30 min)",
        body: { type: "object", required: ["fotoIds"], properties: { fotoIds: { type: "array", items: uuid, minItems: 1, maxItems: 30 } } },
      },
    },
    c.compra.criarPedido
  );
  app.get("/pedidos", { ...B, schema: { ...tag("Compras"), summary: "Meus pedidos", querystring: { type: "object", properties: schemaPaginacao } } }, c.compra.listarPedidos);
  app.get("/pedidos/:id", { ...B, schema: { ...tag("Compras"), summary: "Detalhe do pedido", params: schemaId } }, c.compra.obterPedido);
  app.post("/pedidos/:id/cancelar", { ...B, schema: { ...tag("Compras"), summary: "Cancela pedido pendente", params: schemaId } }, c.compra.cancelarPedido);
  app.post(
    "/pedidos/:id/pagamento",
    {
      ...B,
      config: limitada(15, false),
      schema: {
        ...tag("Pagamento"),
        summary: "Paga com Pix (gera copia e cola) ou cartao (cobranca imediata)",
        params: schemaId,
        body: {
          type: "object",
          required: ["metodo"],
          properties: {
            metodo: { type: "string", enum: ["pix", "cartao"] },
            cpf: { type: "string", maxLength: 14, description: "CPF do pagador (exigido pelo PagSeguro; repassado, nunca gravado)." },
            cartao: {
              type: "object",
              required: ["nome"],
              properties: {
                nome: { type: "string", maxLength: 60 },
                numero: { type: "string", minLength: 13, maxLength: 23, description: "So no gateway simulado." },
                validade: { type: "string", maxLength: 5, description: "So no gateway simulado." },
                cvv: { type: "string", maxLength: 4, description: "So no gateway simulado." },
                criptografado: { type: "string", maxLength: 4000, description: "Cartao cifrado pelo SDK do PagBank (PagSeguro)." },
              },
            },
          },
        },
      },
    },
    c.compra.pagar
  );
  app.get("/pagamento/config", { ...B, schema: { ...tag("Pagamento"), summary: "Gateway ativo e chave publica para cifrar o cartao no navegador (PagSeguro)" } }, c.compra.configuracaoPagamento);
  app.post(
    "/pedidos/:id/pagamento/verificar",
    { ...B, config: limitada(60, false), schema: { ...tag("Pagamento"), summary: "Consulta o gateway e atualiza o pedido (reconciliacao de webhook perdido)", params: schemaId } },
    c.compra.verificarPagamento
  );
  app.post("/pedidos/:id/pagamento/simular-pix", { ...B, schema: { ...tag("Pagamento"), summary: "(Modo simulado) confirma o Pix pendente como se o banco tivesse pago", params: schemaId } }, c.compra.simularPix);
  app.get("/compras", { ...B, schema: { ...tag("Compras"), summary: "Minhas fotos compradas", querystring: { type: "object", properties: schemaPaginacao } } }, c.compra.listarCompras);
  app.get("/compras/:id/download", { ...B, schema: { ...tag("Compras"), summary: "Baixa o ORIGINAL (sem marca d'agua) de uma foto comprada", params: schemaId } }, c.compra.baixar);

  // ---------------- Admin ----------------
  const A = so("admin");
  app.get("/admin/resumo", { ...A, schema: { ...tag("Admin"), summary: "Indicadores da plataforma" } }, c.admin.resumo);
  app.get(
    "/admin/usuarios",
    { ...A, schema: { ...tag("Admin"), summary: "Lista usuarios", querystring: { type: "object", properties: { ...schemaPaginacao, papel: { type: "string", enum: ["admin", "fotografo", "comprador"] }, q: { type: "string", maxLength: 100 } } } } },
    c.admin.listarUsuarios
  );
  app.post(
    "/admin/usuarios",
    {
      ...A,
      schema: {
        ...tag("Admin"),
        summary: "Cria usuario com qualquer papel",
        body: {
          type: "object",
          required: ["nome", "sobrenome", "email", "senha", "papel"],
          properties: {
            nome: { type: "string", maxLength: 100 },
            sobrenome: { type: "string", maxLength: 100 },
            email: emailSchema,
            senha: senhaSchema,
            papel: { type: "string", enum: ["admin", "fotografo", "comprador"] },
            nomeArtistico: { type: "string", maxLength: 100 },
          },
        },
      },
    },
    c.admin.criarUsuario
  );
  app.patch("/admin/usuarios/:id/ativo", { ...A, schema: { ...tag("Admin"), summary: "Ativa/desativa conta (vale na hora)", params: schemaId, body: { type: "object", required: ["ativo"], properties: { ativo: { type: "boolean" }, versao } } } }, c.admin.alterarAtivo);
  app.patch(
    "/admin/usuarios/:id",
    { ...A, schema: { ...tag("Admin"), summary: "Altera nome do usuario", params: schemaId, body: { type: "object", required: ["nome", "sobrenome"], properties: { nome: { type: "string", maxLength: 100 }, sobrenome: { type: "string", maxLength: 100 }, versao } } } },
    c.admin.renomear
  );
  app.put("/admin/usuarios/:id/senha", { ...A, schema: { ...tag("Admin"), summary: "Redefine a senha de um usuario", params: schemaId, body: { type: "object", required: ["novaSenha"], properties: { novaSenha: senhaSchema } } } }, c.admin.redefinirSenha);
  app.get(
    "/admin/fotos",
    { ...A, schema: { ...tag("Admin"), summary: "Todas as fotos (moderacao)", querystring: { type: "object", properties: { ...schemaPaginacao, status: { type: "string", enum: ["publicada", "oculta", "removida"] }, q: { type: "string", maxLength: 100 } } } } },
    c.admin.listarFotos
  );
  app.post("/admin/fotos/:id/remover", { ...A, schema: { ...tag("Admin"), summary: "Remove foto da vitrine (compradores mantem o acesso)", params: schemaId, body: { type: ["object", "null"], properties: { motivo: { type: "string", maxLength: 200 } } } } }, c.admin.removerFoto);
  app.post("/admin/fotos/:id/restaurar", { ...A, schema: { ...tag("Admin"), summary: "Restaura foto removida (volta oculta)", params: schemaId } }, c.admin.restaurarFoto);
  app.get("/admin/auditoria", { ...A, schema: { ...tag("Admin"), summary: "Trilha de auditoria", querystring: { type: "object", properties: { ...schemaPaginacao, acao: { type: "string", maxLength: 60 }, usuarioId: uuid } } } }, c.admin.auditoriaLista);
  app.get("/admin/mensagens", { ...A, schema: { ...tag("Admin"), summary: "Mensagens do Fale conosco", querystring: { type: "object", properties: schemaPaginacao } } }, c.admin.mensagens);

  // ---------------- Webhook do gateway (corpo bruto + assinatura HMAC) ----------------
  await app.register(async (wh) => {
    wh.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 64 * 1024 }, (_req, body, done) => done(null, body));
    wh.post("/pagamentos/webhook/pagseguro", { config: publica, schema: { ...tag("Pagamento"), summary: "Notificacao do PagSeguro (cabecalho x-authenticity-token = SHA-256 de token-corpo)" } }, c.compra.webhookPagSeguro);
    wh.post("/pagamentos/webhook", { config: publica, schema: { ...tag("Pagamento"), summary: "Webhook do gateway (header X-Lenspro-Assinatura = HMAC-SHA256 do corpo)", hide: false } }, c.compra.webhook);
  });
}
