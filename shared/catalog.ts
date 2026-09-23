import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  CHIP_PRESETS,
  FACE_PRESETS,
  TABLE_PRESETS,
  WIN_FX_IDS,
  findCharacter,
  type CardBackStyle,
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

export type ItemKind = 'character' | 'face' | 'back' | 'chip' | 'table' | 'winfx' | 'ui' | 'gift';

export const KIND_LABELS: Record<ItemKind, string> = {
  character: 'Personagens',
  face: 'Frente das cartas',
  back: 'Verso das cartas',
  chip: 'Fichas',
  table: 'Mesas',
  winfx: 'Efeitos de vitória',
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
 * Quem decide isto é o servidor: `buy` recusa chave de tipo que não esteja em VENDIDOS.
 */
export const VENDIDOS: readonly ItemKind[] = ['gift', 'ui'];
export const GALERIA: readonly ItemKind[] = ['character', 'winfx', 'back', 'face', 'chip', 'table'];

export const isSold = (kind: ItemKind): boolean => VENDIDOS.includes(kind);

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
  'ui:victorian': 'lendario',
  /*
   * O kimono é o presente do fim da escada.
   *
   * O vínculo cobra altura por coração (shared/bond.ts): o quinto só aceita lendário, e sem uma
   * peça aqui esse coração não teria com o que ser alimentado.
   */
  'gift:kimono': 'lendario',
  // épico: o presente que se guarda
  'gift:joia': 'epico',
  // épico: os efeitos de vitória com cena própria
  'winfx:prism': 'epico',
  'winfx:lightning': 'epico',
  'winfx:fire': 'epico',
  'winfx:ice': 'epico',
  'winfx:holy': 'epico',
  'winfx:void': 'epico',
  // raro: o conjunto vitoriano, o mais trabalhado de cada tipo
  'table:table-victorian': 'raro',
  'table:table-victorian-wine': 'raro',
  'back:back-victorian': 'raro',
  'back:back-victorian-green': 'raro',
  'face:face-victorian': 'raro',
  'chip:chip-victorian': 'raro',
  'gift:leque': 'raro',
  'gift:fone': 'raro',
  // incomum: os brilhos de uma cor e as peças de acabamento mais rico
  'winfx:azure': 'incomum',
  'winfx:rose': 'incomum',
  'winfx:emerald': 'incomum',
  'winfx:violet': 'incomum',
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
  // comum, por omissão: flor, chá e bolo — os presentes do primeiro coração
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
  face: 2500,
  back: 2500,
  chip: 2000,
  /** Presente sem preço próprio (todos têm o seu em GIFTS; isto é só o piso do tipo). */
  gift: 500,
} as const;

/** Efeitos com animação própria (fogo, relâmpago…) valem mais que um brilho de cor. */
const SPECIAL_FX = new Set(['prism', 'lightning', 'fire', 'ice', 'holy', 'void']);

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
  itemKey('ui', 'default'),
];

const free = new Set(FREE_KEYS);

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
];

function entry(kind: ItemKind, id: string, name: string, chips?: number): CatalogItem {
  const key = itemKey(kind, id);
  const price = chips ?? (kind === 'winfx' && SPECIAL_FX.has(id) ? PRICES.winfxSpecial : PRICES[kind]);
  return { key, kind, id, name, chips: free.has(key) ? 0 : price };
}

/** Tudo que existe no jogo, grátis ou não, na ordem em que a loja mostra. */
export const CATALOG: CatalogItem[] = [
  ...CHARACTER_PRESETS.map((c) => entry('character', c.id, c.name)),
  ...WIN_FX_IDS.map((id) => entry('winfx', id, id)),
  ...FACE_PRESETS.map((s) => entry('face', s.id, s.name)),
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

/** O jogador tem este item? O que é grátis conta como tendo, sempre. */
export function owns(owned: readonly string[] | undefined, key: string): boolean {
  return isFree(key) || !!owned?.includes(key);
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
  return {
    character,
    winFx,
    // Estes tres agora vao para a mesa dos outros (frente no showdown, fichas da
    // aposta, mesa quando o jogador e' o dealer), entao passam pela mesma trava.
    face: ownsItem(owned, 'face', c.face.id) ? c.face : freePreset('face', FACE_PRESETS),
    back: ownsBack(c.back, owned) ? c.back : freeBack(),
    chip: ownsItem(owned, 'chip', c.chip.id) ? c.chip : freePreset('chip', CHIP_PRESETS),
    table: ownsItem(owned, 'table', c.table.id) ? c.table : freePreset('table', TABLE_PRESETS),
  };
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
