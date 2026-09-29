/**
 * O recorde de cada minijogo, guardado neste computador.
 *
 * Os minijogos não valem fichas nem padocoins: são para passar o tempo. Por isso o recorde fica só
 * no navegador — e, se o armazenamento não estiver disponível, o jogo segue sem ele.
 */
export type Minijogo = 'joias' | 'bolhas';

const chave = (j: Minijogo) => `pokeru.minijogos.${j}.recorde`;

export function lerRecorde(j: Minijogo): number {
  try {
    return Number(localStorage.getItem(chave(j))) || 0;
  } catch {
    return 0;
  }
}

export function gravarRecorde(j: Minijogo, pontos: number): void {
  try {
    localStorage.setItem(chave(j), String(pontos));
  } catch {
    // sem armazenamento: o recorde vale só enquanto a tela está aberta
  }
}
