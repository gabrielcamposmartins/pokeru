import { ACESSORIOS, ESMALTE_PADRAO, LUVA_PADRAO, comLegado, findAcessorio, type Acessorios, type TipoDeAcessorio } from './acessorios';
import { componentesDe, encaixar } from './componentes';
import {
  AURA_IDS,
  BACK_PRESETS,
  CHARACTER_PRESETS,
  CHIP_PRESETS,
  FACE_PRESETS,
  FRAME_IDS,
  TABLE_PRESETS,
  WIN_FX_IDS,
  findCharacter,
  type CardBackStyle,
  type CardFaceStyle,
  type FrameId,
  type PlayerCosmetics,
  type WinFxId,
} from './styles';

/**
 * Catálogo da loja — o que existe, quanto custa e o que já vem de graça.
 *
 * Este arquivo é compartilhado de propósito: o cliente desenha a loja com ele e o servidor cobra
 * com ele. Um preço só existe num lugar, então não há como a vitrine dizer 2.000 e a cobrança
 * tirar 5.000.
 *
 * **Quem é dono de quê é do servidor.** O cliente pinta o cadeado, mas quem valida é
 * `server/accounts.ts`: ao entrar, os cosméticos que o jogador não tem são trocados pelos
 * gratuitos (veja `clampCosmetics`), e a compra confere saldo e posse antes de mexer em nada.
 *
 * Duas moedas: **fichas** (do próprio Pokeru) e **padocoins** (a economia do bot do Discord).
 * Todo item pago tem os dois preços; o de padocoin só aparece — e só é aceito — para quem tem o
 * Discord vinculado à conta.
 */

export type ItemKind = 'character' | 'face' | 'back' | 'chip' | 'table' | 'winfx' | 'aura' | 'frame' | 'acessorio' | 'ui' | 'gift';

export const KIND_LABELS: Record<ItemKind, string> = {
  character: 'Personagens',
  face: 'Frente das cartas',
  back: 'Verso das cartas',
  chip: 'Fichas',
  table: 'Mesas',
  winfx: 'Efeitos de vitória',
  aura: 'Auras',
  frame: 'Molduras do retrato',
  acessorio: 'Acessórios',
  ui: 'Aparência da interface',
  gift: 'Presentes',
};

/**
 * O que a loja **vende** e o que ela só **mostra**.
 *
 * Cosmético não se compra mais: personagens, cartas, fichas, mesas e efeitos saem de roleta, e na
 * loja existem como galeria — a pessoa vê o que tem, o que falta e como é cada peça de perto. A
 * aparência da interface é a exceção que continua à venda, porque é a única que muda a cara do
 * jogo inteiro e não faria sentido depender de sorte.
 *
 * VENDIDOS são os **tipos inteiros** à venda. Os acessórios das mãos ficam no meio do caminho: o
 * tipo é de galeria, mas uma parte dele também se compra — os anéis, as pulseiras e os relógios que
 * não são lendários (veja `estaAVenda`, que decide **peça por peça**). Essas peças continuam saindo
 * das roletas: a loja é o caminho certo para quem quer aquela, a roleta é a sorte de sempre.
 *
 * Quem decide isto é o servidor: `buy` recusa a chave que `estaAVenda` não aprova.
 */
export const VENDIDOS: readonly ItemKind[] = ['gift', 'ui'];
export const GALERIA: readonly ItemKind[] = ['character', 'aura', 'frame', 'acessorio', 'winfx', 'back', 'face', 'chip', 'table'];

/** O tipo inteiro está à venda? (Para uma peça, pergunte a `estaAVenda`: há acessório que se compra.) */
export const isSold = (kind: ItemKind): boolean => VENDIDOS.includes(kind);

/** Os tipos de acessório que a loja vende. Esmalte e luva continuam só de roleta. */
export const ACESSORIOS_VENDIDOS: readonly TipoDeAcessorio[] = ['anel', 'pulseira', 'relogio'];

/**
 * As peças desses tipos que **não** se compram: só saem de roleta.
 *
 * São as joias de verdade — os anéis de pedra preciosa, o terço de madrepérola e o relógio clássico,
 * que são lendários (e lendário nenhum se vende: a regra de `estaAVenda` já os barra, e eles estão
 * aqui para a lista dizer por inteiro o que o dono do jogo tirou da prateleira) — e as duas pulseiras
 * de ouro, a corrente e as três argolas, que são raras mas ficam de fora da loja assim mesmo.
 */
export const SO_DE_ROLETA: readonly string[] = [
  'acessorio:anel-safira',
  'acessorio:anel-rubi',
  'acessorio:anel-solitario',
  'acessorio:anel-esmeralda',
  'acessorio:anel-trinca',
  'acessorio:pulseira-corrente',
  'acessorio:pulseira-argolas',
  'acessorio:pulseira-terco-madreperola',
  'acessorio:relogio-classico',
];

