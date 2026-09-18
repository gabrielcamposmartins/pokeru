export function fmt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}

export function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace('.', ',') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k';
  return fmt(n);
}

export const ACTION_LABEL: Record<string, string> = {
  fold: 'Desistiu',
  check: 'Passou',
  call: 'Pagou',
  raise: 'Aumentou',
  allin: 'All-in',
  sb: 'Small Blind',
  bb: 'Big Blind',
};

/** Nomes dos formatos de partida e das variantes de poker, como aparecem na interface. */
export const MODE_LABEL: Record<string, string> = {
  cash: 'Cash (rebuy)',
  sitgo: 'Sit & Go',
  normal: 'Normal (rodadas)',
};

export const MODE_SHORT: Record<string, string> = { cash: 'Cash', sitgo: 'Sit & Go', normal: 'Normal' };

export const VARIANT_LABEL: Record<string, string> = {
  holdem: "Texas Hold'em",
  draw5: 'Poker de 5 cartas',
};

export const VARIANT_SHORT: Record<string, string> = { holdem: "Hold'em", draw5: '5 cartas' };

/** Resumo do formato: "Normal · 8 rodadas · 5 cartas". */
export function matchLabel(s: { mode: string; variant: string; rounds?: number }): string {
  const parts = [MODE_SHORT[s.mode] ?? s.mode];
  if (s.mode === 'normal' && s.rounds) parts.push(`${s.rounds} rodadas`);
  parts.push(VARIANT_SHORT[s.variant] ?? s.variant);
  return parts.join(' · ');
}
