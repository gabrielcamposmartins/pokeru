import {
  CATALOG,
  findGift,
  findItem,
  isFree,
  itemKey,
  padoPrice,
  rarityOf,
  rarityRank,
  type CatalogItem,
  type Currency,
  type ItemKind,
  type Raridade,
} from './catalog';
import { findCharacter } from './styles';

/**
 * As roletas — de onde vêm os cosméticos agora que eles saíram da venda direta.
 *
 * Duas roletas, cada uma com o seu ticket, e **nenhum prêmio está nas duas**. Cada peça do jogo
 * sai de uma roleta só (veja ROLETA_DE), e a divisão é por tema: a das Flores tem a luz, o céu, o
 * gelo, a flor e a jade — e as personagens femininas; a do Dragão tem o fogo, a sombra, a noite, o
 * metal e o bordô — e os personagens masculinos. Quem quer uma peça sabe em qual gastar, e nenhum
 * ticket é repetição do outro.
 *
 * Este arquivo é comum ao servidor e ao cliente **de propósito**, como o catálogo de preços: a
 * loja mostra as chances lidas daqui e o servidor sorteia com a mesma tabela. Não há como a
 * vitrine anunciar 4% e o sorteio usar 1%.
 *
 * **O sorteio é do servidor.** `draw` só existe aqui para haver uma implementação; quem a chama em
 * produção é `server/accounts.ts`, com o seu próprio número aleatório. O cliente nunca sorteia —
 * ele pede, anima, e mostra o que o servidor respondeu.
 */

export interface Roulette {
  id: string;
  name: string;
  /** Uma linha sobre o que ela dá. */
  about: string;
  /** Gênero dos personagens que podem cair. */
  gender: 'f' | 'm';
  /** Preço do ticket em fichas (o de padocoin sai de `padoPrice`). */
  chips: number;
}

export const ROULETTES: Roulette[] = [
  {
    id: 'flores',
    name: 'Roleta das Flores',
    about: 'Luz, céu, gelo e flores: asas de anjo, auréolas, as peças de jade e sakura — e as personagens femininas.',
    gender: 'f',
    chips: 2500,
  },
  {
    id: 'dragao',
    name: 'Roleta do Dragão',
    about: 'Fogo, sombra e metal: asas de dragão e de morcego, labaredas, o bordô e a noite — e os personagens masculinos.',
    gender: 'm',
    chips: 2500,
  },
];

export const findRoulette = (id: string): Roulette | undefined => ROULETTES.find((r) => r.id === id);

/** Preço do ticket na moeda pedida. */
export function ticketPrice(r: Roulette, currency: Currency): number {
  return currency === 'pado' ? padoPrice(r.chips) : r.chips;
}

/**
 * Quanto cada **degrau de raridade** pesa no sorteio.
 *
 * O peso é da raridade, não do tipo: assim a fatia que a loja anuncia para cada degrau é esta
 * tabela, em ordem — comum mais que incomum, incomum mais que raro, e assim por diante. Dentro do
 * degrau, o peso se reparte entre as peças dele, então acrescentar uma mesa nova encolhe as outras
 * mesas do mesmo degrau e não mexe nos degraus de cima.
 *
 * Um detalhe honesto: a fatia de um degrau é **fixa** e se reparte entre as peças dele, então cada
 * lendário novo dilui os outros. Hoje o degrau lendário de cada roleta tem quatro peças — nas
 * Flores, Yukina, as duas frentes de material e o Círculo Prismático; no Dragão, Ren, as asas e a
 * moldura de dragão e o kimono —, pouco mais de 0,6% cada. Para o personagem valer mais que as
 * outras peças, o caminho é dar fatia própria a ele, e não mexer nesta tabela.
 */
const PESOS: Record<Raridade, number> = {
  lendario: 2.5,
  epico: 6,
  raro: 10,
  incomum: 26,
  comum: 55.5,
};

export type { Raridade } from './catalog';
export { RARIDADES, rarityOf, rarityRank } from './catalog';

/** Um prêmio possível, com a chance que a loja anuncia. */
export interface Drop {
  key: string;
  kind: ItemKind;
  name: string;
  /** Peso relativo dentro da roleta. */
  weight: number;
  /** Chance de sair, de 0 a 1 (é o que a loja mostra em %). */
  chance: number;
  raridade: Raridade;
}

