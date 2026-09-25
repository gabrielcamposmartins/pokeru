/**
 * As peças de personalização que a conta liberou — cores, símbolos, padrões.
 *
 * O Estúdio monta estilos novos (frente, verso, ficha, mesa) mexendo em cada peça de um estilo. Se
 * qualquer cor e qualquer padrão estivessem abertos, a roleta não valeria nada: bastava copiar no
 * editor o verso que se queria. Então as peças à disposição são **as dos estilos que a conta tem**
 * — as cores que aparecem neles, os emblemas, os padrões, as molduras, as fontes. Ganhar um verso
 * novo abre também as peças dele para as criações.
 *
 * Tirar um elemento nunca é desbloquear nada: "sem padrão", "sem emblema", "sem moldura" estão
 * sempre abertos. Números (escala, espessura, arredondamento) ficam livres — são proporção, não peça.
 *
 * Este arquivo é comum ao cliente (o editor só oferece o que está aqui) e ao servidor, que encaixa
 * os versos personalizados no que a conta tem antes de mostrá-los na mesa (veja `clampCosmetics`).
 */

export type KindComponente = 'face' | 'back' | 'chip' | 'table';

/** Os campos de escolha (não de cor) de cada tipo de estilo. */
export const CAMPOS_DE_ESCOLHA: Record<KindComponente, readonly string[]> = {
  face: ['frame', 'center', 'court', 'font'],
  back: ['pattern', 'emblem'],
  chip: ['edgePattern', 'inlay'],
  table: ['pattern'],
};

/** O que está sempre aberto em cada campo: tirar o elemento. */
const SEMPRE: Record<string, readonly string[]> = {
  'face.frame': ['none'],
  'back.pattern': ['solid'],
  'back.emblem': ['none'],
  'chip.edgePattern': ['none'],
  'table.pattern': ['none'],
};

/** Campos de texto livre, que não são peça nenhuma. */
const NAO_E_PECA = new Set(['id', 'name', 'from', 'image', 'logoText', 'emblemText']);

const COR = /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\))$/i;

export const ehCor = (v: unknown): v is string => typeof v === 'string' && COR.test(v.trim());

const normaliza = (c: string): string => c.trim().toLowerCase();

export interface Componentes {
  /** As cores que aparecem nos estilos da conta (sem repetição). */
  cores: string[];
  /** Para cada campo de escolha, os valores liberados. */
  opcoes: Record<string, string[]>;
}

/** Junta as cores de um valor qualquer (os estilos têm cores aninhadas: naipes, fichas por valor). */
function juntaCores(v: unknown, out: Set<string>, campo?: string): void {
  if (campo && NAO_E_PECA.has(campo)) return;
  if (ehCor(v)) out.add(normaliza(v));
  else if (Array.isArray(v)) for (const x of v) juntaCores(x, out);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) juntaCores(x, out, k);
}

/** As peças dos estilos que a conta tem (os presets comprados ou gratuitos daquele tipo). */
export function componentesDe(kind: KindComponente, estilos: readonly object[]): Componentes {
  const cores = new Set<string>();
  for (const e of estilos) juntaCores(e, cores);
  const opcoes: Record<string, string[]> = {};
  for (const campo of CAMPOS_DE_ESCOLHA[kind]) {
    const vals = new Set<string>(SEMPRE[`${kind}.${campo}`] ?? []);
    for (const e of estilos) {
      const v = (e as Record<string, unknown>)[campo];
      if (typeof v === 'string') vals.add(v);
    }
    opcoes[campo] = [...vals];
  }
  return { cores: [...cores], opcoes };
}

/** A opção está liberada? */
export const liberado = (comp: Componentes, campo: string, valor: string): boolean => comp.opcoes[campo]?.includes(valor) ?? false;

// ------------------------------------------------------------------ cores: a mais próxima

function rgbDe(c: string): [number, number, number] | null {
  const s = normaliza(c);
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const hex = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
    const n = parseInt(hex, 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
  }
  const m = s.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
  return [r, g, b].every(Number.isFinite) ? [r, g, b] : null;
}

/** A cor da paleta mais parecida com `c` (a própria, se já estiver nela). */
export function corMaisProxima(c: string, paleta: readonly string[]): string {
  const alvo = normaliza(c);
  if (!paleta.length || paleta.includes(alvo)) return alvo;
  const rgb = rgbDe(alvo);
  if (!rgb) return paleta[0];
  let melhor = paleta[0];
  let dist = Infinity;
  for (const p of paleta) {
    const q = rgbDe(p);
    if (!q) continue;
    // distância ponderada pelo olho: o verde pesa mais que o azul
    const d = 2 * (q[0] - rgb[0]) ** 2 + 4 * (q[1] - rgb[1]) ** 2 + 3 * (q[2] - rgb[2]) ** 2;
    if (d < dist) {
      dist = d;
      melhor = p;
    }
  }
  return melhor;
}

function trocaCores(v: unknown, f: (c: string) => string, campo?: string): unknown {
  if (campo && NAO_E_PECA.has(campo)) return v;
  if (ehCor(v)) return f(v);
  if (Array.isArray(v)) return v.map((x) => trocaCores(x, f));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trocaCores(x, f, k)]));
  return v;
}

/**
 * Encaixa um estilo no que a conta tem: cada cor vira a mais parecida da paleta, e cada escolha que
 * não está liberada vira a primeira que está.
 *
 * É o que o servidor faz com um verso personalizado antes de pô-lo na mesa, e o que o Estúdio faz
 * com um estilo importado: em vez de recusar tudo, o estilo chega o mais perto possível do que era
 * com as peças que a pessoa tem.
 */
export function encaixar<T extends object>(kind: KindComponente, st: T, comp: Componentes): T {
  const out = trocaCores(st, (c) => corMaisProxima(c, comp.cores)) as Record<string, unknown>;
  for (const campo of CAMPOS_DE_ESCOLHA[kind]) {
    const v = out[campo];
    const ok = comp.opcoes[campo] ?? [];
    if (typeof v === 'string' && ok.length && !ok.includes(v)) out[campo] = ok[0];
  }
  return out as T;
}

/** O estilo usa só peças liberadas? */
export function cabeNoQueTem(kind: KindComponente, st: object, comp: Componentes): boolean {
  return JSON.stringify(encaixar(kind, st, comp)) === JSON.stringify(trocaCores(st, normaliza));
}
