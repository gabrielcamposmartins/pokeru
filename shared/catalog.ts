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

export type ItemKind = 'character' | 'face' | 'back' | 'chip' | 'table' | 'winfx' | 'ui';

export const KIND_LABELS: Record<ItemKind, string> = {
  character: 'Personagens',
  face: 'Frente das cartas',
  back: 'Verso das cartas',
  chip: 'Fichas',
  table: 'Mesas',
  winfx: 'Efeitos de vitória',
  ui: 'Aparência da interface',
};

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
 * Padocoin é caro: a economia do Discord trabalha em centenas, não em milhares. A conversão fixa
 * mantém os dois preços na mesma ordem sem precisar de uma tabela paralela para manter em dia.
 */
export const PADO_PER_CHIP = 50;
export const padoPrice = (chips: number): number => Math.ceil(chips / PADO_PER_CHIP);

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

/** Temas de interface (o catálogo vive em src/ui/themes.ts; aqui só o id e o nome). */
const UI_THEMES: { id: string; name: string }[] = [
  { id: 'default', name: 'Sakura' },
  { id: 'victorian', name: 'Vitoriano' },
];

function entry(kind: ItemKind, id: string, name: string): CatalogItem {
  const key = itemKey(kind, id);
  const price = kind === 'winfx' && SPECIAL_FX.has(id) ? PRICES.winfxSpecial : PRICES[kind];
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