/**
 * Raridade — o degrau de cada peça.
 *
 * É **declarada item por item**, não deduzida do preço: quem decide que o brasão vitoriano é raro
 * e o feltro verde é comum é o desenho do jogo, não a tabela de preços. A escada aparece na Galeria
 * (carimbo na peça) e organiza a lista de prêmios das roletas.
 */
export type Raridade = 'lendario' | 'epico' | 'raro' | 'incomum' | 'comum';

/** Da melhor para a mais comum — é esta a ordem em que tudo lista raridade. */
export const RARIDADES: { id: Raridade; label: string }[] = [
  { id: 'lendario', label: 'Lendário' },
  { id: 'epico', label: 'Épico' },
  { id: 'raro', label: 'Raro' },
  { id: 'incomum', label: 'Incomum' },
  { id: 'comum', label: 'Comum' },
];

/**
 * O degrau de cada peça. O que não está aqui é **comum** — o padrão é o chão da escada, então
 * acrescentar um item novo ao jogo não exige tocar nesta lista para nada funcionar.
 *
 * A distribuição é de propósito uma pirâmide: um punhado de lendários, poucos épicos e raros, uma
 * dúzia de incomuns e o resto comum. É ela que faz as fatias das roletas ficarem em ordem —
 * comum > incomum > raro > épico > lendário (veja PESOS em shared/roulette.ts).
 */
