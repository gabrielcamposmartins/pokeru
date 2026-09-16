/**
 * Utilitários compartilhados pelos scripts de falas/áudios.
 *
 * Organização dos áudios (assets/characters/falas/):
 *   <personagem>/<NNN>_<fala>.wav          falas próprias (NNN = posição em <personagem>.jsonc)
 *   <personagem>/comum/<NNN>_<fala>.wav    falas comuns na voz do personagem (NNN = posição em comum.jsonc)
 * A ferramenta de voz gera as comuns na raiz como <NNN>_<Personagem>_<fala>.wav;
 * `npm run audios:organizar` move esses arquivos para as pastas acima.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../shared/jsonc.ts';

export const FALAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'characters', 'falas');
export const COMUM_FILE = 'comum.jsonc';
export const COMUM_DIR = 'comum';

const BS = String.fromCharCode(92);
// caracteres que não podem aparecer em nome de arquivo no Windows
const INVALID = new Set(['<', '>', ':', '"', '/', '|', '?', '*', BS]);

/** Texto da fala como aparece no nome do arquivo. */
export const fileText = (s) => [...s.normalize('NFC')].filter((c) => !INVALID.has(c)).join('').trim();
export const pad = (n) => String(n).padStart(3, '0');

/** Lê um .jsonc de falas e devolve cada fala com o comentário da linha (slot: tradução). */
export function readFalas(file) {
  const text = readFileSync(join(FALAS_DIR, file), 'utf8');
  const data = parseJsonc(text, file);
  const comments = new Map();
  for (const line of text.split(String.fromCharCode(10))) {
    const t = line.trim();
    if (!t.startsWith('"')) continue;
    const slash = t.indexOf('//', t.lastIndexOf('"'));
    if (slash < 0) continue;
    try {
      comments.set(JSON.parse(t.slice(0, t.lastIndexOf('"', slash) + 1)), t.slice(slash + 2).trim());
    } catch {
      // linha que não é uma fala simples: fica sem comentário
    }
  }
  return { personagem: data.personagem, falas: data.falas.map((fala) => ({ fala, comentario: comments.get(fala) ?? '' })) };
}

/** Personagens (id = nome do arquivo) e falas comuns. */
export function loadFalas() {
  const personagens = readdirSync(FALAS_DIR)
    .filter((f) => f.endsWith('.jsonc') && f !== COMUM_FILE)
    .sort()
    .map((f) => ({ id: f.slice(0, -'.jsonc'.length), ...readFalas(f) }));
  let comum = { personagem: 'Todos', falas: [] };
  try {
    comum = readFalas(COMUM_FILE);
  } catch {
    // sem falas comuns
  }
  return { personagens, comum };
}

/** Todos os .wav da pasta de falas, como caminhos relativos com "/". */
export function listWavs() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.toLowerCase().endsWith('.wav')) out.push(relative(FALAS_DIR, full).split(BS).join('/'));
    }
  };
  walk(FALAS_DIR);
  return out.sort();
}

/** "057_Marina_フラッシュ！.wav" → { num: 57, rest: "Marina_フラッシュ！" } */
export function splitNumber(name) {
  const base = name.endsWith('.wav') ? name.slice(0, -'.wav'.length) : name;
  const us = base.indexOf('_');
  if (us > 0 && /^[0-9]+$/.test(base.slice(0, us))) return { num: Number(base.slice(0, us)), rest: base.slice(us + 1) };
  return { num: null, rest: base };
}

/** Arquivo de fala comum solto na raiz (<NNN>_<Personagem>_<fala>.wav): personagem e índice da fala. */
export function parseLooseComum(name, personagens, comum) {
  const { rest } = splitNumber(name);
  const sep = rest.indexOf('_');
  if (sep <= 0) return null;
  const who = rest.slice(0, sep).toLowerCase();
  const p = personagens.find((x) => x.personagem.toLowerCase() === who || x.id === who);
  const text = fileText(rest.slice(sep + 1));
  const index = comum.falas.findIndex((f) => fileText(f.fala) === text);
  if (!p || index < 0) return null;
  return { personagem: p, index };
}

/** Confere o WAV (PCM 16 bits): devolve um problema ou null se está ok. */
export function checkWav(file) {
  const b = readFileSync(file);
  if (b.length < 44 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') return 'WAV inválido';
  let bits = 16;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = b.toString('latin1', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') bits = b.readUInt16LE(o + 22);
    if (id === 'data') {
      if (size === 0) return 'sem áudio';
      if (bits !== 16) return null; // outros formatos: só confere o cabeçalho
      let peak = 0;
      for (let i = o + 8; i + 1 < Math.min(o + 8 + size, b.length); i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
      return peak / 32768 < 0.01 ? 'mudo' : null;
    }
    o += 8 + size + (size & 1);
  }
  return 'sem bloco de áudio';
}
