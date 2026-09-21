import type { Suit } from './cards';

/* =====================================================================
 * Sistema de estilos (cosméticos).
 * Tudo é dado puro (JSON) renderizado via SVG no cliente — assim qualquer
 * estilo pode ser criado no Estúdio, salvo, exportado e compartilhado.
 * ===================================================================== */

export type FontKey = 'serif' | 'sans' | 'rounded' | 'fancy' | 'mono' | 'classic';
export const FONT_KEYS: FontKey[] = ['serif', 'sans', 'rounded', 'fancy', 'mono', 'classic'];

export interface CardFaceStyle {
  id: string;
  name: string;
  bg: string;
  bgGradient: string;
  border: string;
  borderWidth: number; // 0..14 (no espaço 250x350)
  radius: number; // 0..40
  frame: 'none' | 'line' | 'double' | 'ornate';
  frameColor: string;
  suitColors: Record<Suit, string>;
  font: FontKey;
  indexScale: number; // 0.8..1.5
  center: 'pips' | 'big' | 'minimal';
  court: 'letter' | 'crest';
  courtColor: string;
  courtAccent: string;
}

export type BackPattern =
  | 'solid'
  | 'stripes'
  | 'diamonds'
  | 'dots'
  | 'checker'
  | 'waves'
  | 'lattice'
  | 'stars'
  | 'sakura'
  | 'scales'
  | 'damask';
export const BACK_PATTERNS: BackPattern[] = [
  'solid',
  'stripes',
  'diamonds',
  'dots',
  'checker',
  'waves',
  'lattice',
  'stars',
  'sakura',
  'scales',
  'damask',
];

export type Emblem = 'none' | 'spade' | 'heart' | 'diamond' | 'club' | 'star' | 'moon' | 'crown' | 'flower' | 'fleur' | 'text';
export const EMBLEMS: Emblem[] = ['none', 'spade', 'heart', 'diamond', 'club', 'star', 'moon', 'crown', 'flower', 'fleur', 'text'];

export interface CardBackStyle {
  id: string;
  name: string;
  base: string;
  base2: string;
  pattern: BackPattern;
  patternColor: string;
  patternScale: number; // 0.5..2
  patternOpacity: number; // 0..1
  border: string;
  frame: string;
  borderWidth: number; // 0..24
  radius: number; // 0..40
  emblem: Emblem;
  emblemColor: string;
  emblemBg: string;
  emblemText: string; // até 3 caracteres
  /** Imagem personalizada (data URL). Apenas local — nunca enviada pela rede. */
  image?: string;
  imageOpacity: number;
  /**
   * Preset de onde este estilo saiu, quando é criação do Estúdio. É por ele que o servidor sabe
   * que a pessoa tem direito ao verso personalizado (veja `ownsBack` em shared/catalog.ts).
   */
  from?: string;
}

export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000, 5000, 25000] as const;

export interface ChipTier {
  base: string;
  edge: string;
  text: string;
}

export interface ChipStyle {
  id: string;
  name: string;
  tiers: ChipTier[]; // um por valor em CHIP_VALUES
  edgePattern: 'blocks' | 'stripes' | 'dots' | 'none';
  edgeCount: number; // 4..12
  inlay: 'ring' | 'solid' | 'dashed';
  showValue: boolean;
  shine: boolean;
}

export type TablePattern = 'none' | 'lines' | 'hex' | 'sakura' | 'suits' | 'damask';
export const TABLE_PATTERNS: TablePattern[] = ['none', 'lines', 'hex', 'sakura', 'suits', 'damask'];

export interface TableStyle {
  id: string;
  name: string;
  felt: string;
  feltLight: string;
  rail: string;
  railAccent: string;
  pattern: TablePattern;
  patternColor: string;
  logoText: string;
  logoColor: string;
  bgTop: string;
  bgBottom: string;
}

export interface AvatarInfo {
  color: string;
  icon: string;
}

export const AVATAR_ICONS = ['♠', '♥', '♦', '♣', '★', '☾', '❀', '♛', '⚡', '☯', '♞', '✿'];

/**
 * Efeito das cartas vencedoras. Aqui ficam só os ids (é o que viaja na rede);
 * o visual de cada um está no catálogo em src/render/cardfx.tsx.
 */
