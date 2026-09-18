/**
 * Ruído estável: a mesma entrada devolve sempre o mesmo valor.
 *
 * Serve para bagunçar as coisas sem que elas "pulem" a cada desenho — por exemplo o lugar
 * onde as fichas de um assento pousam ou a torção de uma pilha.
 */
export function hash01(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.imul(Math.round(p * 1000) + 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruído estável em [-1, 1). */
export function jitter(...parts: number[]): number {
  return hash01(...parts) * 2 - 1;
}
