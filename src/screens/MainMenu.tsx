import { useEffect, useRef, useState } from 'react';
import { useMyTitle } from '../store/titles';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import type { BotDifficulty, GameMode, GameVariant } from '../../shared/protocol';
import { useCharacter, useEquipped, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { CardFaceSvg } from '../render/CardArt';
import { BondBar } from '../game/BondBar';
import { Segmented } from '../ui/controls';
import { WalletBar, useChips } from '../ui/Wallet';
import { MODE_LABEL, VARIANT_LABEL } from '../util/format';
import { sfx } from '../audio/sfx';
import { APP_VERSION } from '../util/version';
import { QUEUE_STAKES } from '../../shared/protocol';
import { PadoCoinSvg } from '../render/PadoCoin';
import { ChipSvg } from '../render/Chip';
import { usePado } from '../store/shop';
import { fmt } from '../util/format';
import { useUiTheme } from '../ui/themes';
import type { Screen } from '../App';

const DEFAULT_LINES = ['Vamos jogar?', 'Boa sorte na mesa!', 'Hoje é dia de all-in!'];

export function Petals() {
  return (
    <div className="petals" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className={`petal ${i % 3 === 0 ? 'suit' : ''}`}
          style={{
            left: `${(i * 53) % 100}%`,
            animationDelay: `${(i * 1.7) % 12}s`,
            animationDuration: `${10 + (i % 5) * 2.5}s`,
            fontSize: `${12 + (i % 4) * 6}px`,
          }}
        >
          {i % 3 === 0 ? ['♠', '♥', '♦', '♣'][i % 4] : ''}
        </span>
      ))}
    </div>
  );
}

/** Personagem grande e interativo (clique para ouvir uma fala). */
export function CharacterStageView({ heightVh = 92, className }: { heightVh?: number; className?: string }) {
  const st = useCharacter();
  // a placa mostra o titulo do JOGADOR (conquista), nao do personagem
  const myTitle = useMyTitle();
  const [talk, setTalk] = useState<string | null>(null);
  const hop = useAnimationControls();
  const [h, setH] = useState(() => (window.innerHeight * heightVh) / 100);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const fit = () => setH((window.innerHeight * heightVh) / 100);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [heightVh]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const lines = st.lines.length ? st.lines : DEFAULT_LINES;
  const onClick = () => {
    sfx.pop();
    let next = lines[Math.floor(Math.random() * lines.length)];
    if (lines.length > 1) while (next === talk) next = lines[Math.floor(Math.random() * lines.length)];
    setTalk(next);
    void hop.start({ y: [0, -18, 0], transition: { duration: 0.42 } });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTalk(null), 3200);
  };
  return (
    <div className={`char-stage ${className ?? ''}`}>
      <div className="char-glow" style={{ background: `radial-gradient(ellipse at 50% 55%, ${st.bg}88, transparent 65%)` }} />
      <motion.div key={st.id} className="char-figure" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <motion.div animate={hop}>
          <CharacterFull st={st} height={h} animate onClick={onClick} className="clickable" />
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {talk && (
          <motion.div className="speech" initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}>
            {talk}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="char-nameplate">
        <small>{myTitle || 'Jogador(a)'}</small>
        <b>{st.name}</b>
        <BondBar char={st} size={16} compact />
      </div>
    </div>
  );
}

