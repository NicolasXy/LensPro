// spiderman
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../services/AuthService";
import { FotoService } from "../services/FotoService";
import { PainelService } from "../services/PainelService";
import { AuditoriaService, ContatoService } from "../services/ContatoService";
import { Papel, StatusFoto } from "../generated/prisma/enums";
import { Pag, lerPaginacao, paginado } from "./util";

/** Area do administrador: usuarios, moderacao de fotos, auditoria e indicadores. */
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly fotos: FotoService,
    private readonly painel: PainelService,
    private readonly auditoria: AuditoriaService,
    private readonly contatos: ContatoService
  ) {}

  resumo = async () => this.painel.resumoAdmin();

  listarUsuarios = async (req: FastifyRequest<{ Querystring: Pag & { papel?: Papel; q?: string } }>) => {
    const p = lerPaginacao(req.query);
    return paginado(await this.auth.listar({ papel: req.query.papel, q: req.query.q }, p), p);
  };

  criarUsuario = async (
    req: FastifyRequest<{ Body: { nome: string; sobrenome: string; email: string; senha: string; papel: Papel; nomeArtistico?: string } }>,
    reply: FastifyReply
  ) => {
    const { papel, ...resto } = req.body;
    // "tipo" so importa para o cadastro publico; aqui o papel vem explicito.
    return reply.status(201).send(await this.auth.criarPeloAdmin(req.ator, { ...resto, tipo: "comprador", papel }));
  };

  alterarAtivo = async (req: FastifyRequest<{ Params: { id: string }; Body: { ativo: boolean; versao?: number } }>) =>
    this.auth.alterarAtivo(req.ator, req.params.id, req.body.ativo, req.body.versao);

  renomear = async (req: FastifyRequest<{ Params: { id: string }; Body: { nome: string; sobrenome: string; versao?: number } }>) =>
    this.auth.renomear(req.ator, req.params.id, req.body);

  redefinirSenha = async (req: FastifyRequest<{ Params: { id: string }; Body: { novaSenha: string } }>, reply: FastifyReply) => {
    await this.auth.redefinirSenhaPeloAdmin(req.ator, req.params.id, req.body.novaSenha);
    return reply.status(204).send();
  };

  listarFotos = async (req: FastifyRequest<{ Querystring: Pag & { status?: StatusFoto; q?: string } }>) => {
    const p = lerPaginacao(req.query, 24);
    return paginado(await this.fotos.listarTodas({ status: req.query.status, q: req.query.q }, p), p);
  };

  removerFoto = async (req: FastifyRequest<{ Params: { id: string }; Body: { motivo?: string } | undefined }>) =>
    this.fotos.removerPeloAdmin(req.ator, req.params.id, req.body?.motivo);

  restaurarFoto = async (req: FastifyRequest<{ Params: { id: string } }>) => this.fotos.restaurarPeloAdmin(req.ator, req.params.id);

  auditoriaLista = async (req: FastifyRequest<{ Querystring: Pag & { acao?: string; usuarioId?: string } }>) => {
    const p = lerPaginacao(req.query, 50);
    return paginado(await this.auditoria.listar({ acao: req.query.acao, usuarioId: req.query.usuarioId }, p), p);
  };

  mensagens = async (req: FastifyRequest<{ Querystring: Pag }>) => {
    const p = lerPaginacao(req.query);
    return paginado(await this.contatos.listar(p), p);
  };
}