const RARIDADE_DE: Record<string, Raridade> = {
  /*
   * Lendário: os personagens e a aparência que muda o jogo inteiro.
   *
   * Marina e Tobi entram aqui mesmo vindo de graça — raridade é o que a peça **é**, não como ela
   * chegou. O que vem com o jogo nunca cai em roleta (veja `cabe`), então isto não mexe nas
   * chances; mexe no carimbo que a Galeria mostra.
   */
  'character:marina': 'lendario',
  'character:ren': 'lendario',
  'character:tobi': 'lendario',
  'character:yukina': 'lendario',
  'character:alistair': 'lendario',
  'character:violetta': 'lendario',
  'character:abel': 'lendario',
  'character:agnes': 'lendario',
  'character:goro': 'lendario',
  'character:hina': 'lendario',
  'character:zuzu': 'lendario',
  'character:nobu': 'lendario',
  'character:saeko': 'lendario',
  'ui:victorian': 'lendario',
  'ui:retro': 'lendario',
  /*
   * O kimono é o presente do fim da escada.
   *
   * O vínculo cobra altura por coração (shared/bond.ts): o quinto só aceita lendário, e sem uma
   * peça aqui esse coração não teria com o que ser alimentado.
   */
  'gift:kimono': 'lendario',
  /*
   * As duas frentes que não são de papel.
   *
   * Lendárias porque são de material, não de cor: o Cristal deixa ver a mesa através da carta e o
   * Arco-Íris tem cor que se mexe. Nenhuma das duas sai de uma combinação de campos do Estúdio.
   */
  'face:face-glass': 'lendario',
  'face:face-rainbow': 'lendario',
  /*
   * As duas peças de dragão.
   *
   * Lendárias porque são as únicas que **acrescentam um bicho** ao jogador: as asas abrem o dobro
   * da largura do personagem e a moldura fecha o retrato entre garras. As outras auras e molduras
   * enfeitam quem já está lá; estas duas mudam o que a pessoa é na mesa.
   */
  'aura:asas-dragao': 'lendario',
  'frame:dragao': 'lendario',
  /*
   * Os círculos têm cada um o seu degrau, do mais simples ao mais trabalhado.
   *
   * O Prismático é lendário: é o único em que a cor anda, e o único escrito com o próprio jogo (as
   * mãos do poker). O Onmyōji é épico, pela shuriken; o Oracular raro; o Arcano incomum; o Boreal,
   * o mais sóbrio, é o círculo comum — a porta de entrada para quem quer um.
   */
  'aura:circulo-prisma': 'lendario',
  'aura:selo-onmyoji': 'epico',
  'aura:circulo-oracular': 'raro',
  'aura:circulo-arcano': 'incomum',
  'aura:circulo-boreal': 'comum',
  // épico: o presente que se guarda
  'gift:joia': 'epico',
  /*
   * Épico: as auras com cena própria, como os efeitos de vitória.
   *
   * Fogo que arde quadro a quadro, asas que batem e a auréola que escureceu em vez de brilhar —
   * são as que se movem por conta, e não as que só giram devagar.
   */
  'aura:labaredas': 'epico',
  'aura:fogo-fatuo': 'epico',
  'aura:aureola-negra': 'epico',
  'aura:asas-anjo': 'epico',
  'aura:asas-morcego': 'epico',
  // épico: as molduras que não ficam paradas
  'frame:gelo': 'epico',
  'frame:chama': 'epico',
  'frame:anjinho': 'epico',
  // épico: os efeitos de vitória com cena própria
  'winfx:prism': 'epico',
  'winfx:lightning': 'epico',
  'winfx:fire': 'epico',
  'winfx:ice': 'epico',
  'winfx:holy': 'epico',
  'winfx:void': 'epico',
  // raro: o nimbo e o arsenal
  'aura:aureola-radiante': 'raro',
  'aura:espadas': 'raro',
  'frame:neon': 'raro',
  // raro: o conjunto vitoriano, o mais trabalhado de cada tipo
  'table:table-victorian': 'raro',
  'table:table-victorian-wine': 'raro',
  'back:back-victorian': 'raro',
  'back:back-victorian-green': 'raro',
  'face:face-victorian': 'raro',
  'chip:chip-victorian': 'raro',
  'frame:vitoriana': 'raro',
  'gift:leque': 'raro',
  'gift:fone': 'raro',
  // incomum: os brilhos de uma cor e as peças de acabamento mais rico
  'winfx:azure': 'incomum',
  'winfx:rose': 'incomum',
  'winfx:emerald': 'incomum',
  'winfx:violet': 'incomum',
  'aura:aureola': 'incomum',
  'aura:naipes': 'incomum',
  'aura:shurikens': 'incomum',
  'frame:sakura': 'incomum',
  'frame:obsidiana': 'incomum',
  'table:table-royal': 'incomum',
  'table:table-wine': 'incomum',
  'table:table-night': 'incomum',
  'back:back-royal': 'incomum',
  'back:back-gold': 'incomum',
  'back:back-midnight': 'incomum',
  'face:face-gold': 'incomum',
  'face:face-jade': 'incomum',
  'gift:incenso': 'incomum',
  'gift:livro': 'incomum',
  /*
   * Os acessórios das mãos.
   *
   * **Joia é rara.** Os anéis, os relógios e as pulseiras de ouro quase nunca ficam abaixo de raro:
   * uma pedra engastada, uma caixa de relógio e uma peça de ouro não são coisa que caia a toda hora.
   * Ficam de fora dessa regra a aliança lisa (a de início de toda conta), o aro de ébano, e os relógios
   * digital e de campo — cada um no degrau que o feitio dele pede.
   *
   * **Lendários: as joias que não se compram.** Os cinco anéis de pedra preciosa (a safira, o rubi, o
   * solitário, a esmeralda e a trinca de brilhantes), o terço de madrepérola, o relógio clássico de
   * ouro e o cronógrafo de bronze e prata. É o degrau que separa a prateleira da sorte: anel, pulseira
   * e relógio se compram na loja (`estaAVenda`), **menos** os lendários — esses só saem de roleta.
   *
   * Épicos: os dois anéis de pedra lapidada em forma (o coração, a placa de ônix), os relógios de
   * caixa quadrada, o das fases da lua e o de mergulho, e as luvas de ópera e de armadura. Raros: a
   * gota de ametista, a pérola, o sinete e a serpente, os relógios esportivo, joia e prismático, a
   * corrente e as argolas de ouro (raras, e mesmo assim fora da loja: veja SO_DE_ROLETA), a riviera,
   * os espinhos e o terço de prata, as luvas de meio dedo, de renda e táticas, e os dois esmaltes de
   * efeito mais trabalhado. Incomuns: o aro de ébano, o relógio digital, o fio de pérolas, as luvas
   * inteiras e os esmaltes de cor ou acabamento menos comum. O resto — as contas, o couro, o cordão,
   * o relógio de campo e os esmaltes de sempre — é comum.
   *
   * O degrau também é o **preço** do acessório (veja PRECO_DO_ACESSORIO): o que a loja cobra pelos
   * que vende, e a base do reembolso de repetido para todos.
   */
  'acessorio:anel-safira': 'lendario',
  'acessorio:anel-rubi': 'lendario',
  'acessorio:anel-solitario': 'lendario',
  'acessorio:anel-esmeralda': 'lendario',
  'acessorio:anel-trinca': 'lendario',
  'acessorio:pulseira-terco-madreperola': 'lendario',
  'acessorio:relogio-classico': 'lendario',
  'acessorio:relogio-bronze': 'lendario',
  'acessorio:anel-coracao': 'epico',
  'acessorio:anel-onix': 'epico',
  'acessorio:relogio-rose': 'epico',
  'acessorio:relogio-noturno': 'epico',
  'acessorio:relogio-lua': 'epico',
  'acessorio:relogio-mergulho': 'epico',
  'acessorio:luva-opera': 'epico',
  'acessorio:luva-manopla': 'epico',
  'acessorio:anel-serpente': 'raro',
  'acessorio:anel-perola': 'raro',
  'acessorio:anel-sinete': 'raro',
  'acessorio:anel-gota': 'raro',
  'acessorio:relogio-esportivo': 'raro',
  'acessorio:relogio-joia': 'raro',
  'acessorio:relogio-prisma': 'raro',
  'acessorio:pulseira-riviera': 'raro',
  'acessorio:pulseira-espinhos': 'raro',
  'acessorio:pulseira-terco': 'raro',
  'acessorio:pulseira-corrente': 'raro',
  'acessorio:pulseira-argolas': 'raro',
  'acessorio:luva-meio-dedo-branca': 'raro',
  'acessorio:luva-meio-dedo-vermelha': 'raro',
  'acessorio:luva-renda': 'raro',
  'acessorio:luva-tatica': 'raro',
  'acessorio:esmalte-degrade': 'raro',
  'acessorio:esmalte-galaxia': 'raro',
  'acessorio:anel-ebano': 'incomum',
  'acessorio:relogio-digital': 'incomum',
  'acessorio:pulseira-perolas': 'incomum',
  'acessorio:luva-branca': 'incomum',
  'acessorio:luva-couro': 'incomum',
  'acessorio:esmalte-lilas': 'incomum',
  'acessorio:esmalte-vinho': 'incomum',
  'acessorio:esmalte-dourado': 'incomum',
  'acessorio:esmalte-francesinha': 'incomum',
  'acessorio:esmalte-cromado': 'incomum',
  // comum, por omissão: flor, chá e bolo — os presentes do primeiro coração —, a Poeira de Luz, que é
  // o brilho de graça com partículas (o primeiro degrau acima do que já vem com o jogo), e, entre os
  // acessórios, as contas, o couro, o cordão, o relógio de campo e os esmaltes de sempre
};