export const WIN_FX_IDS = ['gold', 'azure', 'rose', 'emerald', 'violet', 'prism', 'lightning', 'fire', 'ice', 'holy', 'void'] as const;
export type WinFxId = (typeof WIN_FX_IDS)[number];
export const DEFAULT_WIN_FX: WinFxId = 'gold';

/** Cosméticos que os outros jogadores veem (enviados pela rede). */
export interface PlayerCosmetics {
  back: CardBackStyle;
  character: CharacterStyle;
  /** Id do efeito das cartas quando o jogador ganha (veja WIN_FX_IDS). */
  winFx: WinFxId;
}

// ---------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------

export const FACE_PRESETS: CardFaceStyle[] = [
  {
    id: 'face-classic',
    name: 'Clássico',
    bg: '#fffdf7',
    bgGradient: '#f3ecdd',
    border: '#d8ccb4',
    borderWidth: 3,
    radius: 18,
    frame: 'none',
    frameColor: '#c9b58e',
    suitColors: { s: '#1b1b24', h: '#d0243b', d: '#d0243b', c: '#1b1b24' },
    font: 'serif',
    indexScale: 1,
    center: 'pips',
    court: 'crest',
    courtColor: '#1f2a5a',
    courtAccent: '#c9a13b',
  },
  {
    id: 'face-four',
    name: 'Quatro Cores',
    bg: '#ffffff',
    bgGradient: '#eef1f6',
    border: '#c8cfdb',
    borderWidth: 3,
    radius: 18,
    frame: 'none',
    frameColor: '#9aa6b8',
    suitColors: { s: '#1d1f27', h: '#e0263e', d: '#1f6fe0', c: '#1c9a4c' },
    font: 'sans',
    indexScale: 1.25,
    center: 'big',
    court: 'letter',
    courtColor: '#2a2f45',
    courtAccent: '#e0a526',
  },
  {
    id: 'face-sakura',
    name: 'Sakura',
    bg: '#fff5f8',
    bgGradient: '#ffe1ea',
    border: '#f2a7bf',
    borderWidth: 4,
    radius: 26,
    frame: 'line',
    frameColor: '#f6bfd0',
    suitColors: { s: '#3b2d5c', h: '#e2466f', d: '#e2466f', c: '#3b2d5c' },
    font: 'rounded',
    indexScale: 1.1,
    center: 'big',
    court: 'crest',
    courtColor: '#8a3a64',
    courtAccent: '#f2a7bf',
  },
  {
    id: 'face-gold',
    name: 'Noite Dourada',
    bg: '#1a1d33',
    bgGradient: '#0e1022',
    border: '#d6b25e',
    borderWidth: 5,
    radius: 16,
    frame: 'ornate',
    frameColor: '#b8913e',
    suitColors: { s: '#f1e2b0', h: '#ff5d73', d: '#ff5d73', c: '#f1e2b0' },
    font: 'fancy',
    indexScale: 1,
    center: 'pips',
    court: 'crest',
    courtColor: '#f1e2b0',
    courtAccent: '#d6b25e',
  },
  {
    id: 'face-neon',
    name: 'Neon',
    bg: '#0b0b14',
    bgGradient: '#171230',
    border: '#35f0ff',
    borderWidth: 4,
    radius: 22,
    frame: 'double',
    frameColor: '#ff3df2',
    suitColors: { s: '#35f0ff', h: '#ff3df2', d: '#ffd23d', c: '#6bff7a' },
    font: 'mono',
    indexScale: 1.2,
    center: 'minimal',
    court: 'letter',
    courtColor: '#35f0ff',
    courtAccent: '#ff3df2',
  },
  {
    id: 'face-jade',
    name: 'Jade',
    bg: '#eef7f0',
    bgGradient: '#d5eadb',
    border: '#6fae85',
    borderWidth: 4,
    radius: 20,
    frame: 'line',
    frameColor: '#9ccbab',
    suitColors: { s: '#1f3b2c', h: '#c0392b', d: '#c0392b', c: '#1f3b2c' },
    font: 'serif',
    indexScale: 1,
    center: 'pips',
    court: 'crest',
    courtColor: '#1f5a3c',
    courtAccent: '#c9a13b',
  },
  {
    id: 'face-victorian',
    name: 'Vitoriana',
    bg: '#fbf5e6',
    bgGradient: '#eadcbc',
    border: '#8a6a2e',
    borderWidth: 4,
    radius: 12,
    frame: 'ornate',
    frameColor: '#b08d4a',
    suitColors: { s: '#1c1714', h: '#8e1c2b', d: '#8e1c2b', c: '#1c1714' },
    font: 'classic',
    indexScale: 1,
    center: 'pips',
    court: 'crest',
    courtColor: '#5a1420',
    courtAccent: '#b08d4a',
  },
];

