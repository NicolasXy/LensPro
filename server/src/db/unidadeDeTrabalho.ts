// spiderman
import { Db, PrismaClient } from "./prisma";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { PerfilRepository } from "../repositories/PerfilRepository";
import { FotoRepository } from "../repositories/FotoRepository";
import { EventoRepository } from "../repositories/EventoRepository";
import { PedidoRepository } from "../repositories/PedidoRepository";
import { AuditoriaRepository } from "../repositories/AuditoriaRepository";
import { ContatoRepository } from "../repositories/ContatoRepository";

/** Conjunto de repositorios ligados a MESMA conexao/transacao. */
export interface Repositorios {
  usuarios: UsuarioRepository;
  perfis: PerfilRepository;
  fotos: FotoRepository;
  eventos: EventoRepository;
  pedidos: PedidoRepository;
  auditoria: AuditoriaRepository;
  contatos: ContatoRepository;
}

export function criarRepositorios(db: Db): Repositorios {
  return {
    usuarios: new UsuarioRepository(db),
    perfis: new PerfilRepository(db),
    fotos: new FotoRepository(db),
    eventos: new EventoRepository(db),
    pedidos: new PedidoRepository(db),
    auditoria: new AuditoriaRepository(db),
    contatos: new ContatoRepository(db),
  };
}

/**
 * Unidade de trabalho: oferece duas formas de executar codigo de servico.
 *  - `simples`: leitura/operacao unica, usando a conexao normal;
 *  - `transacao`: abre uma transacao interativa ($transaction) e entrega
 *    repositorios ligados a ela. Se a funcao lancar qualquer erro, TODAS as
 *    escritas feitas dentro dela sofrem rollback.
 */
export class UnidadeDeTrabalho {
  constructor(private readonly prisma: PrismaClient) {}

  simples(): Repositorios {
    return criarRepositorios(this.prisma);
  }

  transacao<T>(fn: (repos: Repositorios) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(criarRepositorios(tx)), {
      maxWait: 5000,
      timeout: 15000,
    });
  }
}
