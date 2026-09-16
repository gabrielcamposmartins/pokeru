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