export const BACK_PRESETS: CardBackStyle[] = [
  {
    id: 'back-royal',
    name: 'Real Azul',
    base: '#1e3a8a',
    base2: '#14286a',
    pattern: 'lattice',
    patternColor: '#9db7ff',
    patternScale: 1,
    patternOpacity: 0.45,
    border: '#ffffff',
    frame: '#c9d7ff',
    borderWidth: 12,
    radius: 18,
    emblem: 'spade',
    emblemColor: '#ffffff',
    emblemBg: '#2c4db8',
    emblemText: 'PS',
    imageOpacity: 1,
  },
  {
    id: 'back-sakura',
    name: 'Sakura',
    base: '#f26d97',
    base2: '#d94a7b',
    pattern: 'sakura',
    patternColor: '#ffe3ec',
    patternScale: 1,
    patternOpacity: 0.7,
    border: '#fff6f9',
    frame: '#ffd0de',
    borderWidth: 12,
    radius: 22,
    emblem: 'flower',
    emblemColor: '#fff6f9',
    emblemBg: '#c73c6c',
    emblemText: '桜',
    imageOpacity: 1,
  },
  {
    id: 'back-crimson',
    name: 'Carmim',
    base: '#a4161a',
    base2: '#7a0c10',
    pattern: 'diamonds',
    patternColor: '#ffb3a7',
    patternScale: 1,
    patternOpacity: 0.35,
    border: '#fff4e6',
    frame: '#f2c14e',
    borderWidth: 12,
    radius: 16,
    emblem: 'crown',
    emblemColor: '#f2c14e',
    emblemBg: '#6a0a0e',
    emblemText: 'K',
    imageOpacity: 1,
  },
  {
    id: 'back-midnight',
    name: 'Meia-noite',
    base: '#141433',
    base2: '#27185a',
    pattern: 'stars',
    patternColor: '#ffe9a8',
    patternScale: 1,
    patternOpacity: 0.8,
    border: '#2e2a6b',
    frame: '#ffd66b',
    borderWidth: 10,
    radius: 18,
    emblem: 'moon',
    emblemColor: '#ffe9a8',
    emblemBg: '#1c1646',
    emblemText: '☾',
    imageOpacity: 1,
  },
  {
    id: 'back-jade',
    name: 'Ondas de Jade',
    base: '#1d7a5f',
    base2: '#0f5a45',
    pattern: 'waves',
    patternColor: '#bff0dc',
    patternScale: 1,
    patternOpacity: 0.45,
    border: '#f4fff9',
    frame: '#d4b45a',
    borderWidth: 12,
    radius: 18,
    emblem: 'club',
    emblemColor: '#f4fff9',
    emblemBg: '#0f5a45',
    emblemText: '玉',
    imageOpacity: 1,
  },
  {
    id: 'back-gold',
    name: 'Ouro Imperial',
    base: '#2a1a08',
    base2: '#4a2f0c',
    pattern: 'scales',
    patternColor: '#e8c46a',
    patternScale: 1,
    patternOpacity: 0.5,
    border: '#e8c46a',
    frame: '#fff1c1',
    borderWidth: 10,
    radius: 16,
    emblem: 'star',
    emblemColor: '#ffe7a0',
    emblemBg: '#2a1a08',
    emblemText: '金',
    imageOpacity: 1,
  },
  {
    id: 'back-victorian',
    name: 'Brasão Bordô',
    base: '#5e1420',
    base2: '#2e0a10',
    pattern: 'damask',
    patternColor: '#d9b56a',
    patternScale: 1,
    patternOpacity: 0.38,
    border: '#efe3c6',
    frame: '#b08d4a',
    borderWidth: 12,
    radius: 12,
    emblem: 'fleur',
    emblemColor: '#e2c27a',
    emblemBg: '#3a0c14',
    emblemText: 'PS',
    imageOpacity: 1,
  },
  {
    id: 'back-victorian-green',
    name: 'Salão Esmeralda',
    base: '#1f4a36',
    base2: '#0f2a1f',
    pattern: 'damask',
    patternColor: '#cdb27a',
    patternScale: 1,
    patternOpacity: 0.32,
    border: '#efe3c6',
    frame: '#b08d4a',
    borderWidth: 12,
    radius: 12,
    emblem: 'crown',
    emblemColor: '#e2c27a',
    emblemBg: '#0f2a1f',
    emblemText: 'PS',
    imageOpacity: 1,
  },
];

