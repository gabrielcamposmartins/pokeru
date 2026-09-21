import { ChipSvg } from '../render/Chip';
import { PadoCoinSvg } from '../render/PadoCoin';
import { SERVER_URL, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { usePado } from '../store/shop';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';

/**
 * As moedas do jogador, no alto do menu (como a barra do Mahjong Soul).
 *
 * São duas, e elas vêm de lugares diferentes:
 *
 *   - **fichas** — do próprio Pokeru, guardadas na conta do servidor;
 *   - **padocoins** — da economia do bot do Discord. Só aparecem **se houver Discord vinculado**:
 *     sem vínculo a moeda não existe para aquela conta, e mostrá-la zerada seria mentira.
 *
 * O saldo é sempre do servidor. Fora da conexão, a barra mostra o último valor conhecido (guardado
 * no perfil) para não abrir vazia, e diz que está assim.
 */

export function WalletPill({
  amount,
  onPlus,
  hint,
  stale,
  children,
}: {
  amount: number;
  onPlus?: () => void;
  hint?: string;
  stale?: boolean;
  children: React.ReactNode;
}) {
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
 * Saldo de fichas: o da conta conectada. Fora dela, o último que vimos naquele servidor — é só
 * uma lembrança para a barra não abrir vazia; quem diz quanto você tem é sempre o servidor.
 */
export function useChips(): number {
  const account = useSession((s) => s.account);
  const cached = useProfile((s) => s.accounts[SERVER_URL]?.money ?? 0);
  return account ? account.money : cached;
}

export function WalletBar() {
  const chips = useChips();
  const pado = usePado();
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
      {/* a segunda moeda só existe para quem vinculou o Discord */}
      {pado !== null && (
        <WalletPill amount={pado} hint="Seus padocoins, da economia do bot do Discord">
          <PadoCoinSvg size={30} />
        </WalletPill>
      )}
    </div>
  );
}