export function rarityOf(key: string): Raridade {
  return RARIDADE_DE[key] ?? 'comum';
}

/** Posição na escada (0 = a melhor). Serve para ordenar. */
export const rarityRank = (r: Raridade): number => RARIDADES.findIndex((x) => x.id === r);

/** O rótulo que se lê ("Lendário"). */
export const rarityLabel = (r: Raridade): string => RARIDADES.find((x) => x.id === r)?.label ?? '';

/** As duas moedas. `pado` só vale para quem tem Discord vinculado. */
export type Currency = 'chips' | 'pado';

export interface CatalogItem {
  /** Chave única no catálogo: `<kind>:<id>` (veja `itemKey`). */
  key: string;
  kind: ItemKind;
  /** Id dentro do tipo — o mesmo dos presets em shared/styles.ts. */
  id: string;
  name: string;
  /** Preço em fichas; o de padocoins sai de `padoPrice`. 0 = já vem com o jogo. */
  chips: number;
}

export const itemKey = (kind: ItemKind, id: string): string => `${kind}:${id}`;

/**
 * Quanto custa em padocoin, em relação ao preço em fichas.
 *
 * Ficha é dinheiro de brinquedo, que o jogo dá e a mesa devolve; padocoin é dinheiro de verdade da
 * economia do bot, que a pessoa ganhou lá fora. Por isso o padocoin **não** é o caminho barato: o
 * mesmo item custa o dobro. Um único fator mantém as duas tabelas em dia sem uma lista paralela.
 */
export const PADO_POR_FICHA = 2;
export const padoPrice = (chips: number): number => Math.ceil(chips * PADO_POR_FICHA);

/** Tabela de preços por tipo (em fichas). */
export const PRICES = {
  character: 15_000,
  ui: 12_000,
  table: 4000,
  /** Os brilhos de uma cor só; os efeitos com cena própria custam `winfxSpecial`. */
  winfx: 3000,
  winfxSpecial: 8000,
  /** Auras: o que gira atrás do personagem. As asas custam `auraWings`. */
  aura: 4000,
  /**
   * Asas.
   *
   * Custam o dobro de uma aura porque não são um enfeite atrás do personagem: elas **crescem** a
   * silhueta dele, e são a única peça do jogo que muda o tamanho que a pessoa ocupa na tela.
   */
  auraWings: 9000,
  /** Molduras do retrato; as que não ficam paradas custam `frameSpecial`. */
  frame: 2500,
  frameSpecial: 6000,
  /** Acessórios das mãos: o piso do tipo, que é o preço do comum — cada peça custa pelo degrau dela (PRECO_DO_ACESSORIO). */
  acessorio: 1000,
  face: 2500,
  /** Frentes de material (vidro, arco-íris): não saem de uma combinação de campos, e valem mais. */
  faceSpecial: 9000,
  back: 2500,
  chip: 2000,
  /** Presente sem preço próprio (todos têm o seu em GIFTS; isto é só o piso do tipo). */
  gift: 500,
} as const;