export const CHIP_PRESETS: ChipStyle[] = [
  {
    id: 'chip-casino',
    name: 'Cassino',
    tiers: [
      { base: '#f4f1ea', edge: '#2f6fd6', text: '#2f3440' },
      { base: '#d8262f', edge: '#ffffff', text: '#ffffff' },
      { base: '#1f9d4d', edge: '#ffffff', text: '#ffffff' },
      { base: '#1d1d22', edge: '#ffffff', text: '#ffffff' },
      { base: '#6d2bb3', edge: '#ffd24a', text: '#ffffff' },
      { base: '#f2a516', edge: '#1d1d22', text: '#1d1d22' },
      { base: '#ec5fa4', edge: '#ffffff', text: '#ffffff' },
      { base: '#2a9ad6', edge: '#ffd24a', text: '#ffffff' },
    ],
    edgePattern: 'blocks',
    edgeCount: 6,
    inlay: 'ring',
    showValue: true,
    shine: true,
  },
  {
    id: 'chip-pastel',
    name: 'Pastel Sakura',
    tiers: [
      { base: '#fdf6ff', edge: '#c7a7ff', text: '#6b4fa0' },
      { base: '#ffb3c6', edge: '#ffffff', text: '#8a2346' },
      { base: '#b8f2d0', edge: '#ffffff', text: '#1d6a43' },
      { base: '#a9c7ff', edge: '#ffffff', text: '#223f7a' },
      { base: '#d9b8ff', edge: '#fff6c9', text: '#4d2a82' },
      { base: '#ffe29a', edge: '#ffffff', text: '#7a5510' },
      { base: '#ffc2e8', edge: '#b28dff', text: '#7a1f5c' },
      { base: '#9fe8f2', edge: '#ffc2e8', text: '#12555e' },
    ],
    edgePattern: 'dots',
    edgeCount: 8,
    inlay: 'dashed',
    showValue: true,
    shine: true,
  },
  {
    id: 'chip-metal',
    name: 'Metálico',
    tiers: [
      { base: '#c9ccd3', edge: '#8a8f99', text: '#2b2e35' },
      { base: '#b87333', edge: '#f0c9a0', text: '#2b1705' },
      { base: '#8c9aa6', edge: '#e6edf2', text: '#1d252b' },
      { base: '#d4af37', edge: '#fff3b8', text: '#3a2c05' },
      { base: '#4b5563', edge: '#d4af37', text: '#f5e6a8' },
      { base: '#e5e4e2', edge: '#9aa0a6', text: '#23262b' },
      { base: '#8b1e3f', edge: '#d4af37', text: '#ffe7a3' },
      { base: '#1f2937', edge: '#e5e4e2', text: '#e5e4e2' },
    ],
    edgePattern: 'stripes',
    edgeCount: 10,
    inlay: 'solid',
    showValue: true,
    shine: true,
  },
  {
    id: 'chip-neon',
    name: 'Neon',
    tiers: [
      { base: '#12121c', edge: '#35f0ff', text: '#35f0ff' },
      { base: '#12121c', edge: '#ff3df2', text: '#ff3df2' },
      { base: '#12121c', edge: '#6bff7a', text: '#6bff7a' },
      { base: '#12121c', edge: '#ffd23d', text: '#ffd23d' },
      { base: '#1c0f2e', edge: '#b07bff', text: '#e0c8ff' },
      { base: '#2a1405', edge: '#ff8a3d', text: '#ffc08f' },
      { base: '#05222a', edge: '#35f0ff', text: '#ffffff' },
      { base: '#2a0520', edge: '#ffffff', text: '#ff3df2' },
    ],
    edgePattern: 'stripes',
    edgeCount: 8,
    inlay: 'ring',
    showValue: true,
    shine: false,
  },
  {
    id: 'chip-victorian',
    name: 'Marfim e Latão',
    tiers: [
      { base: '#efe6d2', edge: '#8a6a2e', text: '#3a2a14' },
      { base: '#7a1a26', edge: '#e9dcc0', text: '#f3e9d2' },
      { base: '#1f4a36', edge: '#e2c27a', text: '#f3e9d2' },
      { base: '#1c1714', edge: '#c9a25a', text: '#e9d6a6' },
      { base: '#4a2a4f', edge: '#e2c27a', text: '#f3e9d2' },
      { base: '#b08d4a', edge: '#3a2a14', text: '#2a1c0c' },
      { base: '#1d2b4a', edge: '#e9dcc0', text: '#e9dcc0' },
      { base: '#5e1420', edge: '#e2c27a', text: '#f6e7b8' },
    ],
    edgePattern: 'stripes',
    edgeCount: 8,
    inlay: 'ring',
    showValue: true,
    shine: true,
  },
];

