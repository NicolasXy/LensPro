// spiderman
import sharp from "sharp";
import { carregarConfiguracao } from "./config";
import { criarPrisma } from "./db/prisma";
import { UnidadeDeTrabalho } from "./db/unidadeDeTrabalho";
import { Armazenamento } from "./core/armazenamento";
import { carregarChaveMestra } from "./core/chaveMestra";
import { AuthService } from "./services/AuthService";
import { PerfilService } from "./services/PerfilService";
import { EventoService } from "./services/EventoService";
import { FotoService } from "./services/FotoService";
import { PedidoService } from "./services/PedidoService";
import { PagamentoService } from "./services/PagamentoService";
import { GatewaySimulado } from "./services/Gateway";
import { EnviadorMemoria } from "./services/Mailer";
import { Ator } from "./services/tipos";

/**
 * Massa de dados inicial (idempotente: se o admin do seed ja existe, nao faz nada).
 * Cria usuarios dos tres papeis, perfis de fotografo (com Pix cifrado), eventos,
 * fotos GERADAS proceduralmente (nao depende de internet nem de direitos de
 * imagem) passando pelo MESMO pipeline do upload real (marca d'agua + original
 * cifrado) e uma compra paga para o comprador de demonstracao.
 */

// Gerador pseudo-aleatorio deterministico: as mesmas fotos em toda maquina.
function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Tipo = "montanha" | "praia" | "cidade" | "campo";