/** Efeitos com animação própria (fogo, relâmpago…) valem mais que um brilho de cor. */
const SPECIAL_FX = new Set(['prism', 'lightning', 'fire', 'ice', 'holy', 'void']);

/** As auras que abrem asas — veja `PRICES.auraWings`. */
const ASAS = new Set<string>(['asas-anjo', 'asas-morcego', 'asas-dragao']);

/** Molduras que não ficam paradas: brilham, congelam, queimam ou têm lavor de ourives. */
const MOLDURAS_VIVAS = new Set<string>(['neon', 'gelo', 'chama', 'anjinho', 'dragao', 'vitoriana']);

/**
 * O que o jogador já tem ao criar a conta: dois personagens (Marina e Tobi) e um conjunto
 * completo de mesa — o bastante para jogar sem comprar nada.
 */
export const FREE_KEYS: readonly string[] = [
  itemKey('character', 'marina'),
  itemKey('character', 'tobi'),
  itemKey('face', 'face-classic'),
  itemKey('back', 'back-sakura'),
  itemKey('chip', 'chip-casino'),
  itemKey('table', 'table-soul'),
  itemKey('winfx', 'gold'),
  // o brilho que o menu sempre teve atrás do personagem, e a moldura dourada de sempre na mesa
  itemKey('aura', 'brilho'),
  itemKey('frame', 'ouro'),
  // nas mãos: a unha natural e as mãos nuas (ou a luva do traje) — o anel liso é de início, e não grátis: veja `DE_INICIO`
  itemKey('acessorio', ESMALTE_PADRAO),
  itemKey('acessorio', LUVA_PADRAO),
  itemKey('acessorio', 'luva-traje'),
  itemKey('ui', 'default'),
];

const free = new Set(FREE_KEYS);

/**
 * O que toda conta tem **de início**, mas pode perder: a aliança lisa.
 *
 * Não é como o que vem de graça com o jogo (que ninguém perde e ninguém cobra): a aliança é uma peça
 * de verdade — tem preço, sai de roleta e pode ser apostada (shared/aposta.ts). Toda conta começa
 * com uma; quem a perde numa aposta fica sem, e pode ganhar outra de alguém, tirá-la na roleta ou
 * comprá-la na loja.
 *
 * A lista do que a conta tem guarda só o que foi **ganho**; para o que é de início, guarda o
 * contrário: a marca de que foi perdido (`marcaDePerdido`). Assim uma conta antiga não precisa ser
 * mexida para "receber" a aliança, e quem joga sem conta também a tem.
 */
export const DE_INICIO: readonly string[] = [itemKey('acessorio', 'anel-alianca')];
const deInicio = new Set(DE_INICIO);
/** A marca, na lista da conta, de que uma peça de início foi perdida. */
export const marcaDePerdido = (key: string): string => `perdeu:${key}`;
/** A peça é das que toda conta tem de início? */
export const eDeInicio = (key: string): boolean => deInicio.has(key);

/**
 * As joias se **contam**: anéis, pulseiras e relógios.
 *
 * Do resto do catálogo a conta tem ou não tem, e o repetido vira fichas. Destas, cada uma que a
 * pessoa ganha é mais uma peça: dois anéis iguais vão em dois dedos, três pulseiras iguais no mesmo
 * braço. A lista da conta guarda a chave uma vez para cada peça (`quantasTem` as conta). O esmalte e
 * a luva continuam de ter ou não ter: um vidro de esmalte pinta as dez unhas, e um par de luvas veste
 * as duas mãos.
 */
const TIPOS_QUE_SE_CONTAM: readonly TipoDeAcessorio[] = ['anel', 'pulseira', 'relogio'];

/** A peça se conta (a conta pode ter mais de uma dela)? */
export function seConta(key: string): boolean {
  if (!key.startsWith('acessorio:') || isFree(key)) return false;
  const tipo = findAcessorio(key.slice('acessorio:'.length))?.tipo;
  return !!tipo && TIPOS_QUE_SE_CONTAM.includes(tipo);
}

/**
 * Quantas a conta tem desta peça: uma por vez que a chave aparece na lista, mais a de início (a
 * aliança) enquanto não foi perdida. Do que não se conta, 1 ou 0; do que vem com o jogo, sem fim.
 */
