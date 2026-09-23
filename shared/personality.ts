import type { BotDifficulty } from './protocol';

/**
 * Personalidade — o jeito de jogar, em seis traços.
 *
 * Duas pessoas com o mesmo saldo jogam de um jeito diferente, e é isso que a mesa lê: quem blefa,
 * quem só entra com carta, quem paga até o fim. Aqui esse jeito vira número — **um por traço, de
 * 0 a 1** — a partir do que a pessoa fez nas últimas dez partidas.
 *
 * Duas pontas usam o mesmo arquivo:
 *
 * - **o jogador** não tem personalidade declarada: ela é *medida*. O servidor conta o que aconteceu
 *   (`ResumoDaPartida`, alimentado em shared/room.ts) e `personalidadeDe` transforma a contagem nos
 *   seis números que o perfil desenha.
 * - **os bots** têm a personalidade escrita (`PERSONALIDADES`, por personagem) e ela **manda em
 *   como jogam**: `estiloDoBot` mistura o traço com a dificuldade e devolve os botões que o
 *   shared/bot.ts gira. Marina blefa porque é a Marina, não porque sorteou.
 *
 * Só se mede o humano. Medir um bot seria ler a nossa própria letra e chamar de leitura.
 */

/** Os seis traços. Mais que isto vira tabela, e tabela ninguém lê num gráfico. */
export type Traco = 'blefe' | 'agressao' | 'cautela' | 'teimosia' | 'risco' | 'faro';

export interface TracoSpec {
  id: Traco;
  /** A etiqueta que aparece no perfil e embaixo do personagem. */
  tag: string;
  /** O nome do eixo no gráfico (curto, cabe na ponta). */
  label: string;
  /** Uma linha do que o número quer dizer. */
  hint: string;
  /** A cor do eixo. Vem da mesma paleta dos degraus de raridade. */
  cor: string;
}

/**
 * A ordem é a do gráfico, no sentido horário a partir do topo, e foi escolhida para que traços
 * opostos caiam em lados opostos: blefe contra cautela, agressão contra faro.
 */
export const TRACOS: readonly TracoSpec[] = [
  { id: 'blefe', tag: 'Astuto', label: 'Blefe', hint: 'Aposta forte com mão fraca.', cor: '#c79bff' },
  { id: 'agressao', tag: 'Agressivo', label: 'Agressão', hint: 'Aposta e aumenta em vez de pagar.', cor: '#ff7d7d' },
  { id: 'risco', tag: 'Tomador de risco', label: 'Risco', hint: 'Aposta grande, e vai de all-in.', cor: '#ffd76a' },
  { id: 'cautela', tag: 'Conservador', label: 'Cautela', hint: 'Só entra na mão com carta.', cor: '#7fc4ff' },
  { id: 'teimosia', tag: 'Teimoso', label: 'Teimosia', hint: 'Paga até o fim para ver.', cor: '#8ee27a' },
  { id: 'faro', tag: 'Faro', label: 'Faro', hint: 'Ganha as mãos que leva ao showdown.', cor: '#ff9ecb' },
];

export const tracoSpec = (id: Traco): TracoSpec => TRACOS.find((t) => t.id === id)!;

/** Os seis números, de 0 a 1. */
export type Personalidade = Record<Traco, number>;

/** O meio da tabela: ninguém é nada em particular. É o que um jogador sem histórico mostra. */
export const NEUTRA: Personalidade = { blefe: 0.5, agressao: 0.5, cautela: 0.5, teimosia: 0.5, risco: 0.5, faro: 0.5 };

// ---------------------------------------------------------------------
// O que se conta numa partida
// ---------------------------------------------------------------------

/**
 * A contagem crua de uma partida.
 *
 * São contadores, não médias: somar duas partidas é somar campo a campo, e é assim que as dez
 * últimas viram uma personalidade só. Quem preenche é o servidor, ação por ação
 * (`Room.notePlay`), porque o jeito de jogar é observação — não é algo que o cliente declare.
 */
export interface ResumoDaPartida {
  /** Quando a partida acabou (ISO). Serve para ordenar e descartar as antigas. */
  at: string;
  /** Mãos recebidas. */
  maos: number;
  /** Mãos em que pôs ficha por vontade própria (blind não conta). */
  entradas: number;
  /** Apostas e aumentos (all-in incluso). */
  agressoes: number;
  /** Pagamentos. */
  pagadas: number;
  /** Passadas sem aposta na mesa. */
  passadas: number;
  /** Desistências. */
  desistencias: number;
  /** Agressões feitas com mão fraca — o blefe. */
  blefes: number;
  /** Agressões de três quartos do pote para cima, e os all-ins. */
  apostasGrandes: number;
  /** Mãos levadas até o showdown. */
  showdowns: number;
  /** Dessas, quantas venceu. */
  showdownsGanhos: number;
  /** Vezes que enfrentou aposta na última rua. */
  ultimasRuas: number;
  /** Dessas, quantas pagou para ver. */
  pagouAteOFim: number;
}

