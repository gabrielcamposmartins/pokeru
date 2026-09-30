import { describe, expect, it } from 'vitest';
import { SEGUNDOS_ENTRE_PREMIOS, decidirPremio } from './minijogos';

const T = Date.UTC(2026, 8, 29, 15, 0, 0);

describe('prêmio dos minijogos', () => {
  it('um nível válido rende', () => {
    expect(decidirPremio('joias', 1, undefined, T)).toEqual({ ok: true });
  });

  it('sem teto: só o intervalo mínimo segura pedido em rajada', () => {
    expect(decidirPremio('joias', 2, T - (SEGUNDOS_ENTRE_PREMIOS - 1) * 1000, T).ok).toBe(false);
    expect(decidirPremio('joias', 2, T - SEGUNDOS_ENTRE_PREMIOS * 1000, T).ok).toBe(true);
  });

  it('recusa jogo e nível inválidos', () => {
    expect(decidirPremio('xadrez', 1, undefined, T).ok).toBe(false);
    for (const n of [0, -1, 2.5, NaN, 10_000, '3']) expect(decidirPremio('bolhas', n, undefined, T).ok).toBe(false);
  });
});
