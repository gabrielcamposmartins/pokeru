import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type GameMode, type GameVariant, type RoomSummary } from '../../shared/protocol';
import { useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { Field, ScreenHeader, Segmented } from '../ui/controls';
import { ChipSvg } from '../render/Chip';
import { MODE_LABEL, MODE_SHORT, VARIANT_LABEL, VARIANT_SHORT, fmt } from '../util/format';
import { Petals } from './MainMenu';
import { sfx } from '../audio/sfx';

/**
 * Salas do servidor.
 *
 * O jogador não digita endereço: o app já sabe com quem falar (SERVER_URL, decidido no build ou
 * pela hospedagem) e conecta sozinho ao abrir esta tela. O que ele escolhe é a **sala** — as que
 * estão abertas no servidor aparecem aqui, com ou sem senha, e é só entrar.
 */

/** Uma sala da lista. Com senha, pede a senha antes de entrar. */
function RoomCard({ r }: { r: RoomSummary }) {
  const send = useSession((s) => s.send);
  const [pw, setPw] = useState('');
  const [asking, setAsking] = useState(false);
  const join = () => {
    sfx.click();
    send({ type: 'joinRoom', roomId: r.id, password: pw || undefined });
  };
  const full = r.players >= r.maxPlayers;
  // cash game deixa entrar com a mesa rodando; os outros formatos, não
  const locked = r.status !== 'waiting' && r.mode !== 'cash';
  return (
    <div className="room-card">
      <div className="room-main">
        <b>
          {r.hasPassword && <span title="Sala com senha">🔒 </span>}
          {r.name}
        </b>
        <span className="muted small">
          #{r.id} · {MODE_SHORT[r.mode] ?? r.mode} · {VARIANT_SHORT[r.variant] ?? r.variant} · Blinds {r.blinds}
          {r.buyIn > 0 ? ` · Buy-in ${fmt(r.buyIn)}` : ' · livre'}
        </span>
      </div>
      <div className={`room-status st-${r.status}`}>{r.status === 'waiting' ? 'Aguardando' : r.status === 'playing' ? 'Jogando' : 'Encerrada'}</div>
      <div className="room-count">
        {r.players}/{r.maxPlayers}
      </div>
      {asking ? (
        <form
          className="row gap"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <input className="input small" type="password" placeholder="Senha" value={pw} maxLength={32} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button className="btn btn-pink small">Entrar</button>
        </form>
      ) : (
        <button className="btn btn-pink small" disabled={full || locked} onClick={() => (r.hasPassword ? setAsking(true) : join())}>
          {full ? 'Cheia' : locked ? 'Em jogo' : r.hasPassword ? '🔒 Entrar' : 'Entrar'}
        </button>
      )}
    </div>
  );
}

/** Estado da conexão com o servidor, em uma linha (e o botão de tentar de novo). */
function ServerLine() {
  const { status, serverName, connError, connectOnline } = useSession();
  return (
    <div className="server-line">
      <span className={`dot-status ${status}`} />
      <span className="server-line-text">
        {status === 'connecting' && 'Conectando ao servidor…'}
        {status === 'connected' && `Servidor ${serverName}`}
        {status === 'idle' && (connError ?? 'Fora do servidor')}
      </span>
      {status === 'idle' && (
        <button
          className="btn btn-ghost small"
          onClick={() => {
            sfx.click();
            connectOnline();
          }}
        >
          ↻ Tentar de novo
        </button>
      )}
    </div>
  );
}

export function OnlineLobby({ onBack }: { onBack: () => void }) {
  const { status, rooms, account, connectOnline, send } = useSession();
  const [code, setCode] = useState('');
  const [name, setName] = useState('Mesa de ' + useProfile.getState().name);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [mode, setMode] = useState<GameMode>('cash');
  const [variant, setVariant] = useState<GameVariant>('holdem');
  const [rounds, setRounds] = useState(8);
  const [buyIn, setBuyIn] = useState(0);
  const [stack, setStack] = useState(2000);
  const [bb, setBb] = useState(20);
  const [turnTime, setTurnTime] = useState(25);
  const [password, setPassword] = useState('');

  // entrar nesta tela já é pedir a lista: conecta sozinho
  useEffect(() => {
    if (useSession.getState().status === 'idle') connectOnline();
  }, [connectOnline]);

  const connected = status === 'connected';
  return (
    <div className="screen">
      <div className="menu-bg" />
      <Petals />
      {/* voltar é navegar: a conexão fica de pé, senão a conta desaparece do menu */}
      <ScreenHeader title="Salas" onBack={onBack} />
      <div className="lobby-grid">
        <div className="panel pad">
          <div className="row between">
            <h3>Salas abertas</h3>
            <button className="btn btn-ghost small" disabled={!connected} onClick={() => send({ type: 'listRooms' })}>
              ↻ Atualizar
            </button>
          </div>
          <ServerLine />
          {connected && account && (
            <div className="wallet">
              <span className="wallet-money">
                <ChipSvg value={100} size={20} />
                {fmt(account.money)}
              </span>
              {account.inPlay > 0 && <span className="wallet-inplay">{fmt(account.inPlay)} em mesa</span>}
              <small className="muted">Saldo guardado no servidor · conta desde {new Date(account.since).toLocaleDateString('pt-BR')}</small>
            </div>
          )}
          <div className="room-list">
            {!connected && <div className="muted empty">{status === 'connecting' ? 'Buscando as salas…' : 'Sem conexão com o servidor.'}</div>}
            {connected && rooms.length === 0 && <div className="muted empty">Nenhuma sala aberta agora. Crie a primeira do lado!</div>}
            {connected && rooms.map((r) => <RoomCard key={r.id} r={r} />)}
          </div>
          {connected && (
            <>
              <form
                className="row gap"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim()) send({ type: 'joinRoom', roomId: code.trim() });
                }}
              >
                <input className="input grow" placeholder="Entrar por código" value={code} maxLength={8} onChange={(e) => setCode(e.target.value)} />
                <button className="btn btn-pink">Entrar</button>
              </form>
              <div className="field-hint">Uma sala com senha vai pedir a senha na hora de sentar.</div>
            </>
          )}
        </div>
        <div className={`panel pad ${connected ? '' : 'disabled'}`}>
          <h3>Criar sala</h3>
          <div className="form-stack">
            <Field label="Nome da mesa">
              <input className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Segmented label="Jogadores" value={maxPlayers} onChange={setMaxPlayers} options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}` }))} />
            <Segmented
              label="Jogo"
              value={variant}
              onChange={setVariant}
              options={[
                { value: 'holdem', label: VARIANT_LABEL.holdem },
                { value: 'draw5', label: VARIANT_LABEL.draw5 },
              ]}
            />
            <Segmented
              label="Formato"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'cash', label: MODE_LABEL.cash },
                { value: 'sitgo', label: MODE_LABEL.sitgo },
                { value: 'normal', label: 'Normal' },
              ]}
            />
            {mode === 'normal' && (
              <Segmented label="Rodadas" value={rounds} onChange={setRounds} options={[4, 8, 12, 20].map((v) => ({ value: v, label: `${v}` }))} />
            )}
            <Segmented label="Fichas iniciais" value={stack} onChange={setStack} options={[1000, 2000, 5000, 10000].map((v) => ({ value: v, label: v.toLocaleString('pt-BR') }))} />
            <Segmented label="Blinds" value={bb} onChange={setBb} options={[10, 20, 50, 100].map((v) => ({ value: v, label: `${v / 2}/${v}` }))} />
            <Segmented label="Tempo por jogada" value={turnTime} onChange={setTurnTime} options={[15, 25, 45, 90].map((v) => ({ value: v, label: `${v}s` }))} />
            {account && (
              <Segmented
                label="Buy-in (do seu saldo)"
                value={buyIn}
                onChange={setBuyIn}
                options={[
                  { value: 0, label: 'Livre' },
                  ...[500, 1000, 2500, 5000].map((v) => ({ value: v, label: fmt(v) })),
                ]}
              />
            )}
            <Field label="Senha (opcional)" hint="Com senha, a sala aparece com 🔒 e só entra quem souber.">
              <input className="input" type="password" value={password} maxLength={32} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <button
            className="btn btn-gold big wide"
            disabled={!connected}
            onClick={() =>
              send({
                type: 'createRoom',
                settings: {
                  ...DEFAULT_SETTINGS,
                  name,
                  maxPlayers,
                  mode,
                  variant,
                  rounds,
                  // mesa a dinheiro: as fichas são o próprio buy-in
                  buyIn,
                  startingStack: buyIn > 0 ? buyIn : stack,
                  smallBlind: bb / 2,
                  bigBlind: bb,
                  turnTime,
                  password: password || undefined,
                },
              })
            }
          >
            Criar e sentar
          </button>
        </div>
      </div>
    </div>
  );
}