/** Quantas partidas a personalidade enxerga. O jeito de jogar de hoje, não o do mês passado. */
export const PARTIDAS_LEMBRADAS = 10;

export const RESUMO_VAZIO: Omit<ResumoDaPartida, 'at'> = {
  maos: 0,
  entradas: 0,
  agressoes: 0,
  pagadas: 0,
  passadas: 0,
  desistencias: 0,
  blefes: 0,
  apostasGrandes: 0,
  showdowns: 0,
  showdownsGanhos: 0,
  ultimasRuas: 0,
  pagouAteOFim: 0,
};

export const resumoVazio = (at = new Date().toISOString()): ResumoDaPartida => ({ ...RESUMO_VAZIO, at });

/** A partida valeu a pena guardar? Uma mesa da qual se levantou na primeira mão não diz nada. */
export const contaComoPartida = (r: ResumoDaPartida): boolean => r.maos > 0;

/** Soma campo a campo. A data que fica é a da partida mais recente. */
export function somarResumos(lista: readonly ResumoDaPartida[]): ResumoDaPartida {
  const total = resumoVazio(lista.reduce((a, r) => (r.at > a ? r.at : a), ''));
  for (const r of lista) {
    for (const k of Object.keys(RESUMO_VAZIO) as (keyof typeof RESUMO_VAZIO)[]) total[k] += r[k] ?? 0;
  }
  return total;
}

/** As `PARTIDAS_LEMBRADAS` mais recentes, da mais nova para a mais velha. */
export function ultimasPartidas(lista: readonly ResumoDaPartida[], quantas = PARTIDAS_LEMBRADAS): ResumoDaPartida[] {
  return [...lista].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, quantas);
}

// ---------------------------------------------------------------------
// Da contagem para os seis números
// ---------------------------------------------------------------------

/**
 * Peso da dúvida: quantas observações "neutras" entram junto com as de verdade.
 *
 * Sem isto, quem blefou na única mão que jogou sairia com blefe 1,0 — e o gráfico mentiria com
 * cara de dado. Com sete observações imaginárias no meio da tabela, o traço só encosta nas pontas
 * quando há partida suficiente para sustentar. Quem jogou muito domina o próprio número; quem
 * acabou de chegar aparece redondo, que é a verdade sobre ele.
 */
export const PESO_DA_DUVIDA = 7;

/** A taxa `acertos/tentativas` puxada para o meio enquanto há pouca amostra. */
export function taxa(parte: number, total: number, duvida = PESO_DA_DUVIDA): number {
  const p = Math.max(0, parte);
  const t = Math.max(p, total);
  return (p + 0.5 * duvida) / (t + duvida);
}

/**
 * A personalidade que sai de uma contagem.
 *
 * Cada traço é uma fração do que a pessoa **podia** ter feito, nunca do total de mãos: agressão é
 * agressão sobre ações voluntárias, blefe é blefe sobre agressões. Dividir tudo pelo número de
 * mãos faria quem desiste muito parecer manso em todos os eixos, quando ele é só seletivo.
 */
export function personalidadeDe(r: ResumoDaPartida): Personalidade {
  const voluntarias = r.agressoes + r.pagadas + r.passadas;
  return {
    blefe: taxa(r.blefes, r.agressoes),
    agressao: taxa(r.agressoes, voluntarias),
    risco: taxa(r.apostasGrandes, r.agressoes),
    cautela: taxa(r.maos - r.entradas, r.maos),
    teimosia: taxa(r.pagouAteOFim, r.ultimasRuas),
    faro: taxa(r.showdownsGanhos, r.showdowns),
  };
}

/** A personalidade das últimas partidas de alguém. */
export function personalidadeDasPartidas(lista: readonly ResumoDaPartida[]): Personalidade {
  return personalidadeDe(somarResumos(ultimasPartidas(lista)));
}

/**
 * A partir de onde um traço vira etiqueta.
 *
 * Meio é o silêncio: 0,5 é "não dá para dizer". A etiqueta só aparece quando o traço se destaca o
 * bastante para alguém na mesa notar.
 */
export const LIMIAR_TAG = 0.62;

/** As etiquetas de uma personalidade, da mais marcante para a menos. */
export function tagsDe(p: Personalidade, max = 3): TracoSpec[] {
  return TRACOS.filter((t) => p[t.id] >= LIMIAR_TAG)
    .sort((a, b) => p[b.id] - p[a.id])
    .slice(0, max);
}

/** O traço mais forte, mesmo que nenhum chegue ao limiar. */
export function tracoDominante(p: Personalidade): TracoSpec {
  return TRACOS.reduce((b, t) => (p[t.id] > p[b.id] ? t : b), TRACOS[0]);
}

// ---------------------------------------------------------------------
// A personalidade dos bots
// ---------------------------------------------------------------------

/**
 * Como cada personagem joga. O bot **é** o personagem: o jeito segue o que a Galeria e as falas
 * dizem dele, então quem joga contra a Marina duas vezes aprende a Marina, não "o bot 2".
 *
 * Um personagem sem entrada aqui joga neutro — acrescentar personagem não quebra mesa.
 */
