import { useEffect, useRef, useState } from 'react';
import type { BotDifficulty } from '../../shared/protocol';
import { useSession } from '../store/session';
import { useCharacter } from '../store/profile';
import { CharacterPortrait } from '../render/CharacterArt';
import { MODE_LABEL, VARIANT_LABEL, fmt } from '../util/format';
import { Segmented } from '../ui/controls';
import { Petals } from './MainMenu';

export function RoomLobby() {
  const { room, playerId, send, leaveRoom, chat, toast } = useSession();
  const mine = useCharacter();
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);
  if (!room) return null;
  const isHost = room.hostId === playerId;
  const seats = Array.from({ length: room.settings.maxPlayers }, (_, i) => room.members.find((m) => m.seat === i) ?? null);
  const s = room.settings;
  return (
    <div className="screen">
      <div className="menu-bg" />
      <Petals />
      <div className="screen-header">
        <button className="btn btn-ghost" onClick={leaveRoom}>
          ⟵ Sair da sala
        </button>
        <h1 className="title-deco">{s.name}</h1>
        <div className="header-extra">
          <button
            className="btn btn-ghost small"
            onClick={() => {
              void navigator.clipboard?.writeText(room.id);
              toast('Código copiado: ' + room.id);
            }}
          >
            Código: <b>{room.id}</b> ⧉
          </button>
        </div>
      </div>
      <div className="lobby-grid">
        <div className="panel pad">
          <div className="room-rules">
            <span>{MODE_LABEL[s.mode] ?? s.mode}</span>
            <span>{VARIANT_LABEL[s.variant] ?? s.variant}</span>
            {s.mode === 'normal' && <span>{s.rounds} rodadas</span>}
            {s.buyIn > 0 && <span>Buy-in {fmt(s.buyIn)}</span>}
            <span>
              Blinds {fmt(s.smallBlind)}/{fmt(s.bigBlind)}
            </span>
            <span>Fichas {fmt(s.startingStack)}</span>
            <span>{s.turnTime}s por jogada</span>
            {s.hasPassword && <span>🔒 Privada</span>}
          </div>
          <div className="seat-grid">
            {seats.map((m, i) => {
              const ch = m ? (m.id === playerId ? mine : m.character) : null;
              return (
                <div key={i} className={`seat-slot ${m ? 'filled' : ''}`} style={ch ? { background: `linear-gradient(170deg, ${ch.bg}55, rgba(0,0,0,.25))` } : undefined}>
                  {m && ch ? (
                    <>
                      <div className="lobby-portrait" style={{ background: `linear-gradient(160deg, ${ch.bg}, ${ch.bg2})` }}>
                        <CharacterPortrait st={ch} size={96} />
                      </div>
                      <div className="seat-name">
                        {m.id === room.hostId && <span title="Anfitrião">👑 </span>}
                        {m.name}
                        {m.id === playerId && <span className="tag">você</span>}
                        {m.isBot && <span className="tag">BOT</span>}
                      </div>
                      <div className="muted small">{ch.name}</div>
                      {isHost && m.isBot && (
                        <button className="btn btn-ghost small" onClick={() => send({ type: 'removeBot', seat: i })}>
                          Remover
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="avatar empty">?</div>
                      <div className="seat-name muted">Lugar vago</div>
                      {isHost && (
                        <button className="btn btn-ghost small" onClick={() => send({ type: 'addBot', difficulty })}>
                          + Bot
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {isHost ? (
            <div className="host-bar">
              <Segmented
                label="Dificuldade dos bots"
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: 'easy', label: 'Fácil' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'hard', label: 'Difícil' },
                ]}
              />
              <button className="btn btn-gold big" disabled={room.members.length < 2} onClick={() => send({ type: 'startGame' })}>
                ♠ Iniciar partida
              </button>
            </div>
          ) : (
            <div className="muted center" style={{ marginTop: 18 }}>
              Aguardando o anfitrião iniciar a partida…
            </div>
          )}
        </div>
        <div className="panel pad chat-box">
          <h3>Chat da sala</h3>
          <div className="chat-lines">
            {chat.map((c) => (
              <div key={c.id} className={`chat-line ${c.system ? 'system' : ''}`}>
                {!c.system && <b>{c.from}: </b>}
                {c.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              send({ type: 'chat', text });
              setText('');
            }}
          >
            <input className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Diga olá…" />
            <button className="btn btn-pink small">Enviar</button>
          </form>
        </div>
      </div>
    </div>
  );
}
