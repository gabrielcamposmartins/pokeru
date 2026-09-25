import { useEffect, useRef, useState } from 'react';
import type { BotDifficulty, MemberInfo } from '../../shared/protocol';
import { findCharacter } from '../../shared/styles';
import { useSession } from '../store/session';
import { abrirPerfil, chamarParaSala, pedirAmizadeNaMesa, useFriends, useRelacao } from '../store/friends';
import { CharacterPortrait } from '../render/CharacterArt';
import { CartaoJogador, CartaoVazio, cartaoDoMembro, useMeuCartao } from '../game/CartaoJogador';
import { MODE_LABEL, VARIANT_LABEL, fmt } from '../util/format';
import { Segmented } from '../ui/controls';
import { sfx } from '../audio/sfx';
import { Petals } from './MainMenu';

/**
 * O que dá para fazer com quem está sentado: ver o perfil (amigo), pedir amizade (quem não é) ou
 * esperar a resposta. Bot e quem joga sem conta não têm nada disso.
 */
export function AcaoDeAmizade({ playerId, conta, name }: { playerId: string; conta: string | undefined; name: string }) {
  const relacao = useRelacao(conta);
  const toast = useSession((s) => s.toast);
  if (!relacao || relacao === 'eu') return null;
  if (relacao === 'amigo') {
    return (
      <button
        className="btn btn-ghost small"
        onClick={() => {
          sfx.click();
          abrirPerfil(conta!);
        }}
      >
        Perfil
      </button>
    );
  }
  if (relacao === 'pedido') return <span className="badge">pedido enviado</span>;
  return (
    <button
      className="btn btn-pink small"
      title={`Pedir amizade a ${name}`}
      onClick={() => {
        sfx.click();
        pedirAmizadeNaMesa(playerId);
        toast(`Pedido de amizade enviado para ${name}`);
      }}
    >
      + Amigo
    </button>
  );
}

/**
 * Chamar amigos para a sala.
 *
 * Lista quem está online e ainda não está aqui. O convite vale como a senha da sala: o amigo entra
 * direto, sem ninguém precisar ditar nada.
 */
function ConvidarAmigos({ members }: { members: MemberInfo[] }) {
  const friends = useFriends((s) => s.friends);
  const temConta = useSession((s) => !!s.account);
  const [chamados, setChamados] = useState<Set<string>>(() => new Set());
  if (!temConta) return null;
  const aqui = new Set(members.map((m) => m.conta).filter(Boolean));
  const livres = friends.filter((f) => f.online && !aqui.has(f.id));
  return (
    <div className="sala-convidar">
      <h3>Chamar amigos</h3>
      {livres.length === 0 ? (
        <p className="muted small">{friends.length ? 'Nenhum amigo online fora da sala agora.' : 'Adicione amigos pelo código em Amigos — ou aqui, pelo card de quem sentar.'}</p>
      ) : (
        <div className="sala-convidar-lista">
          {livres.map((f) => {
            const char = findCharacter(f.character);
            const foi = chamados.has(f.id);
            return (
              <div key={f.id} className="sala-convidar-um">
                <span className="amigo-face" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
                  <CharacterPortrait st={char} size={32} />
                </span>
                <b>{f.name}</b>
                {f.playing && <small className="muted">em partida</small>}
                <button
                  className={`btn small ${foi ? 'btn-ghost' : 'btn-gold'}`}
                  disabled={foi}
                  onClick={() => {
                    sfx.click();
                    chamarParaSala(f.id);
                    setChamados((s) => new Set(s).add(f.id));
                  }}
                >
                  {foi ? 'Chamado ✓' : 'Chamar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RoomLobby() {
  const { room, playerId, send, leaveRoom, chat, toast } = useSession();
  const meu = useMeuCartao();
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
          {/* cada cadeira é o card da tela de carregamento: a sala já mostra quem vai jogar do jeito que vai jogar */}
          <div className="sala-cartoes" style={{ ['--cadeiras' as string]: seats.length }}>
            {seats.map((m, i) =>
              m ? (
                <CartaoJogador
                  key={m.id}
                  p={m.id === playerId ? meu : cartaoDoMembro(m)}
                  eu={m.id === playerId}
                  canto={m.id === room.hostId ? <span title="Anfitrião">👑</span> : undefined}
                  className="cartao-sala"
                >
                  {isHost && m.isBot && (
                    <button className="btn btn-ghost small" onClick={() => send({ type: 'removeBot', seat: i })}>
                      Remover
                    </button>
                  )}
                  {!m.isBot && m.id !== playerId && <AcaoDeAmizade playerId={m.id} conta={m.conta} name={m.name} />}
                </CartaoJogador>
              ) : (
                <CartaoVazio key={`vago-${i}`} label="Lugar vago">
                  {isHost && (
                    <button className="btn btn-ghost small" onClick={() => send({ type: 'addBot', difficulty })}>
                      + Bot
                    </button>
                  )}
                </CartaoVazio>
              ),
            )}
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
        <div className="sala-lado">
          <div className="panel pad">
            <ConvidarAmigos members={room.members} />
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
    </div>
  );
}
