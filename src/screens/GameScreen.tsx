import { useState } from 'react';
import { useSession } from '../store/session';
import { nextId, useTable } from '../store/table';
import { useEquipped, useProfile } from '../store/profile';
import { Stage } from '../game/Stage';
import { TableStage } from '../game/TableStage';
import { tableSkin } from '../game/skins';
import { ActionPanel } from '../game/ActionPanel';
import { ChatPanel, EmoteMenu, WinSplash } from '../game/Overlays';
import { HandGuideButton } from '../game/HandGuide';
import { RoundResultScreen } from '../game/RoundResult';
import { MatchEndScreen } from '../game/MatchEnd';
import { VARIANT_SHORT, fmt, matchLabel } from '../util/format';
import { sfx } from '../audio/sfx';

export function GameScreen() {
  const view = useTable((s) => s.display);
  const room = useSession((s) => s.room);
  const leaveRoom = useSession((s) => s.leaveRoom);
  const stopPlaying = useSession((s) => s.stopPlaying);
  const minhaMesa = useEquipped('table');
  /*
   * O fundo da sala é da mesma mesa que o feltro.
   *
   * Ele usava sempre a mesa equipada, enquanto o feltro seguia o dealer (veja `tableSkin`): numa
   * partida com gente, quando o botão passava para outra pessoa, o feltro trocava e a sala em volta
   * não — meia cena de uma mesa, meia de outra.
   */
  const table = view ? tableSkin(view, minhaMesa) : minhaMesa;
  const muted = useProfile((s) => s.settings.muted);
  const updateSettings = useProfile((s) => s.updateSettings);
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const unread = useSession((s) => s.chat.length);
  const [seen, setSeen] = useState(0);

  const bg = `radial-gradient(ellipse at 50% 40%, ${table.bgTop} 0%, ${table.bgBottom} 75%)`;
  return (
    <div className="game-screen">
      <Stage background={bg}>
        {view ? <TableStage /> : <div className="loading">Preparando a mesa…</div>}
        <div className="hud-top">
          <button className="hud-btn wide" onClick={() => setConfirmLeave(true)}>
            ⟵ Sair
          </button>
          <div className="hud-info panel">
            <b>{room?.settings.name ?? 'Mesa'}</b>
            {view && (
              <>
                <span>
                  Blinds {fmt(view.smallBlind)}/{fmt(view.bigBlind)}
                </span>
                <span>
                  {view.rounds ? `Rodada ${Math.min(view.handNo, view.rounds)}/${view.rounds}` : `Mão #${view.handNo}`}
                </span>
                <span className="mode">{room ? matchLabel(room.settings) : VARIANT_SHORT[view.variant]}</span>
              </>
            )}
          </div>
        </div>
        <div className="hud-right">
          {/* a dúvida sobre as mãos vem no meio da partida, não antes dela */}
          <HandGuideButton className="hud-btn" />
          <button className="hud-btn" title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => updateSettings({ muted: !muted })}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            className="hud-btn"
            title="Chat e histórico"
            onClick={() => {
              sfx.click();
              setChatOpen((o) => !o);
              setSeen(unread);
            }}
          >
            💬{!chatOpen && unread > seen && <span className="dot" />}
          </button>
          <EmoteMenu />
        </div>
        <ActionPanel />
        <WinSplash />
        <RoundResultScreen />
        <MatchEndScreen />
        <ChatPanel
          open={chatOpen}
          onClose={() => {
            setChatOpen(false);
            setSeen(unread);
          }}
        />
        {view?.status === 'waiting' && (
          <div className="waiting-banner panel">Aguardando jogadores suficientes para continuar…</div>
        )}
      </Stage>
      {confirmLeave && (
        <div className="modal-back" onClick={() => setConfirmLeave(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h3>Sair da mesa?</h3>
            <p className="muted">Se estiver numa mão, suas cartas serão descartadas.</p>
            <div className="row gap center">
              <button
                className="btn btn-danger"
                onClick={() => {
                  setConfirmLeave(false);
                  if (!view) return leaveRoom();
                  // a partida acaba aqui: mostra o placar e só sai de fato no Confirmar
                  stopPlaying();
                  useTable.getState().setMatch({ id: nextId(), kind: 'leave' });
                }}
              >
                Sair
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>
                Continuar jogando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
