import { useState, type CSSProperties } from 'react';
import { useSession } from '../store/session';
import { nextId, useTable } from '../store/table';
import { useEquipped } from '../store/profile';
import { Stage } from '../game/Stage';
import { TableStage } from '../game/TableStage';
import { tableSkin } from '../game/skins';
import { ActionPanel } from '../game/ActionPanel';
import { ChatPanel, EmoteMenu, WinSplash } from '../game/Overlays';
import { HandGuideButton } from '../game/HandGuide';
import { BotaoDeSom } from '../ui/Som';
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
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const unread = useSession((s) => s.chat.length);
  const [seen, setSeen] = useState(0);

  /*
   * O fundo da sala: as cores da mesa, com o papel de parede do tema por cima (veja `.sala-fundo`).
   * Era um degradê que terminava em preto — a mesa flutuava num vazio.
   */
  const sala = { '--mesa-a': table.bgTop, '--mesa-b': table.bgBottom, '--mesa-luz': table.railAccent } as CSSProperties;
  return (
    <div className="game-screen">
      <Stage className="sala-fundo" style={sala}>
        {view ? <TableStage /> : <div className="loading">Preparando a mesa…</div>}
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
      {/*
        * O HUD fica fora do palco, preso nos cantos da **tela**.
        *
        * O palco é escalado para caber e fica centralizado: numa tela mais larga que 16:9 sobram
        * faixas dos lados, e o HUD de dentro dele boiava no meio delas em vez de encostar no canto.
        */}
      {/*
        * A descrição da sala, discreta: duas linhas pequenas e meio apagadas no canto.
        *
        * Era uma faixa comprida com o botão de sair na frente, e ela cobria os balões de emote dos
        * assentos de cima. Ao passar o mouse ela acende, para quem quiser ler.
        */}
      <div className="hud-info">
        <b>{room?.settings.name ?? 'Mesa'}</b>
        {view && (
          <span>
            {room ? matchLabel(room.settings) : VARIANT_SHORT[view.variant]} · Blinds {fmt(view.smallBlind)}/{fmt(view.bigBlind)} ·{' '}
            {view.rounds ? `Rodada ${Math.min(view.handNo, view.rounds)}/${view.rounds}` : `Mão #${view.handNo}`}
          </span>
        )}
      </div>
      {/* os botões da partida, em coluna no canto direito da tela: o sair é o primeiro, junto com os outros */}
      <div className="hud-right">
        <button className="btn hud-bt hud-sair" title="Sair da mesa" aria-label="Sair da mesa" onClick={() => setConfirmLeave(true)}>
          🚪
        </button>
        {/* a dúvida sobre as mãos vem no meio da partida, não antes dela */}
        <HandGuideButton className="btn hud-bt" />
        <BotaoDeSom className="btn hud-bt" lado="esquerda" />
        <button
          className="btn hud-bt"
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
