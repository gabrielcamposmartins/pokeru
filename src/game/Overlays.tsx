import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EMOTES } from '../../shared/protocol';
import { useSession } from '../store/session';
import { useTable, type Splash } from '../store/table';
import { CharacterFull } from '../render/CharacterArt';
import { sfx } from '../audio/sfx';

/** Cut-in estilo Mahjong Soul: faixa diagonal com o personagem e o texto da jogada. */
function CutIn({ splash }: { splash: Splash }) {
  const st = splash.character!;
  return (
    <motion.div className="cutin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <motion.div
        className="cutin-band"
        style={{ background: `linear-gradient(90deg, ${st.bg2}, ${st.bg} 55%, ${st.bg2})` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      />
      <div className="cutin-lines" />
      <motion.div
        className="cutin-char"
        initial={{ x: -320, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.08, type: 'spring', stiffness: 190, damping: 20 }}
      >
        <CharacterFull st={st} view="bust" height={470} />
      </motion.div>
      <motion.div
        className="cutin-text"
        initial={{ x: 280, opacity: 0, scale: 1.5 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 18 }}
      >
        <div className={`splash-title ${splash.kind === 'big' ? 'big' : ''}`}>{splash.title}</div>
        {splash.subtitle && <div className="splash-sub">{splash.subtitle}</div>}
      </motion.div>
    </motion.div>
  );
}

export function WinSplash() {
  const splash = useTable((s) => s.splash);
  const setSplash = useTable((s) => s.setSplash);
  useEffect(() => {
    if (!splash) return;
    const t = setTimeout(() => setSplash(null), splash.character ? 2400 : splash.kind === 'big' ? 2300 : 2000);
    return () => clearTimeout(t);
  }, [splash, setSplash]);
  return (
    <AnimatePresence>
      {splash &&
        (splash.character ? (
          <CutIn key={splash.id} splash={splash} />
        ) : (
          <motion.div
            key={splash.id}
            className={`splash splash-${splash.kind}`}
            initial={{ opacity: 0, scale: 1.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className="splash-ribbon" />
            <div className="splash-title">{splash.title}</div>
            {splash.subtitle && <div className="splash-sub">{splash.subtitle}</div>}
          </motion.div>
        ))}
    </AnimatePresence>
  );
}

export function GameOverModal({ onLeave }: { onLeave: () => void }) {
  const ranking = useTable((s) => s.gameOver);
  const room = useSession((s) => s.room);
  const playerId = useSession((s) => s.playerId);
  const send = useSession((s) => s.send);
  if (!ranking) return null;
  const isHost = room?.hostId === playerId;
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="modal-back">
      <motion.div className="modal panel" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <h2 className="title-deco">Fim do Sit &amp; Go</h2>
        <ol className="ranking">
          {ranking.map((r) => (
            <li key={r.seat + r.name} className={r.place === 1 ? 'first' : ''}>
              <span className="medal">{medals[r.place - 1] ?? `${r.place}º`}</span>
              <span>{r.name}</span>
            </li>
          ))}
        </ol>
        <div className="row gap center">
          {isHost && (
            <button
              className="btn btn-gold"
              onClick={() => {
                useTable.getState().setGameOver(null);
                send({ type: 'startGame' });
              }}
            >
              Jogar de novo
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            Sair
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chat = useSession((s) => s.chat);
  const log = useTable((s) => s.log);
  const send = useSession((s) => s.send);
  const [tab, setTab] = useState<'chat' | 'log'>('chat');
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, log.length, tab, open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="chat-panel panel" initial={{ x: -380 }} animate={{ x: 0 }} exit={{ x: -380 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
          <div className="chat-tabs">
            <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
              Chat
            </button>
            <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
              Histórico
            </button>
            <button className="close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="chat-lines">
            {tab === 'chat'
              ? chat.map((c) => (
                  <div key={c.id} className={`chat-line ${c.system ? 'system' : ''}`}>
                    {!c.system && <b>{c.from}: </b>}
                    {c.text}
                  </div>
                ))
              : log.map((l) => (
                  <div key={l.id} className={`chat-line log-${l.kind ?? 'plain'}`}>
                    {l.text}
                  </div>
                ))}
            <div ref={endRef} />
          </div>
          {tab === 'chat' && (
            <form
              className="chat-input"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                send({ type: 'chat', text });
                setText('');
              }}
            >
              <input className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Diga algo…" />
              <button className="btn btn-pink small">Enviar</button>
            </form>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmoteMenu() {
  const [open, setOpen] = useState(false);
  const send = useSession((s) => s.send);
  return (
    <div className="emote-menu">
      <AnimatePresence>
        {open && (
          <motion.div className="emote-grid panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => {
                  send({ type: 'emote', emote: e });
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        className="hud-btn"
        title="Emotes"
        onClick={() => {
          sfx.click();
          setOpen((o) => !o);
        }}
      >
        😊
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useSession((s) => s.toasts);
  const dismiss = useSession((s) => s.dismissToast);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.kind}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
            onClick={() => dismiss(t.id)}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
