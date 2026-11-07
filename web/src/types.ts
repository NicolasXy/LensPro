// spiderman
export type Papel = "admin" | "fotografo" | "comprador";

export interface Usuario {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  versao: number;
  criadoEm: string;
  nomeArtistico?: string | null;
}

export interface PerfilPrivado {
  nomeArtistico: string;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  especialidade: string | null;
  pixMascara: string | null;
  pagbankContaId: string | null;
  versao: number;
}

export interface Foto {
  id: string;
  titulo: string;
  descricao: string | null;
  tags: string[];
  precoCentavos: number;
  largura: number;
  altura: number;
  criadoEm: string;
  fotografo: { id: string; nome: string };
  evento: { id: string; titulo: string } | null;
  urlPreview: string;
  urlMiniatura: string;
}

export interface FotoGerenciavel extends Foto {
  status: "publicada" | "oculta" | "removida";
  versao: number;
  formato: string;
  bytesOriginal: number;
  vendas: number;
}

export interface Evento {
  id: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  dataEvento: string;
  ativo: boolean;
  versao: number;
  totalFotos: number;
  fotografo: { id: string; nome: string };
  urlCapa: string | null;
}

export interface PerfilPublico {
  id: string;
  nomeArtistico: string;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  especialidade: string | null;
  totalFotos: number;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  totalPaginas: number;
}

export interface Pagamento {
  id: string;
  metodo: "pix" | "cartao";
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  valorCentavos: number;
  pixCopiaECola: string | null;
  cartaoBandeira: string | null;
  cartaoFinal: string | null;
  motivoRecusa: string | null;
  criadoEm: string;
}

export interface Pedido {
  id: string;
  status: "pendente" | "pago" | "cancelado" | "expirado";
  totalCentavos: number;
  expiraEm: string;
  pagoEm: string | null;
  criadoEm: string;
  itens: { id: string; precoCentavos: number; foto: Foto }[];
  pagamentos: Pagamento[];
}

export interface Compra {
  itemId: string;
  pedidoId: string;
  pagoEm: string | null;
  precoCentavos: number;
  downloads: number;
  foto: Foto;
}

export interface Destaques {
  destaques: Foto[];
  rotativas: Foto[];
  estatisticas: { fotos: number; fotografos: number; eventos: number };
}
