import { useState } from 'react';
import { DEFAULT_SETTINGS, type GameMode, type RoomSummary } from '../../shared/protocol';
import { useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { Field, ScreenHeader, Segmented } from '../ui/controls';
import { Petals } from './MainMenu';

function RoomCard({ r }: { r: RoomSummary }) {
  const send = useSession((s) => s.send);
  const [pw, setPw] = useState('');
  const [asking, setAsking] = useState(false);
  const join = () => send({ type: 'joinRoom', roomId: r.id, password: pw || undefined });
  const full = r.players >= r.maxPlayers;
  const locked = r.status !== 'waiting' && r.mode === 'sitgo';
  return (
    <div className="room-card">
      <div className="room-main">
        <b>
          {r.hasPassword && '🔒 '}
          {r.name}
        </b>
        <span className="muted small">
          #{r.id} · {r.mode === 'sitgo' ? 'Sit & Go' : 'Cash'} · Blinds {r.blinds}
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
          <input className="input small" type="password" placeholder="Senha" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button className="btn btn-pink small">OK</button>
        </form>
      ) : (
        <button className="btn btn-pink small" disabled={full || locked} onClick={() => (r.hasPassword ? setAsking(true) : join())}>
          {full ? 'Cheia' : locked ? 'Em jogo' : 'Entrar'}
        </button>
      )}
    </div>
  );
}

export function OnlineLobby({ onBack }: { onBack: () => void }) {
  const serverUrl = useProfile((s) => s.settings.serverUrl);
  const updateSettings = useProfile((s) => s.updateSettings);
  const { status, serverName, rooms, connectOnline, disconnect, send } = useSession();
  const [url, setUrl] = useState(serverUrl);
  const [code, setCode] = useState('');
  const [name, setName] = useState('Mesa de ' + useProfile.getState().name);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [mode, setMode] = useState<GameMode>('cash');
  const [stack, setStack] = useState(2000);
  const [bb, setBb] = useState(20);
  const [turnTime, setTurnTime] = useState(25);
  const [password, setPassword] = useState('');

  const connected = status === 'connected';
  return (
    <div className="screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader
        title="Jogar Online"
        onBack={() => {
          disconnect();
          onBack();
        }}
      />
      <div className="lobby-grid">
        <div className="panel pad">
          <h3>Servidor</h3>
          <form
            className="row gap"
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings({ serverUrl: url });
              connectOnline(url);
            }}
          >
            <input className="input grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://endereço:3001" disabled={status !== 'idle'} />
            {status === 'idle' ? (
              <button className="btn btn-gold">Conectar</button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={disconnect}>
                {status === 'connecting' ? 'Cancelar' : 'Desconectar'}
              </button>
            )}
          </form>
          <div className="conn-status">
            <span className={`dot-status ${status}`} />
            {status === 'idle' && 'Desconectado'}
            {status === 'connecting' && 'Conectando…'}
            {connected && `Conectado a ${serverName}`}
          </div>
          {!connected && (
            <div className="help-box">
              <b>Como hospedar:</b> em um computador da rede, rode <code>npm run server</code> na pasta do projeto. Os amigos se conectam em
              <code>ws://IP-DO-HOST:3001</code>.
            </div>
          )}
          {connected && (
            <>
              <div className="row between" style={{ marginTop: 16 }}>
                <h3>Salas</h3>
                <button className="btn btn-ghost small" onClick={() => send({ type: 'listRooms' })}>
                  ↻ Atualizar
                </button>
              </div>
              <div className="room-list">
                {rooms.length === 0 && <div className="muted empty">Nenhuma sala aberta. Crie a primeira!</div>}
                {rooms.map((r) => (
                  <RoomCard key={r.id} r={r} />
                ))}
              </div>
              <form
                className="row gap"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim()) send({ type: 'joinRoom', roomId: code.trim() });
                }}
              >
                <input className="input grow" placeholder="Código da sala" value={code} onChange={(e) => setCode(e.target.value)} />
                <button className="btn btn-pink">Entrar</button>
              </form>
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
              label="Modo"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'cash', label: 'Cash (rebuy)' },
                { value: 'sitgo', label: 'Sit & Go' },
              ]}
            />
            <Segmented label="Fichas iniciais" value={stack} onChange={setStack} options={[1000, 2000, 5000, 10000].map((v) => ({ value: v, label: v.toLocaleString('pt-BR') }))} />
            <Segmented label="Blinds" value={bb} onChange={setBb} options={[10, 20, 50, 100].map((v) => ({ value: v, label: `${v / 2}/${v}` }))} />
            <Segmented label="Tempo por jogada" value={turnTime} onChange={setTurnTime} options={[15, 25, 45, 90].map((v) => ({ value: v, label: `${v}s` }))} />
            <Field label="Senha (opcional)">
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
                  startingStack: stack,
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
