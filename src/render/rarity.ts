import { RARIDADES, rarityOf, type Raridade } from '../../shared/catalog';

/**
 * A cor de cada degrau de raridade, em valor.
 *
 * A Galeria e a tabela de prêmios pegam a cor pela classe CSS (`.r-lendario` & cia., em
 * global.css); o que precisa do valor em JavaScript — o brilho do prêmio no giro, as partículas —
 * pega aqui. **Os dois têm de bater**: mexeu num, mexa no outro.
 */
export const CORES_RARIDADE: Record<Raridade, string> = {
  lendario: '#ffd76a',
  epico: '#c79bff',
  raro: '#ff7d7d',
  incomum: '#7fc4ff',
  comum: '#8ee27a',
};

/** A cor do degrau de um item do catálogo. */
export function rarityColor(key: string): string {
  return CORES_RARIDADE[rarityOf(key)];
}

/** O rótulo e a cor juntos, para quem mostra os dois. */
export function rarityInfo(key: string): { id: Raridade; label: string; cor: string } {
  const id = rarityOf(key);
  return {
    id,
    label: RARIDADES.find((r) => r.id === id)?.label ?? '',
    cor: CORES_RARIDADE[id],
  };
}
