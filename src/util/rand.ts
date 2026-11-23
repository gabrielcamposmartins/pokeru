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

/** Um número estável de um texto (o id da sala, o de uma peça): para semear o ruído com o que é igual em todas as telas. */
export function hashTexto(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 1_000_003;
}

/**
 * Um sorteador estável: devolve, chamada após chamada, a mesma fila de números em [0, 1) para as
 * mesmas `partes`. É o `Math.random` de quem precisa sortear igual em todas as telas da mesa.
 */
export function sorteador(...partes: number[]): () => number {
  let n = 0;
  return () => hash01(...partes, n++);
}