export const TABLE_PRESETS: TableStyle[] = [
  {
    id: 'table-green',
    name: 'Feltro Clássico',
    felt: '#1f7a4a',
    feltLight: '#2fa266',
    rail: '#4a2616',
    railAccent: '#c9a13b',
    pattern: 'none',
    patternColor: '#ffffff',
    logoText: 'POKERU',
    logoColor: '#ffffff',
    bgTop: '#1a1530',
    bgBottom: '#0b0a18',
  },
  {
    // o id fica: perfis salvos apontam para ele (o nome é que mudou com a marca)
    id: 'table-soul',
    name: 'Roxo Sakura',
    felt: '#3b2a7a',
    feltLight: '#5a43b0',
    rail: '#1c1238',
    railAccent: '#f2c14e',
    pattern: 'sakura',
    patternColor: '#ffd0e0',
    logoText: 'ポケル',
    logoColor: '#ffd0e0',
    bgTop: '#2a1a4a',
    bgBottom: '#0d0820',
  },
  {
    id: 'table-royal',
    name: 'Azul Real',
    felt: '#17457a',
    feltLight: '#2466ad',
    rail: '#101a2e',
    railAccent: '#d4af37',
    pattern: 'suits',
    patternColor: '#9fc3ff',
    logoText: '♠ ♥ ♦ ♣',
    logoColor: '#cfe0ff',
    bgTop: '#0f1a33',
    bgBottom: '#050a16',
  },
  {
    id: 'table-wine',
    name: 'Vinho',
    felt: '#7a1f33',
    feltLight: '#a3304b',
    rail: '#2b0c12',
    railAccent: '#e8c46a',
    pattern: 'lines',
    patternColor: '#ffb3c1',
    logoText: 'ROYAL',
    logoColor: '#ffd9a0',
    bgTop: '#2a0d16',
    bgBottom: '#0e0408',
  },
  {
    id: 'table-night',
    name: 'Noite Neon',
    felt: '#111827',
    feltLight: '#1f2a44',
    rail: '#05070d',
    railAccent: '#35f0ff',
    pattern: 'hex',
    patternColor: '#35f0ff',
    logoText: 'NEON',
    logoColor: '#ff3df2',
    bgTop: '#0b0f1f',
    bgBottom: '#000000',
  },
  {
    id: 'table-victorian',
    name: 'Salão Vitoriano',
    felt: '#1d4a34',
    feltLight: '#2c6647',
    rail: '#3a1a10',
    railAccent: '#c9a25a',
    pattern: 'damask',
    patternColor: '#e2c27a',
    logoText: 'POKERU',
    logoColor: '#e2c27a',
    bgTop: '#3a1418',
    bgBottom: '#0e0506',
  },
  {
    id: 'table-victorian-wine',
    name: 'Veludo Bordô',
    felt: '#5e1420',
    feltLight: '#7e2330',
    rail: '#1c0f0a',
    railAccent: '#c9a25a',
    pattern: 'damask',
    patternColor: '#f0cf8a',
    logoText: 'ROYAL CLUB',
    logoColor: '#f0cf8a',
    bgTop: '#1d2a22',
    bgBottom: '#070b09',
  },
];

