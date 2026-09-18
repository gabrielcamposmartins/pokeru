/**
 * Texto das falas, para mostrar na interface (a página de vínculo, por exemplo).
 *
 * Os áudios estão em src/audio/voice.ts; aqui fica só o que está escrito. Os arquivos
 * `assets/characters/falas/<personagem>.jsonc` e `comum.jsonc` são lidos **como texto**
 * (`?raw`), porque a tradução de cada fala vive no comentário da linha:
 *
 *     "一か八か！フェニックスは退かないよ！", // allin: Tudo ou nada! A fênix não recua!
 *
 * O slot vem do comentário (e, na falta dele, da posição na lista — a mesma ordem de
 * FALA_SLOTS / COMUM_SLOTS).
 */
import { parseJsonc } from '../../shared/jsonc';
import { COMUM_SLOTS, FALA_SLOTS, type ComumSlot, type FalaSlot } from './voice';

/** Uma fala: o texto falado e a tradução em português (do comentário). */
export interface Fala {
  /** Texto como está no .jsonc (japonês). */
  text: string;
  /** Tradução do comentário da linha (vazia se a linha não tiver comentário). */
  pt: string;
}

const RAW = import.meta.glob('../../assets/characters/falas/*.jsonc', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Lê um .jsonc de falas: a lista de falas, com o slot e a tradução de cada comentário. */
function read(text: string, slots: readonly string[]): Map<string, Fala> {
  const out = new Map<string, Fala>();
  const data = parseJsonc(text) as { falas?: unknown };
  const falas = Array.isArray(data.falas) ? (data.falas as string[]) : [];
  // os comentários saem na ordem das linhas de fala (uma string solta por linha), que é a ordem
  // da lista; as linhas de chave ("personagem": …, "falas": [) ficam de fora
  const comments = text
    .split('\n')
    .map((l) => {
      const t = l.trim();
      const slash = t.indexOf('//', t.lastIndexOf('"'));
      return { line: (slash < 0 ? t : t.slice(0, slash)).trim(), comment: slash < 0 ? '' : t.slice(slash + 2).trim() };
    })
    .filter((x) => /^"(?:[^"\\]|\\.)*",?$/.test(x.line))
    .map((x) => x.comment);
  falas.forEach((fala, i) => {
    const comment = comments[i] ?? '';
    const sep = comment.indexOf(':');
    const slot = sep > 0 ? comment.slice(0, sep).trim() : (slots[i] ?? '');
    if (!slot) return;
    out.set(slot, { text: fala, pt: sep > 0 ? comment.slice(sep + 1).trim() : '' });
  });
  return out;
}

const FALAS = new Map<string, Map<string, Fala>>();
let COMUM = new Map<string, Fala>();
for (const [path, text] of Object.entries(RAW)) {
  const id = path.split('/').pop()!.replace(/\.jsonc$/, '');
  if (id === 'comum') COMUM = read(text, COMUM_SLOTS);
  else FALAS.set(id, read(text, FALA_SLOTS));
}

/** A fala própria de um personagem num momento (undefined se o .jsonc não tiver esse slot). */
export function falaText(charId: string, slot: FalaSlot): Fala | undefined {
  return FALAS.get(charId)?.get(slot);
}

/** A chamada comum de um momento (o texto é o mesmo para todos os personagens). */
export function comumText(slot: ComumSlot): Fala | undefined {
  return COMUM.get(slot);
}

/** Momentos das falas próprias, em português (para rótulos na interface). */
export const FALA_MOMENTO: Record<FalaSlot, string> = {
  join: 'Ao sentar na mesa',
  turn: 'Na sua vez',
  check: 'Ao passar',
  call: 'Ao pagar',
  bet: 'Ao apostar',
  raise: 'Ao aumentar',
  allin: 'No all-in',
  fold: 'Ao desistir',
  showdown: 'Ao abrir as cartas (showdown)',
  win: 'Ao ganhar a mão',
  big_win: 'Ao ganhar com uma mão grande',
  lose: 'Ao perder a mão disputada',
  bust: 'Ao ser eliminado',
  rebuy: 'Na recompra',
  blinds_up: 'Quando os blinds sobem',
  idle: 'Quando a mesa demora',
};
