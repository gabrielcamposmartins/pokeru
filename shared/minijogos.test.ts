import { describe, expect, it } from 'vitest';
import { NIVEIS_PREMIADOS_POR_DIA, SEGUNDOS_ENTRE_PREMIOS, decidirPremio, diaDe, premiadosHoje } from './minijogos';

const T = Date.UTC(2026, 8, 29, 15, 0, 0);

describe('prêmio dos minijogos', () => {
  it('o dia é o de Brasília', () => {
    expect(diaDe(Date.UTC(2026, 8, 30, 2, 59))).toBe('2026-09-29');
    expect(diaDe(Date.UTC(2026, 8, 30, 3, 0))).toBe('2026-09-30');
  });

  it('registro de outro dia conta zero', () => {
    expect(premiadosHoje({ dia: '2026-09-28', niveis: 20 }, T)).toBe(0);
    expect(premiadosHoje({ dia: '2026-09-29', niveis: 7 }, T)).toBe(7);
    expect(premiadosHoje(undefined, T)).toBe(0);
  });

  it('o primeiro nível do dia rende e abre o registro', () => {
    const d = decidirPremio('joias', 1, undefined, undefined, T);
    expect(d).toEqual({ ok: true, registro: { dia: '2026-09-29', niveis: 1 }, restantes: NIVEIS_PREMIADOS_POR_DIA - 1 });
  });

  it('recusa rajada, teto, jogo e nível inválidos', () => {
    const hoje = (niveis: number) => ({ dia: '2026-09-29', niveis });
    expect(decidirPremio('joias', 2, hoje(1), T - (SEGUNDOS_ENTRE_PREMIOS - 1) * 1000, T).ok).toBe(false);
    expect(decidirPremio('joias', 2, hoje(1), T - SEGUNDOS_ENTRE_PREMIOS * 1000, T).ok).toBe(true);
    expect(decidirPremio('joias', 2, hoje(NIVEIS_PREMIADOS_POR_DIA), undefined, T)).toMatchObject({ ok: false, restantes: 0 });
    expect(decidirPremio('xadrez', 1, undefined, undefined, T).ok).toBe(false);
    for (const n of [0, -1, 2.5, NaN, 10_000, '3']) expect(decidirPremio('bolhas', n, undefined, undefined, T).ok).toBe(false);
  });
});
