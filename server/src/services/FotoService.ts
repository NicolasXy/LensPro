// spiderman
import { randomUUID } from "crypto";
import { UnidadeDeTrabalho } from "../db/unidadeDeTrabalho";
import { Armazenamento } from "../core/armazenamento";
import { sha256Hex } from "../core/crypto";
import { gerarVersoesMarcadas } from "../core/marcaDagua";
import { normalizarTags, textoOpcional, validarPreco } from "../core/validadores";
import { FiltroFoto, FotoCompleta } from "../repositories/FotoRepository";
import { StatusFoto } from "../generated/prisma/enums";
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from "../errors";
import { Ator, FotoPublica, Paginacao, Pagina, fotoPublica, paraSkipTake, versaoEfetiva } from "./tipos";

/** Foto como o dono (fotografo) e o admin veem: inclui status, versao e vendas. */
export interface FotoGerenciavel extends FotoPublica {
  status: StatusFoto;
  versao: number;
  formato: string;
  bytesOriginal: number;
  vendas: number;
}

export interface DadosNovaFoto {
  titulo: string;
  descricao?: string | null;
  tags?: string[];
  precoCentavos: number;
  eventoId?: string | null;
}

export interface DadosEdicaoFoto {
  titulo?: string;
  descricao?: string | null;
  tags?: string[];
  precoCentavos?: number;
  eventoId?: string | null;
  status?: "publicada" | "oculta";
  versao?: number;
}

function gerenciavel(f: FotoCompleta, vendas: number): FotoGerenciavel {
  return { ...fotoPublica(f), status: f.status, versao: f.versao, formato: f.formato, bytesOriginal: f.bytesOriginal, vendas };
}

/**
 * Regras das fotos. O ponto central de seguranca: o ORIGINAL entra no
 * sistema e e imediatamente cifrado (AES-256-GCM) em disco; so os
 * previews COM MARCA D'AGUA tem URL publica. O original so sai pelo
 * CompraService, para quem pagou.
 */
export class FotoService {
  private cacheHome: { valor: Awaited<ReturnType<FotoService["destaquesDaHome"]>>; ate: number } | null = null;

  constructor(private readonly uow: UnidadeDeTrabalho, private readonly arquivos: Armazenamento) {}

  async publicar(ator: Ator, dados: DadosNovaFoto, arquivo: Buffer): Promise<FotoGerenciavel> {
    this.cacheHome = null; // a home reflete a mudanca imediatamente
    const titulo = (dados.titulo ?? "").trim();
    if (titulo.length < 3 || titulo.length > 150) throw new ErroValidacao("O titulo deve ter entre 3 e 150 caracteres.");
    const precoCentavos = validarPreco(dados.precoCentavos);
    const descricao = textoOpcional(dados.descricao, "Descricao", 1000);
    const tags = normalizarTags(dados.tags);
    if (!arquivo || arquivo.length === 0) throw new ErroValidacao("Envie o arquivo da foto.");

    if (dados.eventoId) {
      const ev = await this.uow.simples().eventos.buscarPorId(dados.eventoId);
      if (!ev || ev.fotografoId !== ator.id) throw new ErroValidacao("Evento invalido: escolha um dos seus eventos.");
    }

    // Decodifica de verdade a imagem (rejeita arquivos disfarcados) e gera as versoes marcadas.
    const perfil = await this.uow.simples().perfis.buscar(ator.id);
    const versoes = await gerarVersoesMarcadas(arquivo, perfil?.nomeArtistico ?? ator.nome);
    const id = randomUUID();
    await this.arquivos.salvarOriginal(id, arquivo);
    await this.arquivos.salvarPreviews(id, versoes.preview, versoes.miniatura);
    try {
      return await this.uow.transacao(async (r) => {
        const f = await r.fotos.criar({
          id,
          fotografoId: ator.id,
          eventoId: dados.eventoId ?? null,
          titulo,
          descricao,
          tags,
          precoCentavos,
          largura: versoes.largura,
          altura: versoes.altura,
          bytesOriginal: arquivo.length,
          formato: versoes.formato,
          sha256Original: sha256Hex(arquivo),
        });
        await r.auditoria.registrar(ator.id, "FOTO_PUBLICADA", { fotoId: id, precoCentavos });
        return gerenciavel(f, 0);
      });
    } catch (e) {
      // Se o banco recusar, nao deixamos arquivos orfaos em disco.
      await this.arquivos.remover(id).catch(() => undefined);
      throw e;
    }
  }

  // ---------- Vitrine publica ----------