export function quantasTem(owned: readonly string[] | undefined, key: string): number {
  if (isFree(key)) return Infinity;
  let n = 0;
  for (const k of owned ?? []) if (k === key) n++;
  if (deInicio.has(key) && !owned?.includes(marcaDePerdido(key))) n++;
  return seConta(key) ? n : Math.min(1, n);
}

/**
 * Presentes.
 *
 * São a moeda do vínculo: cada coração de cada personagem pede uma combinação (shared/bond.ts).
 * São genéricos de propósito — um ramo de sakura serve para quem gosta de flores, seja quem for —
 * para o catálogo não multiplicar por personagem a cada um que entra no jogo.
 */
export interface GiftSpec {
  id: string;
  name: string;
  /** Símbolo curto, para a lista e para os prêmios da roleta. */
  icon: string;
  chips: number;
}

export const GIFTS: GiftSpec[] = [
  { id: 'flor', name: 'Ramo de sakura', icon: '✿', chips: 400 },
  { id: 'bolo', name: 'Bolo de morango', icon: '🍰', chips: 500 },
  { id: 'cha', name: 'Chá de jasmim', icon: '🍵', chips: 450 },
  { id: 'livro', name: 'Livro de poemas', icon: '📖', chips: 700 },
  { id: 'leque', name: 'Leque pintado', icon: '🪭', chips: 800 },
  { id: 'fone', name: 'Fones dourados', icon: '🎧', chips: 900 },
  { id: 'incenso', name: 'Incenso de cedro', icon: '🕯', chips: 600 },
  { id: 'joia', name: 'Broche de jade', icon: '💎', chips: 1500 },
  { id: 'kimono', name: 'Kimono de seda', icon: '👘', chips: 3000 },
];

export const findGift = (id: string): GiftSpec | undefined => GIFTS.find((g) => g.id === id);

/** Temas de interface (o catálogo vive em src/ui/themes.ts; aqui só o id e o nome). */
const UI_THEMES: { id: string; name: string }[] = [
  { id: 'default', name: 'Sakura' },
  { id: 'victorian', name: 'Vitoriano' },
  { id: 'retro', name: 'Retrofuturista' },
];

/**
 * O preço de um acessório das mãos, pelo degrau dele.
 *
 * Era um preço só para todos (1.500), o que servia enquanto nenhum se comprava: agora que a loja
 * vende anéis, pulseiras e relógios, um fio de contas não pode custar o mesmo que um relógio de
 * mergulho. Cada degrau custa o dobro do anterior. O lendário **não se vende** — o preço dele existe
 * para o reembolso de repetido da roleta (shared/roulette.ts, `refundOf`), que sai desta tabela.
 */
export const PRECO_DO_ACESSORIO: Record<Raridade, number> = {
  comum: 1000,
  incomum: 2000,
  raro: 4000,
  epico: 8000,
  lendario: 12_000,
};

/** O preço de tabela de uma peça: o do tipo, com as exceções declaradas acima. */
function precoDe(kind: ItemKind, id: string): number {
  if (kind === 'acessorio') return PRECO_DO_ACESSORIO[rarityOf(itemKey(kind, id))];
  if (kind === 'winfx' && SPECIAL_FX.has(id)) return PRICES.winfxSpecial;
  if (kind === 'aura' && ASAS.has(id)) return PRICES.auraWings;
  if (kind === 'frame' && MOLDURAS_VIVAS.has(id)) return PRICES.frameSpecial;
  return PRICES[kind];
}

function entry(kind: ItemKind, id: string, name: string, chips?: number): CatalogItem {
  const key = itemKey(kind, id);
  return { key, kind, id, name, chips: free.has(key) ? 0 : (chips ?? precoDe(kind, id)) };
}

/** Tudo que existe no jogo, grátis ou não, na ordem em que a loja mostra. */
export const CATALOG: CatalogItem[] = [
  ...CHARACTER_PRESETS.map((c) => entry('character', c.id, c.name)),
  ...WIN_FX_IDS.map((id) => entry('winfx', id, id)),
  /*
   * Aura e moldura entram pelo id, como os efeitos de vitória.
   *
   * O nome bonito de cada uma mora junto com o desenho (src/render/aura.tsx e PortraitFrame.tsx),
   * que é onde ele é escrito junto com a peça; quem monta a vitrine resolve pelo `labelOf` da
   * loja. Este arquivo é do servidor também, e o servidor não desenha nada.
   */
  ...AURA_IDS.map((id) => entry('aura', id, id)),
  ...FRAME_IDS.map((id) => entry('frame', id, id)),
  ...ACESSORIOS.map((a) => entry('acessorio', a.id, a.nome)),
  ...FACE_PRESETS.map((s) => entry('face', s.id, s.name, s.special ? PRICES.faceSpecial : undefined)),
  ...BACK_PRESETS.map((s) => entry('back', s.id, s.name)),
  ...CHIP_PRESETS.map((s) => entry('chip', s.id, s.name)),
  ...TABLE_PRESETS.map((s) => entry('table', s.id, s.name)),
  ...UI_THEMES.map((t) => entry('ui', t.id, t.name)),
  ...GIFTS.map((g) => entry('gift', g.id, g.name, g.chips)),
];