// ---------------------------------------------------------------------
// Sanitização (para dados vindos da rede ou de importação)
// ---------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v : fallback;
}
function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}
function text(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function sanitizeFace(v: unknown): CardFaceStyle {
  const o = obj(v);
  const d = FACE_PRESETS[0];
  const sc = obj(o.suitColors);
  return {
    id: text(o.id, 64, d.id),
    name: text(o.name, 40, d.name),
    bg: color(o.bg, d.bg),
    bgGradient: color(o.bgGradient, d.bgGradient),
    border: color(o.border, d.border),
    borderWidth: num(o.borderWidth, 0, 14, d.borderWidth),
    radius: num(o.radius, 0, 40, d.radius),
    frame: oneOf(o.frame, ['none', 'line', 'double', 'ornate'] as const, d.frame),
    frameColor: color(o.frameColor, d.frameColor),
    suitColors: {
      s: color(sc.s, d.suitColors.s),
      h: color(sc.h, d.suitColors.h),
      d: color(sc.d, d.suitColors.d),
      c: color(sc.c, d.suitColors.c),
    },
    font: oneOf(o.font, FONT_KEYS, d.font),
    indexScale: num(o.indexScale, 0.8, 1.5, d.indexScale),
    center: oneOf(o.center, ['pips', 'big', 'minimal'] as const, d.center),
    court: oneOf(o.court, ['letter', 'crest'] as const, d.court),
    courtColor: color(o.courtColor, d.courtColor),
    courtAccent: color(o.courtAccent, d.courtAccent),
  };
}

export function sanitizeBack(v: unknown, allowImage = false): CardBackStyle {
  const o = obj(v);
  const d = BACK_PRESETS[0];
  const img =
    allowImage && typeof o.image === 'string' && o.image.startsWith('data:image/') && o.image.length < 600_000
      ? o.image
      : undefined;
  return {
    id: text(o.id, 64, d.id),
    name: text(o.name, 40, d.name),
    from: typeof o.from === 'string' && o.from ? o.from.slice(0, 64) : undefined,
    base: color(o.base, d.base),
    base2: color(o.base2, d.base2),
    pattern: oneOf(o.pattern, BACK_PATTERNS, d.pattern),
    patternColor: color(o.patternColor, d.patternColor),
    patternScale: num(o.patternScale, 0.5, 2, d.patternScale),
    patternOpacity: num(o.patternOpacity, 0, 1, d.patternOpacity),
    border: color(o.border, d.border),
    frame: color(o.frame, d.frame),
    borderWidth: num(o.borderWidth, 0, 24, d.borderWidth),
    radius: num(o.radius, 0, 40, d.radius),
    emblem: oneOf(o.emblem, EMBLEMS, d.emblem),
    emblemColor: color(o.emblemColor, d.emblemColor),
    emblemBg: color(o.emblemBg, d.emblemBg),
    emblemText: text(o.emblemText, 3, d.emblemText),
    image: img,
    imageOpacity: num(o.imageOpacity, 0, 1, 1),
  };
}

export function sanitizeChip(v: unknown): ChipStyle {
  const o = obj(v);
  const d = CHIP_PRESETS[0];
  const tiers = Array.isArray(o.tiers) ? o.tiers : [];
  return {
    id: text(o.id, 64, d.id),
    name: text(o.name, 40, d.name),
    tiers: d.tiers.map((dt, i) => {
      const t = obj(tiers[i]);
      return { base: color(t.base, dt.base), edge: color(t.edge, dt.edge), text: color(t.text, dt.text) };
    }),
    edgePattern: oneOf(o.edgePattern, ['blocks', 'stripes', 'dots', 'none'] as const, d.edgePattern),
    edgeCount: Math.round(num(o.edgeCount, 4, 12, d.edgeCount)),
    inlay: oneOf(o.inlay, ['ring', 'solid', 'dashed'] as const, d.inlay),
    showValue: typeof o.showValue === 'boolean' ? o.showValue : d.showValue,
    shine: typeof o.shine === 'boolean' ? o.shine : d.shine,
  };
}

export function sanitizeTable(v: unknown): TableStyle {
  const o = obj(v);
  const d = TABLE_PRESETS[0];
  return {
    id: text(o.id, 64, d.id),
    name: text(o.name, 40, d.name),
    felt: color(o.felt, d.felt),
    feltLight: color(o.feltLight, d.feltLight),
    rail: color(o.rail, d.rail),
    railAccent: color(o.railAccent, d.railAccent),
    pattern: oneOf(o.pattern, TABLE_PATTERNS, d.pattern),
    patternColor: color(o.patternColor, d.patternColor),
    logoText: text(o.logoText, 24, d.logoText),
    logoColor: color(o.logoColor, d.logoColor),
    bgTop: color(o.bgTop, d.bgTop),
    bgBottom: color(o.bgBottom, d.bgBottom),
  };
}

export function sanitizeAvatar(v: unknown): AvatarInfo {
  const o = obj(v);
  return {
    color: color(o.color, '#7c5cff'),
    icon: oneOf(o.icon, AVATAR_ICONS, AVATAR_ICONS[0]),
  };
}

/** Cosméticos para envio pela rede: sem imagens. */
export function sanitizeWinFx(v: unknown): WinFxId {
  return oneOf(v, WIN_FX_IDS, DEFAULT_WIN_FX);
}

export function sanitizeCosmetics(v: unknown): PlayerCosmetics {
  const o = obj(v);
  return { back: sanitizeBack(o.back, false), character: sanitizeCharacter(o.character), winFx: sanitizeWinFx(o.winFx) };
}

// ---------------------------------------------------------------------
// Personagens — arte em public/characters/<id>/ (full.png + portrait.png),
// gerada por `npm run prepare:characters` a partir de assets/characters/.
// ---------------------------------------------------------------------

export interface CharacterStyle {
  id: string;
  name: string;
  title: string;
  /** Cores do fundo do retrato e do cut-in. */
  bg: string;
  bg2: string;
  /** Falas ao clicar no personagem. */
  lines: string[];
  /** Ilustração de corpo inteiro (fundo transparente). */
  full: string;
  /** Retrato quadrado usado na mesa. */
  portrait: string;
}

export const CHARACTER_PRESETS: CharacterStyle[] = [
  {
    id: 'marina',
    name: 'Marina',
    title: 'A Fênix da Mesa',
    bg: '#ff8a5c',
    bg2: '#8e1b2b',
    lines: ['Bora apostar alto!', 'Sorte? Eu chamo de talento!', 'Piscou, perdeu o pote!', 'Essa mesa é minha hoje!'],
    full: '/characters/marina/full.png',
    portrait: '/characters/marina/portrait.png',
  },
  {
    id: 'ren',
    name: 'Ren',
    title: 'O Estrategista de Jade',
    bg: '#48b487',
    bg2: '#0f2a22',
    lines: ['Cada ficha tem um propósito.', 'Vejo três jogadas à frente.', 'Paciência é a arma mais afiada.'],
    full: '/characters/ren/full.png',
    portrait: '/characters/ren/portrait.png',
  },
  {
    id: 'tobi',
    name: 'Tobi',
    title: 'O Coringa Sortudo',
    bg: '#ffd35c',
    bg2: '#2b3f9e',
    lines: ['Ei, ei! Bora de all-in?', 'Hoje a sorte tá do meu lado!', 'Tsumo! ...opa, jogo errado!'],
    full: '/characters/tobi/full.png',
    portrait: '/characters/tobi/portrait.png',
  },
  {
    id: 'yukina',
    name: 'Yukina',
    title: 'Flor de Gelo',
    bg: '#bcd3ff',
    bg2: '#2d3f8f',
    lines: ['O inverno ensina a esperar.', 'Uma mão silenciosa vale mais que mil blefes.', 'Hmm... interessante.'],
    full: '/characters/yukina/full.png',
    portrait: '/characters/yukina/portrait.png',
  },
];

export function findCharacter(id: string): CharacterStyle {
  return CHARACTER_PRESETS.find((c) => c.id === id) ?? CHARACTER_PRESETS[0];
}

/** Na rede o personagem é identificado pelo id; a arte é sempre a oficial. */
export function sanitizeCharacter(v: unknown): CharacterStyle {
  const o = obj(v);
  return findCharacter(typeof o.id === 'string' ? o.id : '');
}

export function sanitizeName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) : '';
  return s || 'Jogador';
}