/** Tipos que a roleta sorteia: cosmético e presente. Aparência da interface se compra, não se tira. */
const TIPOS: readonly ItemKind[] = ['character', 'winfx', 'aura', 'frame', 'back', 'face', 'chip', 'table', 'gift'];

/**
 * De qual roleta sai cada peça — todas, menos os personagens (esses vão pelo gênero).
 *
 * A lista é **declarada**, peça por peça, e a divisão segue três réguas ao mesmo tempo:
 *
 *   - o **tema**, que é o que a pessoa enxerga: luz e flor de um lado, fogo e sombra do outro;
 *   - a **raridade**: em cada degrau as duas roletas têm o mesmo número de peças, ou uma a mais;
 *   - o **tipo**: auras, molduras, efeitos, cartas, fichas, mesas e presentes também se dividem ao
 *     meio, para nenhum ticket ser "o das mesas" ou "o dos efeitos".
 *
 * Os pares que existem se separam: o conjunto vitoriano verde (Salão Esmeralda, Salão Vitoriano)
 * fica nas Flores e o bordô (Brasão Bordô, Veludo Bordô) no Dragão.
 *
 * Peça nova que não entrar aqui não sai de roleta nenhuma — e o teste de cobertura em
 * roulette.test.ts falha, que é para ninguém esquecer.
 */
const ROLETA_DE: Record<string, 'flores' | 'dragao'> = {
  // ---------------------------------------------------------------- Roleta das Flores
  // lendário (e a Yukina)
  'face:face-glass': 'flores',
  'face:face-rainbow': 'flores',
  'aura:circulo-prisma': 'flores',
  // épico
  'aura:asas-anjo': 'flores',
  'aura:selo-onmyoji': 'flores',
  'frame:anjinho': 'flores',
  'frame:gelo': 'flores',
  'gift:joia': 'flores',
  'winfx:holy': 'flores',
  'winfx:ice': 'flores',
  'winfx:prism': 'flores',
  // raro
  'aura:aureola-radiante': 'flores',
  'frame:vitoriana': 'flores',
  'gift:leque': 'flores',
  'back:back-victorian-green': 'flores',
  'table:table-victorian': 'flores',
  'chip:chip-victorian': 'flores',
  // incomum
  'aura:aureola': 'flores',
  'aura:naipes': 'flores',
  'aura:circulo-arcano': 'flores',
  'frame:sakura': 'flores',
  'face:face-jade': 'flores',
  'back:back-royal': 'flores',
  'table:table-royal': 'flores',
  'winfx:emerald': 'flores',
  'winfx:rose': 'flores',
  'gift:livro': 'flores',
  // comum
  'aura:poeira-de-luz': 'flores',
  'frame:jade': 'flores',
  'face:face-sakura': 'flores',
  'back:back-jade': 'flores',
  'chip:chip-pastel': 'flores',
  'table:table-green': 'flores',
  'gift:flor': 'flores',
  'gift:bolo': 'flores',

  // ---------------------------------------------------------------- Roleta do Dragão
  // lendário (e o Ren)
  'aura:asas-dragao': 'dragao',
  'frame:dragao': 'dragao',
  'gift:kimono': 'dragao',
  // épico
  'aura:asas-morcego': 'dragao',
  'aura:aureola-negra': 'dragao',
  'aura:labaredas': 'dragao',
  'aura:fogo-fatuo': 'dragao',
  'frame:chama': 'dragao',
  'winfx:fire': 'dragao',
  'winfx:lightning': 'dragao',
  'winfx:void': 'dragao',
  // raro
  'aura:circulo-oracular': 'dragao',
  'aura:espadas': 'dragao',
  'frame:neon': 'dragao',
  'face:face-victorian': 'dragao',
  'back:back-victorian': 'dragao',
  'table:table-victorian-wine': 'dragao',
  'gift:fone': 'dragao',
  // incomum
  'aura:shurikens': 'dragao',
  'frame:obsidiana': 'dragao',
  'face:face-gold': 'dragao',
  'back:back-gold': 'dragao',
  'back:back-midnight': 'dragao',
  'table:table-night': 'dragao',
  'table:table-wine': 'dragao',
  'winfx:azure': 'dragao',
  'winfx:violet': 'dragao',
  'gift:incenso': 'dragao',
  // comum
  'frame:prata': 'dragao',
  'face:face-four': 'dragao',
  'face:face-neon': 'dragao',
  'back:back-crimson': 'dragao',
  'chip:chip-metal': 'dragao',
  'chip:chip-neon': 'dragao',
  // o Boreal é o inverno e a noite; comum como as peças baratas daqui, ele equilibra o degrau
  'aura:circulo-boreal': 'dragao',
  'gift:cha': 'dragao',
};

