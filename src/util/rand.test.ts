import { describe, expect, it } from 'vitest';
import { hashTexto, sorteador } from './rand';

/** O acaso que tem de ser igual em todas as telas da mesa (src/mesa3d/cena.ts, ator.ts). */
describe('o sorteador estável', () => {
  it('as mesmas partes dão a mesma fila; outras partes, outra', () => {
    const a = sorteador(hashTexto('sala-1'), 3, 7);
    const b = sorteador(hashTexto('sala-1'), 3, 7);
    const fila = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(fila);
    for (const x of fila) expect(x >= 0 && x < 1).toBe(true);
    expect(new Set(fila).size).toBe(3);
    const c = sorteador(hashTexto('sala-2'), 3, 7);
    expect(c()).not.toBe(fila[0]);
  });
});