function QuickPlayModal({ onClose }: { onClose: () => void }) {
  const startBots = useSession((s) => s.startBots);
  const pending = useSession((s) => s.botsPending);
  const [bots, setBots] = useState(5);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [mode, setMode] = useState<GameMode>('cash');
  const [variant, setVariant] = useState<GameVariant>('holdem');
  const [rounds, setRounds] = useState(8);
  const [stack, setStack] = useState(2000);
  const [blinds, setBlinds] = useState(20);
  const [turnTime, setTurnTime] = useState(25);
  const [pace, setPace] = useState(1);
  return (
    <div className="modal-back" onClick={onClose}>
      <motion.div className="modal panel quick-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="title-deco">Partida Rápida</h2>
        <p className="muted">
          Contra bots <b>no servidor</b> — as fichas e o vínculo contam. Se ele não responder, a partida começa no seu computador.
        </p>
        <div className="form-stack">
          <Segmented label="Oponentes" value={bots} onChange={setBots} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} />
          <Segmented
            label="Dificuldade"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: 'easy', label: 'Fácil' },
              { value: 'normal', label: 'Normal' },
              { value: 'hard', label: 'Difícil' },
            ]}
          />
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
          <Segmented label="Big blind" value={blinds} onChange={setBlinds} options={[10, 20, 50, 100].map((v) => ({ value: v, label: `${v / 2}/${v}` }))} />
          <Segmented label="Tempo por jogada" value={turnTime} onChange={setTurnTime} options={[10, 25, 45, 90].map((v) => ({ value: v, label: `${v}s` }))} />
          <Segmented
            label="Ritmo da mesa"
            value={pace}
            onChange={setPace}
            options={[
              { value: 0.6, label: 'Rápido' },
              { value: 1, label: 'Normal' },
              { value: 1.4, label: 'Calmo' },
            ]}
          />
        </div>
        <div className="row gap center" style={{ marginTop: 18 }}>
          <button
            className="btn btn-gold big"
            disabled={pending}
            onClick={() => {
              sfx.click();
              startBots({ bots, difficulty, mode, variant, rounds, startingStack: stack, smallBlind: blinds / 2, bigBlind: blinds, turnTime, pace });
            }}
          >
            {pending ? 'Sentando à mesa…' : '♠ Sentar à mesa'}
          </button>
          <button className="btn btn-ghost" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Fila rápida: escolhe só a moeda e entra.
 *
 * O resto é do servidor — ele procura uma mesa da fila que já exista e, se não houver, abre uma com
 * três bots que vão saindo conforme gente chega. A mesa é cash: você joga com o que é seu até zerar.
 *
 * Padocoins só aparecem para quem tem o Discord vinculado; na mesa eles são as fichas normais.
 */
function QueueModal({ onClose }: { onClose: () => void }) {
  const quickMatch = useSession((s) => s.quickMatch);
  const queueing = useSession((s) => s.queueing);
  const chips = useChips();
  const pado = usePado();
  const stakes = QUEUE_STAKES;

  const entrar = (moeda: 'chips' | 'pado') => {
    sfx.click();
    quickMatch(moeda);
  };

  return (
    <div className="modal-back" onClick={queueing ? undefined : onClose}>
      <motion.div className="modal panel queue-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="title-deco">Fila Rápida</h2>
        <p className="muted">
          O servidor acha uma mesa com gente — ou abre uma com bots, que saem conforme jogadores chegam. Cash, com rebuy: você joga com o que é seu
          até zerar.
        </p>

        {queueing ? (
          <div className="queue-wait">
            <span className="queue-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Procurando mesa…
          </div>
        ) : (
          <div className="queue-opts">
            <button className="queue-opt" disabled={chips < stakes.chips.buyIn} onClick={() => entrar('chips')}>
              <span className="queue-opt-coin">
                <ChipSvg value={100} size={34} />
              </span>
              <span className="queue-opt-main">
                <b>Fichas</b>
                <small>
                  Buy-in {fmt(stakes.chips.buyIn)} · blinds {stakes.chips.smallBlind}/{stakes.chips.bigBlind}
                </small>
              </span>
              {chips < stakes.chips.buyIn && <span className="queue-opt-no">saldo insuficiente</span>}
            </button>

            {pado !== null ? (
              <button className="queue-opt" disabled={pado < stakes.pado.buyIn} onClick={() => entrar('pado')}>
                <span className="queue-opt-coin">
                  <PadoCoinSvg size={34} />
                </span>
                <span className="queue-opt-main">
                  <b>Padocoins</b>
                  <small>
                    Buy-in {fmt(stakes.pado.buyIn)} · blinds {stakes.pado.smallBlind}/{stakes.pado.bigBlind}
                  </small>
                </span>
                {pado < stakes.pado.buyIn && <span className="queue-opt-no">padocoins insuficientes</span>}
              </button>
            ) : (
              <div className="field-hint queue-hint">
                Vincule seu Discord em <b>Ajustes → Conta</b> para jogar valendo <b>padocoins</b>.
              </div>
            )}
          </div>
        )}

        <div className="row gap center" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={queueing} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function TopBar({ go }: { go: (s: Screen) => void }) {
  const name = useProfile((s) => s.name);
  const setName = useProfile((s) => s.setName);
  const muted = useProfile((s) => s.settings.muted);
  const updateSettings = useProfile((s) => s.updateSettings);
  const st = useCharacter();
  return (
    <div className="top-bar">
      <div className="player-chip">
        <button className="player-portrait" style={{ background: `linear-gradient(160deg, ${st.bg}, ${st.bg2})` }} onClick={() => go('characters')} title="Trocar personagem">
          <CharacterPortrait st={st} size={54} />
        </button>
        <div className="player-meta">
          <input className="player-name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} aria-label="Seu nome" />
          <span className="player-sub">♠ Pokeru · clique no personagem para conversar</span>
        </div>
      </div>
      <WalletBar />
      <div className="top-actions">
        <button className="round-icon" title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => updateSettings({ muted: !muted })}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="round-icon" title="Configurações" onClick={() => go('settings')}>
          ⚙
        </button>
      </div>
    </div>
  );
}

function ModeCard({ title, sub, glyph, cls, onClick, delay }: { title: string; sub: string; glyph: string; cls: string; onClick: () => void; delay: number }) {
  const face = useEquipped('face');
  return (
    <motion.button
      className={`mode-card ${cls}`}
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 150, damping: 18 }}
      whileHover={{ y: -8 }}
      onMouseEnter={() => sfx.hover()}
      onClick={() => {
        sfx.click();
        onClick();
      }}
    >
      <span className="mode-glyph">{glyph}</span>
      <span className="mode-cards-deco">
        <span style={{ transform: 'rotate(-14deg) translateX(-26px)' }}>
          <CardFaceSvg card={{ r: 14, s: glyph === '♥' ? 'h' : 's' }} style={face} width={64} />
        </span>
        <span style={{ transform: 'rotate(10deg) translateX(22px)' }}>
          <CardFaceSvg card={{ r: 13, s: glyph === '♥' ? 'h' : 's' }} style={face} width={64} />
        </span>
      </span>
      <span className="mode-title">{title}</span>
      <span className="mode-sub">{sub}</span>
      <span className="mode-shine" />
    </motion.button>
  );
}