/** De qual roleta a peça sai (undefined = de nenhuma: é grátis, é aparência, ou ficou de fora). */
export function roletaDe(key: string): Roulette | undefined {
  const item = findItem(key);
  if (!item) return undefined;
  return ROULETTES.find((r) => cabe(item, r));
}

/** Entra na roleta? O que já vem com o jogo não entra, personagem vai pelo gênero, o resto por ROLETA_DE. */
function cabe(item: CatalogItem, r: Roulette): boolean {
  if (isFree(item.key)) return false;
  if (!TIPOS.includes(item.kind)) return false;
  if (item.kind === 'character') return findCharacter(item.id).gender === r.gender;
  return ROLETA_DE[item.key] === r.id;
}

const tabelas = new Map<string, Drop[]>();

/**
 * A tabela de prêmios de uma roleta, com as chances já normalizadas.
 *
 * Fica em cache porque é derivada de constantes: o catálogo não muda em tempo de execução, e esta
 * lista é lida a cada desenho da loja.
 */
export function dropsOf(r: Roulette): Drop[] {
  const cached = tabelas.get(r.id);
  if (cached) return cached;
  const itens = CATALOG.filter((i) => cabe(i, r));
  const porDegrau = new Map<Raridade, number>();
  for (const i of itens) {
    const rr = rarityOf(i.key);
    porDegrau.set(rr, (porDegrau.get(rr) ?? 0) + 1);
  }
  const crus = itens.map((i) => {
    const raridade = rarityOf(i.key);
    return {
      key: i.key,
      kind: i.kind,
      name: i.name,
      raridade,
      // o peso do degrau, repartido entre as peças dele
      weight: PESOS[raridade] / (porDegrau.get(raridade) ?? 1),
    };
  });
  const total = crus.reduce((t, d) => t + d.weight, 0);
  // os melhores primeiro, e dentro da mesma raridade o mais improvável na frente
  const drops = crus
    .map((d) => ({ ...d, chance: total ? d.weight / total : 0 }))
    .sort((a, b) => rarityRank(a.raridade) - rarityRank(b.raridade) || a.chance - b.chance || a.key.localeCompare(b.key));
  tabelas.set(r.id, drops);
  return drops;
}

/**
 * Sorteia um prêmio. `rnd` é um número em [0, 1) — quem chama decide de onde ele vem.
 *
 * Recebe o aleatório por fora para o servidor poder usar `crypto` e o teste poder fixar o
 * resultado: sorteio conferível é sorteio em que se pode confiar.
 */
export function draw(r: Roulette, rnd: number): Drop {
  const drops = dropsOf(r);
  const total = drops.reduce((t, d) => t + d.weight, 0);
  let alvo = Math.min(Math.max(rnd, 0), 0.999999) * total;
  for (const d of drops) {
    alvo -= d.weight;
    if (alvo < 0) return d;
  }
  return drops[drops.length - 1];
}

/**
 * Quanto vale em fichas um prêmio repetido.
 *
 * Cosmético repetido vira fichas: o ticket nunca sai vazio, e o valor sai do preço que o item
 * tinha no catálogo — a tabela de preços continua servindo, mesmo que não se compre mais a peça.
 * Presente nunca repete (é contável: dois ramos de sakura são dois ramos).
 */
export const DUP_FRACAO = 0.3;

export function refundOf(key: string): number {
  const item = findItem(key);
  if (!item) return 0;
  return Math.max(1, Math.round(item.chips * DUP_FRACAO));
}

/** O prêmio é contável (presente) em vez de item de coleção? */
export function isCountable(key: string): boolean {
  return key.startsWith('gift:');
}

/** O presente de uma chave de prêmio (`gift:flor` → o ramo de sakura). */
export function giftOfKey(key: string) {
  return isCountable(key) ? findGift(key.slice('gift:'.length)) : undefined;
}

/** Chave de prêmio de um presente. */
export const giftKey = (id: string): string => itemKey('gift', id);