  async listarPublicas(filtro: Omit<FiltroFoto, "vitrine" | "status">, pag: Paginacao): Promise<Pagina<FotoPublica>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().fotos.listar({ ...filtro, vitrine: true }, skip, take);
    return { itens: r.itens.map(fotoPublica), total: r.total };
  }

  async obterPublica(id: string): Promise<FotoPublica> {
    const f = await this.uow.simples().fotos.buscarPorId(id);
    if (!f || f.status !== "publicada" || !(await this.fotografoAtivo(f.fotografoId))) throw new ErroNaoEncontrado("Foto nao encontrada.");
    return fotoPublica(f);
  }

  private async fotografoAtivo(id: string): Promise<boolean> {
    const u = await this.uow.simples().usuarios.buscarPorId(id);
    return !!u && u.ativo;
  }

  /**
   * Conteudo dinamico da home. "Em destaque" = fotos mais vendidas (desempate: mais recentes);
   * "rotativas" = as mais recentes. Nos dois grupos escolhemos em rodizio entre fotografos
   * (nenhum domina a vitrine). Resultado em cache por 60 s: a home e a pagina mais acessada.
   */
  async destaquesDaHome(): Promise<{ destaques: FotoPublica[]; rotativas: FotoPublica[]; estatisticas: { fotos: number; fotografos: number; eventos: number } }> {
    if (this.cacheHome && this.cacheHome.ate > Date.now()) return this.cacheHome.valor;
    const r = this.uow.simples().fotos;
    const [candidatas, estatisticas] = await Promise.all([r.candidatasDestaque(120), r.estatisticasVitrine()]);
    const rodizio = (lista: typeof candidatas, n: number) => {
      const porFotografo = new Map<string, typeof candidatas>();
      for (const c of lista) porFotografo.set(c.foto.fotografoId, [...(porFotografo.get(c.foto.fotografoId) ?? []), c]);
      const filas = Array.from(porFotografo.values());
      const saida: typeof candidatas = [];
      for (let i = 0; saida.length < n && filas.some((f) => f.length > i); i++) {
        for (const fila of filas) if (fila[i] && saida.length < n) saida.push(fila[i]);
      }
      return saida;
    };
    const maisVendidas = [...candidatas].sort((a, b) => b.vendas - a.vendas || b.foto.criadoEm.getTime() - a.foto.criadoEm.getTime());
    const valor = {
      destaques: rodizio(maisVendidas, 8).map((c) => fotoPublica(c.foto)),
      rotativas: rodizio(candidatas, 10).map((c) => fotoPublica(c.foto)),
      estatisticas,
    };
    this.cacheHome = { valor, ate: Date.now() + 60_000 };
    return valor;
  }

  tagsPopulares(): Promise<string[]> {
    return this.uow.simples().fotos.tagsPopulares(20);
  }

  /** Preview marcado: nunca o original. Fotos removidas (moderacao) deixam de ser servidas. */
  async lerPreview(id: string, tamanho: "grande" | "mini"): Promise<Buffer> {
    const f = await this.uow.simples().fotos.buscarPorId(id);
    if (!f || f.status === "removida") throw new ErroNaoEncontrado("Foto nao encontrada.");
    const buf = await this.arquivos.lerPreview(id, tamanho);
    if (!buf) throw new ErroNaoEncontrado("Foto nao encontrada.");
    return buf;
  }

  // ---------- Estudio do fotografo ----------

  private async comVendas(itens: FotoCompleta[]): Promise<FotoGerenciavel[]> {
    const vendas = await this.uow.simples().fotos.vendasPorFoto(itens.map((i) => i.id));
    return itens.map((f) => gerenciavel(f, vendas.get(f.id) ?? 0));
  }

  async listarDoFotografo(ator: Ator, filtro: { status?: "publicada" | "oculta"; q?: string; eventoId?: string }, pag: Paginacao): Promise<Pagina<FotoGerenciavel>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().fotos.listar({ ...filtro, fotografoId: ator.id }, skip, take);
    // Fotos "removidas" (arquivadas por venda anterior ou moderacao) nao aparecem na gestao.
    const visiveis = filtro.status ? r.itens : r.itens.filter((f) => f.status !== "removida");
    return { itens: await this.comVendas(visiveis), total: r.total };
  }

  async atualizar(ator: Ator, id: string, d: DadosEdicaoFoto): Promise<FotoGerenciavel> {
    this.cacheHome = null; // a home reflete a mudanca imediatamente
    const mudancas: Record<string, unknown> = {};
    if (d.titulo !== undefined) {
      const t = d.titulo.trim();
      if (t.length < 3 || t.length > 150) throw new ErroValidacao("O titulo deve ter entre 3 e 150 caracteres.");
      mudancas.titulo = t;
    }
    if (d.descricao !== undefined) mudancas.descricao = textoOpcional(d.descricao, "Descricao", 1000);
    if (d.tags !== undefined) mudancas.tags = normalizarTags(d.tags);
    if (d.precoCentavos !== undefined) mudancas.precoCentavos = validarPreco(d.precoCentavos);
    if (d.status !== undefined) mudancas.status = d.status;
    const atualizada = await this.uow.transacao(async (r) => {
      const f = await r.fotos.buscarPorId(id);
      if (!f || f.fotografoId !== ator.id || f.status === "removida") throw new ErroNaoEncontrado("Foto nao encontrada.");
      if (d.eventoId !== undefined) {
        if (d.eventoId !== null) {
          const ev = await r.eventos.buscarPorId(d.eventoId);
          if (!ev || ev.fotografoId !== ator.id) throw new ErroValidacao("Evento invalido: escolha um dos seus eventos.");
        }
        mudancas.eventoId = d.eventoId;
      }
      const nova = await r.fotos.atualizarComVersao(id, versaoEfetiva(d.versao, f.versao), mudancas);
      // Preco novo vale so para compras futuras: os pedidos guardam o preco da epoca (snapshot).
      await r.auditoria.registrar(ator.id, "FOTO_ATUALIZADA", { fotoId: id, precoAnterior: f.precoCentavos, precoNovo: nova.precoCentavos });
      return nova;
    });
    return (await this.comVendas([atualizada]))[0];
  }

  /**
   * Exclusao pelo fotografo. Foto SEM vendas: apagada de verdade (registro e
   * arquivos). Foto JA VENDIDA: arquivada (status "removida"), porque quem
   * comprou continua tendo direito de baixar o original.
   */
  async excluir(ator: Ator, id: string): Promise<"definitiva" | "arquivada"> {
    this.cacheHome = null; // a home reflete a mudanca imediatamente
    const modo = await this.uow.transacao(async (r) => {
      const f = await r.fotos.buscarPorId(id);
      if (!f || f.fotografoId !== ator.id || f.status === "removida") throw new ErroNaoEncontrado("Foto nao encontrada.");
      await r.fotos.bloquear(id);
      const vendida = (await r.fotos.contarVendas(id)) > 0;
      if (vendida) {
        await r.fotos.atualizarComVersao(id, f.versao, { status: "removida" });
      } else {
        await r.fotos.excluir(id);
      }
      await r.auditoria.registrar(ator.id, "FOTO_EXCLUIDA", { fotoId: id, modo: vendida ? "arquivada" : "definitiva" });
      return vendida ? ("arquivada" as const) : ("definitiva" as const);
    });
    if (modo === "definitiva") await this.arquivos.remover(id).catch(() => undefined);
    return modo;
  }

  // ---------- Moderacao (admin) ----------

  async listarTodas(filtro: { status?: StatusFoto; q?: string }, pag: Paginacao): Promise<Pagina<FotoGerenciavel>> {
    const { skip, take } = paraSkipTake(pag);
    const r = await this.uow.simples().fotos.listar(filtro, skip, take);
    return { itens: await this.comVendas(r.itens), total: r.total };
  }

  async removerPeloAdmin(ator: Ator, id: string, motivo?: string): Promise<FotoGerenciavel> {
    this.cacheHome = null; // a home reflete a mudanca imediatamente
    const nova = await this.uow.transacao(async (r) => {
      const f = await r.fotos.buscarPorId(id);
      if (!f) throw new ErroNaoEncontrado("Foto nao encontrada.");
      if (f.status === "removida") throw new ErroConflito("A foto ja esta removida.");
      const n = await r.fotos.atualizarComVersao(id, f.versao, { status: "removida" });
      await r.auditoria.registrar(ator.id, "FOTO_REMOVIDA_PELO_ADMIN", { fotoId: id, motivo: (motivo ?? "").slice(0, 200) });
      return n;
    });
    return (await this.comVendas([nova]))[0];
  }

  async restaurarPeloAdmin(ator: Ator, id: string): Promise<FotoGerenciavel> {
    this.cacheHome = null; // a home reflete a mudanca imediatamente
    const nova = await this.uow.transacao(async (r) => {
      const f = await r.fotos.buscarPorId(id);
      if (!f) throw new ErroNaoEncontrado("Foto nao encontrada.");
      if (f.status !== "removida") throw new ErroConflito("A foto nao esta removida.");
      const n = await r.fotos.atualizarComVersao(id, f.versao, { status: "oculta" });
      await r.auditoria.registrar(ator.id, "FOTO_RESTAURADA_PELO_ADMIN", { fotoId: id });
      return n;
    });
    return (await this.comVendas([nova]))[0];
  }
}