const byKey = new Map(CATALOG.map((i) => [i.key, i]));

export function findItem(key: string): CatalogItem | undefined {
  return byKey.get(key);
}

export function itemsOfKind(kind: ItemKind): CatalogItem[] {
  return CATALOG.filter((i) => i.kind === kind);
}

/** Já vem com o jogo? (nunca é cobrado e nunca pode faltar) */
export function isFree(key: string): boolean {
  return free.has(key);
}

/**
 * Esta peça se compra na loja?
 *
 * A pergunta é **por peça**, não por tipo. Presentes e aparências se vendem todos (`isSold`). Dos
 * acessórios, vende-se o que é anel, pulseira ou relógio, **não é lendário**, não vem com o jogo e
 * não está em SO_DE_ROLETA. O resto do catálogo só sai de roleta.
 *
 * É a mesma função dos dois lados: a loja monta a prateleira com ela e o servidor (`buy`, em
 * server/accounts.ts) recusa com ela — não há como a vitrine oferecer o que a cobrança não aceita.
 */
export function estaAVenda(key: string): boolean {
  const item = findItem(key);
  if (!item) return false;
  if (isSold(item.kind)) return true;
  if (item.kind !== 'acessorio' || isFree(key)) return false;
  const tipo = findAcessorio(item.id)?.tipo;
  return !!tipo && ACESSORIOS_VENDIDOS.includes(tipo) && rarityOf(key) !== 'lendario' && !SO_DE_ROLETA.includes(key);
}

/** O jogador tem este item? O que é grátis conta como tendo, sempre; o que é de início, enquanto não foi perdido. */
export function owns(owned: readonly string[] | undefined, key: string): boolean {
  return isFree(key) || !!owned?.includes(key) || (deInicio.has(key) && !owned?.includes(marcaDePerdido(key)));
}

export function ownsItem(owned: readonly string[] | undefined, kind: ItemKind, id: string): boolean {
  return owns(owned, itemKey(kind, id));
}

/** Preço na moeda pedida (0 = grátis, null = não existe no catálogo). */
export function priceOf(key: string, currency: Currency): number | null {
  const item = findItem(key);
  if (!item) return null;
  if (!item.chips) return 0;
  return currency === 'pado' ? padoPrice(item.chips) : item.chips;
}

/** O primeiro item gratuito de um tipo — é para onde o servidor puxa quem não tem o escolhido. */
export function freeIdOf(kind: ItemKind): string {
  const key = FREE_KEYS.find((k) => k.startsWith(`${kind}:`));
  return key ? key.slice(kind.length + 1) : '';
}

// ---------------------------------------------------------------------
// A trava: cosméticos que o jogador não tem não entram na mesa
// ---------------------------------------------------------------------

/**
 * Corta para o gratuito tudo que a conta não possui.
 *
 * Roda **no servidor**, em cima do que o cliente mandou. É o que garante que ninguém apareça na
 * mesa com um personagem ou um efeito que não comprou — nem por cliente modificado, nem por um
 * `hello` forjado à mão.
 *
 * Um verso feito no Estúdio não está no catálogo: ele vale se **o preset de onde saiu** (`from`)
 * for do jogador. Assim a personalização continua livre, sobre as peças que a pessoa tem.
 */
export function clampCosmetics(c: PlayerCosmetics, owned: readonly string[] | undefined): PlayerCosmetics {
  const character = ownsItem(owned, 'character', c.character.id) ? c.character : findCharacter(freeIdOf('character'));
  const winFx = ownsItem(owned, 'winfx', c.winFx) ? c.winFx : (freeIdOf('winfx') as WinFxId);
  /*
   * Aura e moldura são vistas pelos outros (o cut-in e o retrato na mesa), então passam pela trava.
   *
   * As auras são uma lista, e a trava só **tira** da lista o que não é da conta — não põe o brilho
   * no lugar. Quem escolheu ficar sem aura continua sem aura; quem mandou uma que não tem perde só
   * aquela.
   */
  const auras = c.auras.filter((id) => ownsItem(owned, 'aura', id));
  const frame = ownsItem(owned, 'frame', c.frame) ? c.frame : (freeIdOf('frame') as FrameId);
  return {
    character,
    winFx,
    auras,
    frame,
    ...(c.acessorios ? { acessorios: clampAcessorios(c.acessorios, owned) } : {}),
    // Estes tres agora vao para a mesa dos outros (frente no showdown, fichas da
    // aposta, mesa quando o jogador e' o dealer), entao passam pela mesma trava.
    face: frenteNoQueTem(c.face, owned),
    back: estiloNoQueTem('back', c.back, owned, BACK_PRESETS),
    chip: estiloNoQueTem('chip', c.chip, owned, CHIP_PRESETS),
    table: estiloNoQueTem('table', c.table, owned, TABLE_PRESETS),
  };
}

