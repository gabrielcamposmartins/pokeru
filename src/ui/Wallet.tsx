import { ChipSvg } from '../render/Chip';
import { SERVER_URL, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';

/**
 * As fichas do jogador, no alto do menu (como a barra de moedas do Mahjong Soul).
 *
 * O saldo é do servidor: enquanto o jogo está conectado, o valor vem da conta; fora dele, mostra
 * o último saldo conhecido daquele servidor (guardado no perfil), para a barra não ficar vazia
 * toda vez que o jogo abre. O `+` ainda não tem loja — avisa e fica esperando.
 *
 * A moeda secundária entra aqui do lado quando existir: é só outro `<Coin>`.
 */

export function WalletPill({ amount, onPlus, hint, stale, children }: { amount: number; onPlus?: () => void; hint?: string; stale?: boolean; children: React.ReactNode }) {
  return (
    <div className={`wallet-pill ${stale ? 'stale' : ''}`} title={hint}>
      <span className="wallet-pill-icon">{children}</span>
      <span className="wallet-pill-value">{fmt(amount)}</span>
      {onPlus && (
        <button className="wallet-pill-plus" onClick={onPlus} title="Conseguir mais fichas (em breve)" aria-label="Conseguir mais fichas">
          +
        </button>
      )}
    </div>
  );
}

/**
 * Saldo mostrado: o da conta conectada. Fora dela, o último que vimos naquele servidor — é só
 * uma lembrança para a barra não abrir vazia; quem diz quanto você tem é sempre o servidor.
 */
export function useChips(): number {
  const account = useSession((s) => s.account);
  const cached = useProfile((s) => s.accounts[SERVER_URL]?.money ?? 0);
  return account ? account.money : cached;
}

export function WalletBar() {
  const chips = useChips();
  const live = useSession((s) => !!s.account);
  const toast = useSession((s) => s.toast);
  return (
    <div className="wallet-bar">
      <WalletPill
        amount={chips}
        stale={!live}
        hint={live ? 'Suas fichas, guardadas no servidor' : 'Último saldo conhecido — o valor de verdade vem do servidor ao conectar'}
        onPlus={() => {
          sfx.click();
          toast('A loja de fichas chega numa próxima atualização.');
        }}
      >
        <ChipSvg value={100} size={30} />
      </WalletPill>
    </div>
  );
}
