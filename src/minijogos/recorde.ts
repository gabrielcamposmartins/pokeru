/**
 * O recorde de cada minijogo.
 *
 * Mora em dois lugares: no aparelho (para o jogo funcionar sem conta, e sem esperar a rede) e na
 * conta do servidor, que é o que vai ao ranking (shared/ranking.ts). A tela mostra o maior dos
 * dois — assim quem joga em dois computadores vê o mesmo recorde.
 *
 * O servidor guarda só o maior de cada conta, e só se ele couber no teto do nível alcançado
 * (shared/minijogos.ts): o jogo roda aqui, e o número que vai para lá precisa parecer de verdade.
 */
import type { Minijogo } from '../../shared/minijogos';
import { useSession } from '../store/session';
export type { Minijogo };

const chave = (j: Minijogo) => `pokeru.minijogos.${j}.recorde`;

function doAparelho(j: Minijogo): number {
  try {
    return Number(localStorage.getItem(chave(j))) || 0;
  } catch {
    return 0;
  }
}

/** O recorde de agora: o maior entre o deste aparelho e o da conta. */
export function lerRecorde(j: Minijogo): number {
  return Math.max(doAparelho(j), useSession.getState().account?.recordes?.[j] ?? 0);
}

/**
 * Manda ao servidor o total da partida, se ele passar o recorde da conta. Vai no fim de cada nível
 * (uma partida largada no meio também conta) e no fim da partida.
 */
export function mandarRecorde(j: Minijogo, pontos: number, nivel: number): void {
  const s = useSession.getState();
  if (s.status !== 'connected' || !s.account || pontos <= (s.account.recordes?.[j] ?? 0)) return;
  s.send({ type: 'minijogoRecorde', jogo: j, pontos: Math.floor(pontos), nivel });
}

/** Fim de partida: guarda no aparelho (se for o maior daqui) e manda à conta. */
export function gravarRecorde(j: Minijogo, pontos: number, nivel: number): void {
  if (pontos > doAparelho(j)) {
    try {
      localStorage.setItem(chave(j), String(pontos));
    } catch {
      // sem armazenamento: o recorde vale só enquanto a tela está aberta (e na conta, se houver)
    }
  }
  mandarRecorde(j, pontos, nivel);
}