/**
 * Um estilo de carta, ficha ou mesa, no que a conta tem.
 *
 * O do catálogo vai como está, se for da conta (senão, o gratuito). O feito no Estúdio não está no
 * catálogo: vai **encaixado** nas peças dos estilos da conta (shared/componentes.ts) — cada cor vira
 * a mais parecida das cores deles, cada escolha uma que algum deles tem. Era assim só com o verso, e
 * só quando o verso dizia de onde tinha saído; a frente, a ficha e a mesa feitas no Estúdio viravam
 * a gratuita na mesa dos outros, e o jogador via a dele só na própria tela.
 */
function estiloNoQueTem<T extends { id: string }>(kind: 'face' | 'back' | 'chip' | 'table', st: T, owned: readonly string[] | undefined, presets: readonly T[]): T {
  if (findItem(itemKey(kind, st.id))) return ownsItem(owned, kind, st.id) ? st : freePreset(kind, presets);
  return encaixar(kind, st, componentesDe(kind, presets.filter((p) => ownsItem(owned, kind, p.id))));
}

/** A frente: como os outros estilos, e o material (o vidro, o arco-íris) só se alguma frente da conta o tem. */
function frenteNoQueTem(face: CardFaceStyle, owned: readonly string[] | undefined): CardFaceStyle {
  const st = estiloNoQueTem('face', face, owned, FACE_PRESETS);
  if (!st.special || FACE_PRESETS.some((p) => p.special === st.special && ownsItem(owned, 'face', p.id))) return st;
  const { special: _material, ...depapel } = st;
  return depapel;
}

/**
 * Os acessórios, só com o que a conta tem: o anel, a pulseira e o relógio que não são dela saem — e,
 * dos que ela tem, não mais vezes do que ela tem (dois dedos com o mesmo anel pedem dois anéis); o
 * esmalte e a luva voltam para os que vêm com o jogo. (Como as auras: a trava tira, não põe.)
 */
export function clampAcessorios(a: Acessorios, owned: readonly string[] | undefined): Acessorios {
  const sobra = new Map<string, number>();
  // (primeiro o que vai nos braços, depois os anéis: tirando, sai o último que entrou na conta)
  const pega = (id: string): boolean => {
    if (!findAcessorio(id)) return false;
    const n = sobra.get(id) ?? quantasTem(owned, itemKey('acessorio', id));
    if (n < 1) return false;
    sobra.set(id, n - 1);
    return true;
  };
  const tem = (id: string) => !!findAcessorio(id) && ownsItem(owned, 'acessorio', id);
  return comLegado({
    bracos: { E: a.bracos.E.filter(pega), D: a.bracos.D.filter(pega) },
    aneis: a.aneis.filter((x) => pega(x.id)),
    esmalte: tem(a.esmalte) ? a.esmalte : ESMALTE_PADRAO,
    luvas: { E: tem(a.luvas.E) ? a.luvas.E : LUVA_PADRAO, D: tem(a.luvas.D) ? a.luvas.D : LUVA_PADRAO },
  });
}

/** Preset gratuito de um tipo, para quando o pedido nao e' do jogador. */
function freePreset<T extends { id: string }>(kind: ItemKind, presets: readonly T[]): T {
  const id = freeIdOf(kind);
  return presets.find((p) => p.id === id) ?? presets[0];
}

/** O verso é do jogador? (preset comprado, ou criado a partir de um que ele tem) */
export function ownsBack(back: { id: string; from?: string }, owned: readonly string[] | undefined): boolean {
  if (ownsItem(owned, 'back', back.id)) return true;
  // não é preset do catálogo: é criação do Estúdio, e vale pela peça de origem
  if (findItem(itemKey('back', back.id))) return false;
  return !!back.from && ownsItem(owned, 'back', back.from);
}

export function freeBack(): CardBackStyle {
  const id = freeIdOf('back');
  return BACK_PRESETS.find((b) => b.id === id) ?? BACK_PRESETS[0];
}