function cena(tipo: Tipo, semente: number, paleta: [string, string, string, string]): string {
  const rnd = prng(semente);
  const L = 2400, A = 1600;
  const [ceuTopo, ceuBase, solCor, silhueta] = paleta;
  let formas = "";
  if (tipo === "montanha" || tipo === "campo") {
    for (let camada = 0; camada < 3; camada++) {
      const base = 900 + camada * 200;
      const pts: string[] = [`0,${A}`];
      for (let x = 0; x <= L; x += 200) pts.push(`${x},${Math.round(base - rnd() * (tipo === "montanha" ? 420 : 160) + camada * 40)}`);
      pts.push(`${L},${A}`);
      const op = 0.55 + camada * 0.22;
      formas += `<polygon points="${pts.join(" ")}" fill="${silhueta}" fill-opacity="${op.toFixed(2)}"/>`;
    }
  } else if (tipo === "praia") {
    formas += `<rect y="1000" width="${L}" height="${A - 1000}" fill="${silhueta}" fill-opacity="0.85"/>`;
    for (let i = 0; i < 6; i++) {
      const y = 1060 + i * 90;
      formas += `<path d="M0 ${y} Q 300 ${y - 40 - rnd() * 30} 600 ${y} T 1200 ${y} T 1800 ${y} T 2400 ${y}" stroke="#fff" stroke-opacity="${(0.5 - i * 0.07).toFixed(2)}" stroke-width="${10 - i}" fill="none"/>`;
    }
    formas += `<ellipse cx="${400 + rnd() * 1600}" cy="1330" rx="260" ry="60" fill="#f3d9a4" fill-opacity="0.9"/>`;
  } else {
    let x = 0;
    while (x < L) {
      const w = 90 + Math.round(rnd() * 170);
      const h = 300 + Math.round(rnd() * 620);
      formas += `<rect x="${x}" y="${A - h}" width="${w}" height="${h}" fill="${silhueta}" fill-opacity="${(0.78 + rnd() * 0.2).toFixed(2)}"/>`;
      for (let j = 0; j < 8; j++) {
        if (rnd() > 0.55) formas += `<rect x="${x + 14 + (j % 3) * 40}" y="${A - h + 30 + Math.floor(j / 3) * 70}" width="22" height="30" fill="#ffd27d" fill-opacity="0.85"/>`;
      }
      x += w + 8;
    }
  }
  const sx = 400 + rnd() * 1600;
  const sy = 420 + rnd() * 260;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}">
    <defs>
      <linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ceuTopo}"/><stop offset="1" stop-color="${ceuBase}"/></linearGradient>
      <radialGradient id="s"><stop offset="0" stop-color="${solCor}" stop-opacity="1"/><stop offset="1" stop-color="${solCor}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${L}" height="${A}" fill="url(#c)"/>
    <circle cx="${sx}" cy="${sy}" r="420" fill="url(#s)"/>
    <circle cx="${sx}" cy="${sy}" r="110" fill="${solCor}"/>
    ${formas}
  </svg>`;
}

async function gerarJpeg(tipo: Tipo, semente: number, paleta: [string, string, string, string]): Promise<Buffer> {
  return sharp(Buffer.from(cena(tipo, semente, paleta))).jpeg({ quality: 90 }).toBuffer();
}

const PALETAS: Record<string, [string, string, string, string]> = {
  por_do_sol: ["#1b2a49", "#f08a5d", "#fff3c4", "#2b2d42"],
  amanhecer: ["#355c7d", "#f8b195", "#fff1b8", "#3b3355"],
  nevoa: ["#2c3e50", "#bdc3c7", "#ffffff", "#34495e"],
  noite: ["#0b132b", "#3a506b", "#fdf0d5", "#0b0c10"],
  dourado: ["#4a1942", "#ffb347", "#fff8dc", "#2d1b2e"],
  verde: ["#134e5e", "#71b280", "#f7ffd0", "#1d3b2a"],
};

async function main(): Promise<void> {
  const config = carregarConfiguracao();
  const prisma = criarPrisma(config.databaseUrl);
  const uow = new UnidadeDeTrabalho(prisma);
  const senha = process.env.SEED_SENHA ?? "Lenspro#2026";

  try {
    if (await uow.simples().usuarios.buscarPorEmail("admin@lenspro.com")) {
      console.log("Seed ja aplicado (admin@lenspro.com existe). Nada a fazer.");
      return;
    }
    const chave = carregarChaveMestra(config.diretorioDados, config.chaveMestraHex);
    const arquivos = new Armazenamento(config.diretorioDados, chave);
    const auth = new AuthService(
      uow,
      { bcryptRounds: config.bcryptRounds, loginMaxFalhas: config.loginMaxFalhas, loginBloqueioMin: config.loginBloqueioMin, urlPublica: config.urlPublica },
      new EnviadorMemoria()
    );
    const perfis = new PerfilService(uow, chave);
    const eventos = new EventoService(uow);
    const fotos = new FotoService(uow, arquivos);
    const pedidos = new PedidoService(uow, { taxaPlataformaPercent: config.taxaPlataformaPercent, pedidoExpiraMin: config.pedidoExpiraMin });
    const pagamentos = new PagamentoService(uow, new GatewaySimulado(), pedidos, config.webhookSecret);

    // ---- Usuarios ----
    const admin = await auth.criarPeloAdmin(null, { nome: "Administrador", sobrenome: "LensPro", email: "admin@lenspro.com", senha, tipo: "comprador", papel: "admin" });
    const carlos = await auth.cadastrar({ nome: "Carlos", sobrenome: "Henrique", email: "carlos@lenspro.com", senha, tipo: "fotografo", nomeArtistico: "Carlos Henrique" });
    const mariana = await auth.cadastrar({ nome: "Mariana", sobrenome: "Souza", email: "mariana@lenspro.com", senha, tipo: "fotografo", nomeArtistico: "Mariana Souza" });
    const pedro = await auth.cadastrar({ nome: "Pedro", sobrenome: "Martins", email: "pedro@lenspro.com", senha, tipo: "fotografo", nomeArtistico: "Pedro Martins" });
    const cliente = await auth.cadastrar({ nome: "Julia", sobrenome: "Almeida", email: "cliente@lenspro.com", senha, tipo: "comprador" });
    await auth.cadastrar({ nome: "Rafael", sobrenome: "Lima", email: "rafael@lenspro.com", senha, tipo: "comprador" });
    void admin;

    const ator = (u: { id: string; email: string; nome: string }, papel: "fotografo" | "comprador"): Ator => ({ id: u.id, email: u.email, nome: u.nome, papel });
    const aCarlos = ator(carlos, "fotografo");
    const aMariana = ator(mariana, "fotografo");
    const aPedro = ator(pedro, "fotografo");

    await perfis.atualizar(aCarlos, { bio: "Especialista em eventos premium, fotografia esportiva e cobertura corporativa.", cidade: "Sao Paulo", estado: "SP", especialidade: "Eventos e Esportes", pixChave: "carlos@lenspro.com" });
    await perfis.atualizar(aMariana, { bio: "Registro casamentos com um olhar documental e emocao em cada detalhe.", cidade: "Curitiba", estado: "PR", especialidade: "Casamentos", pixChave: "41999990001" });
    await perfis.atualizar(aPedro, { bio: "Ensaios premium em locacoes naturais, luz natural e direcao leve.", cidade: "Belo Horizonte", estado: "MG", especialidade: "Ensaios Premium", pixChave: "pedro@lenspro.com" });

    // ---- Eventos ----
    const evMaratona = await eventos.criar(aCarlos, { titulo: "Maratona Sao Paulo 2026", descricao: "Cobertura completa da largada a chegada.", local: "Sao Paulo, SP", dataEvento: "2026-08-15" });
    const evCasamento = await eventos.criar(aMariana, { titulo: "Casamento na Praia do Rosa", descricao: "Cerimonia ao entardecer e festa na areia.", local: "Imbituba, SC", dataEvento: "2026-09-12" });
    const evOutono = await eventos.criar(aPedro, { titulo: "Ensaio Outono na Serra", descricao: "Serie de retratos entre neblina e montanhas.", local: "Ouro Preto, MG", dataEvento: "2026-05-23" });

    // ---- Fotos (mesmo pipeline do upload real) ----
    const catalogo: { quem: Ator; ev?: string; tipo: Tipo; paleta: string; titulo: string; desc: string; tags: string[]; preco: number }[] = [
      { quem: aCarlos, ev: evMaratona.id, tipo: "cidade", paleta: "amanhecer", titulo: "Largada ao amanhecer", desc: "Milhares de corredores na avenida logo apos o tiro de largada.", tags: ["maratona", "corrida", "esporte"], preco: 1990 },
      { quem: aCarlos, ev: evMaratona.id, tipo: "cidade", paleta: "dourado", titulo: "Pelotao de elite", desc: "Os lideres abrem vantagem no primeiro quilometro.", tags: ["maratona", "esporte", "elite"], preco: 2490 },
      { quem: aCarlos, ev: evMaratona.id, tipo: "campo", paleta: "verde", titulo: "Reta final no parque", desc: "Cansaco e emocao a poucos metros da chegada.", tags: ["maratona", "corrida", "chegada"], preco: 1990 },
      { quem: aCarlos, tipo: "cidade", paleta: "noite", titulo: "Skyline noturna", desc: "Horizonte urbano logo apos o por do sol.", tags: ["cidade", "noite", "arquitetura"], preco: 3490 },
      { quem: aMariana, ev: evCasamento.id, tipo: "praia", paleta: "por_do_sol", titulo: "Cerimonia ao entardecer", desc: "O sim diante do mar, com o sol se despedindo.", tags: ["casamento", "praia", "por do sol"], preco: 4990 },
      { quem: aMariana, ev: evCasamento.id, tipo: "praia", paleta: "dourado", titulo: "Pes na areia", desc: "A festa continua na beira da praia.", tags: ["casamento", "praia", "festa"], preco: 3990 },
      { quem: aMariana, ev: evCasamento.id, tipo: "praia", paleta: "amanhecer", titulo: "Preparativos da noiva", desc: "Os ultimos detalhes antes de entrar.", tags: ["casamento", "detalhes"], preco: 2990 },
      { quem: aMariana, tipo: "campo", paleta: "verde", titulo: "Campo aberto", desc: "Paisagem de fim de tarde em Curitiba.", tags: ["paisagem", "campo"], preco: 2290 },
      { quem: aPedro, ev: evOutono.id, tipo: "montanha", paleta: "nevoa", titulo: "Neblina na serra", desc: "Camadas de montanha sob a nevoa matinal.", tags: ["ensaio", "montanha", "neblina"], preco: 3490 },
      { quem: aPedro, ev: evOutono.id, tipo: "montanha", paleta: "por_do_sol", titulo: "Contraluz nas montanhas", desc: "Silhuetas e luz dourada no fim do dia.", tags: ["ensaio", "montanha", "por do sol"], preco: 3990 },
      { quem: aPedro, ev: evOutono.id, tipo: "montanha", paleta: "dourado", titulo: "Horizonte dourado", desc: "A hora magica sobre as serras.", tags: ["ensaio", "montanha", "paisagem"], preco: 2990 },
      { quem: aPedro, tipo: "montanha", paleta: "noite", titulo: "Noite estrelada", desc: "Ceu limpo e montanhas escuras.", tags: ["noite", "montanha", "astrofotografia"], preco: 4490 },
    ];
    const criadas: string[] = [];
    let n = 0;
    for (const f of catalogo) {
      n++;
      const jpeg = await gerarJpeg(f.tipo, 1000 + n * 77, PALETAS[f.paleta]);
      const foto = await fotos.publicar(f.quem, { titulo: f.titulo, descricao: f.desc, tags: f.tags, precoCentavos: f.preco, eventoId: f.ev ?? null }, jpeg);
      criadas.push(foto.id);
    }

    // ---- Compra de demonstracao (cartao de teste aprovado) ----
    const aCliente = ator(cliente, "comprador");
    const pedido = await pedidos.criar(aCliente, [criadas[0], criadas[4]]);
    await pagamentos.pagar(aCliente, pedido.id, { metodo: "cartao", cartao: { numero: "4242424242424242", nome: "JULIA ALMEIDA", validade: "12/39", cvv: "123" } });

    console.log(`Seed concluido: 6 usuarios, 3 eventos, ${criadas.length} fotos e 1 compra paga.`);
    console.log(`Logins (senha: ${senha}): admin@lenspro.com | carlos@lenspro.com, mariana@lenspro.com, pedro@lenspro.com (fotografos) | cliente@lenspro.com, rafael@lenspro.com (compradores)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Falha no seed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