export function MainMenu({ go, openQueue = false }: { go: (s: Screen) => void; openQueue?: boolean }) {
  const [quick, setQuick] = useState(false);
  // `openQueue` existe para a página de pré-visualização poder abrir a fila (veja src/dev/preview.tsx)
  const [queue, setQueue] = useState(openQueue);
  const queueing = useSession((s) => s.queueing);
  const { menu } = useUiTheme();
  const icons: { key: Screen; icon: string; label: string }[] = [
    { key: 'characters', icon: menu.icons.characters, label: 'Personagens' },
    { key: 'store', icon: '🛍', label: 'Loja' },
    { key: 'gallery', icon: '🖼', label: 'Galeria' },
    { key: 'studio', icon: menu.icons.studio, label: 'Estúdio' },
    { key: 'settings', icon: menu.icons.settings, label: 'Ajustes' },
  ];
  return (
    <div className="menu-screen mj-menu">
      <div className="menu-bg" />
      <div className="menu-rays" />
      <Petals />
      <CharacterStageView className="menu-char" />
      <TopBar go={go} />
      <motion.div className="menu-logo" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
        <span className="logo-main">
          P<span className="logo-spade">♠</span>ke<span className="logo-accent">ru</span>
        </span>
        {menu.flourish && (
          <span className="logo-flourish" aria-hidden>
            <i />
            {menu.flourish}
            <i />
          </span>
        )}
        <span className="logo-sub">{menu.subtitle}</span>
        {menu.motto && <span className="logo-est">{menu.motto}</span>}
      </motion.div>
      <div className="mode-area">
        <div className="mode-cards">
          <ModeCard title="Fila Rápida" sub="Mesa com gente, na hora" glyph="⚡" cls="gold" onClick={() => setQueue(true)} delay={0.12} />
          <ModeCard title="Partida Rápida" sub="Contra bots, no servidor" glyph="♠" cls="blue" onClick={() => setQuick(true)} delay={0.2} />
          <ModeCard title="Salas" sub="Escolher a mesa" glyph="♥" cls="pink" onClick={() => go('online')} delay={0.28} />
        </div>
        <div className="bottom-icons">
          {icons.map((it, i) => (
            <motion.button
              key={it.key}
              className="icon-btn"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 + i * 0.06 }}
              onMouseEnter={() => sfx.hover()}
              onClick={() => {
                sfx.click();
                go(it.key);
              }}
            >
              <span className="icon-circle">{it.icon}</span>
              <span className="icon-label">{it.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="version">v{APP_VERSION}</div>
      {quick && <QuickPlayModal onClose={() => setQuick(false)} />}
      {(queue || queueing) && <QueueModal onClose={() => setQueue(false)} />}
    </div>
  );
}
