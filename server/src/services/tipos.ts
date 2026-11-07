// spiderman
import { urlsDaFoto } from "../core/urlAssinada";
import { Papel } from "../generated/prisma/enums";
import { FotoCompleta } from "../repositories/FotoRepository";

/** Usuario autenticado que executa a operacao (extraido do JWT e confirmado no banco). */
export interface Ator {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
}

/** Parametros de paginacao ja normalizados. */
export interface Paginacao {
  pagina: number;
  tamanhoPagina: number;
}

export function paraSkipTake(p: Paginacao): { skip: number; take: number } {
  return { skip: (p.pagina - 1) * p.tamanhoPagina, take: p.tamanhoPagina };
}

/**
 * Define qual versao usar no controle otimista: a informada pelo cliente
 * (garante que ele esta agindo sobre o dado que viu) ou, se omitida, a
 * versao lida dentro da propria transacao (protege apenas contra corrida
 * entre leitura e escrita da mesma requisicao).
 */
export function versaoEfetiva(informada: number | undefined, atual: number): number {
  return informada ?? atual;
}

/** Nome exibido de um fotografo: nome artistico, ou nome e sobrenome se nao houver. */
export function nomeExibicao(f: { nome: string; sobrenome: string; perfil?: { nomeArtistico: string } | null }): string {
  return f.perfil?.nomeArtistico ?? `${f.nome} ${f.sobrenome}`;
}

/** Foto como a vitrine publica ve: NUNCA inclui caminhos de arquivo nem o original, so URLs dos previews marcados. */
export interface FotoPublica {
  id: string;
  titulo: string;
  descricao: string | null;
  tags: string[];
  precoCentavos: number;
  largura: number;
  altura: number;
  criadoEm: Date;
  fotografo: { id: string; nome: string };
  evento: { id: string; titulo: string } | null;
  urlPreview: string;
  urlMiniatura: string;
}

export function fotoPublica(f: FotoCompleta): FotoPublica {
  return {
    id: f.id,
    titulo: f.titulo,
    descricao: f.descricao,
    tags: f.tags,
    precoCentavos: f.precoCentavos,
    largura: f.largura,
    altura: f.altura,
    criadoEm: f.criadoEm,
    fotografo: { id: f.fotografo.id, nome: nomeExibicao(f.fotografo) },
    evento: f.evento ? { id: f.evento.id, titulo: f.evento.titulo } : null,
    ...urlsDaFoto(f.id),
  };
}

/** Resposta paginada padrao. */
export interface Pagina<T> {
  itens: T[];
  total: number;
}