export const PERSONALIDADES: Record<string, Personalidade> = {
  // Marina: barulho e brilho. Aposta antes de pensar, e blefa sorrindo.
  marina: { blefe: 0.72, agressao: 0.8, risco: 0.75, cautela: 0.2, teimosia: 0.45, faro: 0.42 },
  // Ren: silêncio e leitura. Espera a carta, e quando entra é porque tem.
  ren: { blefe: 0.15, agressao: 0.3, risco: 0.2, cautela: 0.86, teimosia: 0.32, faro: 0.78 },
  // Tobi: dourado. Vai de all-in e paga até o fim, porque sair da mão dói mais que perder.
  tobi: { blefe: 0.48, agressao: 0.66, risco: 0.9, cautela: 0.28, teimosia: 0.82, faro: 0.35 },
  // Yukina: o leque na frente do rosto. Blefa com método, e só paga quando sabe.
  yukina: { blefe: 0.8, agressao: 0.52, risco: 0.35, cautela: 0.62, teimosia: 0.3, faro: 0.74 },
};

/** A personalidade de um personagem (neutra quando não há uma escrita). */
export const personalidadeDoPersonagem = (id: string): Personalidade => PERSONALIDADES[id] ?? NEUTRA;

// ---------------------------------------------------------------------
// Do traço para a mesa
// ---------------------------------------------------------------------

/** Os botões que o bot gira ao decidir (shared/bot.ts). */
export interface EstiloBot {
  /** Iterações do Monte Carlo: quanto o bot enxerga da própria mão. */
  iters: number;
  /** Erro que ele comete ao enxergar. */
  noise: number;
  /** Com que frequência aposta sem nada. */
  bluff: number;
  /** Com que frequência escolhe apostar em vez de pagar. */
  aggression: number;
  /** Margem exigida sobre as chances do pote para pagar (negativa = paga largo). */
  margin: number;
  /** Com que frequência paga a última aposta só para ver. */
  callDown: number;
  /** Tamanho da aposta em relação ao padrão (1 = o de sempre; 1,25 = um quarto maior). */
  bet: number;
}

/**
 * A base de cada dificuldade: o que o bot **sabe**, não o que ele é.
 *
 * Dificuldade é competência — quantas simulações ele roda, quanto erra ao avaliar a mão, que
 * margem exige para pagar. Estilo é outra coisa, e vem do personagem.
 */
const BASE: Record<BotDifficulty, EstiloBot> = {
  easy: { iters: 120, noise: 0.18, bluff: 0.04, aggression: 0.35, margin: -0.04, callDown: 0.2, bet: 1 },
  normal: { iters: 260, noise: 0.08, bluff: 0.08, aggression: 0.55, margin: 0.02, callDown: 0.18, bet: 1 },
  hard: { iters: 500, noise: 0.03, bluff: 0.12, aggression: 0.7, margin: 0.04, callDown: 0.16, bet: 1 },
};

/** Desvio de um traço em relação ao meio: -0,5 (nada) a +0,5 (tudo). */
const desvio = (v: number): number => Math.max(0, Math.min(1, v)) - 0.5;

/**
 * O estilo com que um bot joga: a competência da dificuldade, torcida pela personalidade.
 *
 * Os traços mexem em **como** ele joga (blefa mais, paga mais largo, aposta maior) e também no
 * quanto ele acerta: faro é literalmente enxergar melhor a própria mão, então ele compra
 * iterações e tira ruído; risco baixa a margem exigida, o que faz pagar demais. Assim a
 * dificuldade sai ajustada pelo personagem em vez de valer sozinha — um Ren fácil ainda é duro de
 * tirar de uma mão, e uma Marina difícil continua se metendo em encrenca.
 *
 * Sem personalidade o resultado é exatamente a base, para que uma mesa antiga jogue como jogava.
 */
export function estiloDoBot(difficulty: BotDifficulty, p?: Personalidade): EstiloBot {
  const b = BASE[difficulty] ?? BASE.normal;
  if (!p) return { ...b };
  const trava = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    // faro é ver melhor: mais simulações e menos erro na leitura da própria mão
    iters: Math.round(b.iters * (1 + desvio(p.faro) * 0.8)),
    noise: trava(b.noise * (1 - desvio(p.faro) * 1.2), 0.01, 0.3),
    bluff: trava(b.bluff + desvio(p.blefe) * 0.22, 0, 0.35),
    aggression: trava(b.aggression + desvio(p.agressao) * 0.5, 0.1, 0.95),
    // cautela pede mais para entrar; risco e teimosia pagam mais largo
    margin: trava(b.margin + desvio(p.cautela) * 0.12 - desvio(p.risco) * 0.08, -0.12, 0.2),
    callDown: trava(b.callDown + desvio(p.teimosia) * 0.6, 0, 0.9),
    bet: trava(b.bet + desvio(p.risco) * 0.7, 0.7, 1.45),
  };
}
