import { AnimatePresence, motion } from 'framer-motion';
import type { SeatView } from '../../shared/protocol';
import { useTable } from '../store/table';
import { useCharacter } from '../store/profile';
import { ACTION_LABEL, fmt } from '../util/format';
import type { SeatGeo } from './layout';
import { ChipSvg } from '../render/Chip';
import { CharacterPortrait } from '../render/CharacterArt';
import { CountdownDigits, useSecondsLeft } from './Countdown';

/** Cartão do jogador na mesa: retrato do personagem em moldura, nome e fichas. */
export function Nameplate({
  seat,
  geo,
  acting,
  isMe,
  winner,
  badge,
}: {
  seat: SeatView;
  geo: SeatGeo;
  acting: boolean;
  isMe: boolean;
  winner: boolean;
  badge: 'D' | 'SB' | 'BB' | null;
}) {
  const deadline = useTable((s) => s.deadline);
  const allEmotes = useTable((s) => s.emotes);
  const allCallouts = useTable((s) => s.callouts);
  const mine = useCharacter();
  const st = isMe ? mine : seat.cosmetics.character;
  const secs = useSecondsLeft(acting && !isMe ? deadline : null);
  const emotes = allEmotes.filter((e) => e.seat === seat.seat);
  const callouts = allCallouts.filter((c) => c.seat === seat.seat);
  const action = seat.lastAction && seat.lastAction !== 'sb' && seat.lastAction !== 'bb' ? ACTION_LABEL[seat.lastAction] : null;
  const size = isMe ? 96 : 76;
  const cls = ['plate', 'seat-card', acting && 'acting', seat.folded && 'folded', winner && 'winner', isMe && 'is-me', !seat.connected && 'offline', seat.busted && 'busted']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={{ left: geo.plate.x, top: geo.plate.y }}>
      <div className="seat-portrait" style={{ background: `linear-gradient(160deg, ${st.bg}, ${st.bg2})`, width: size, height: size }}>
        <CharacterPortrait st={st} size={size} />
        <div className="seat-frame" />
        {badge && <div className={`plate-pos pos-${badge}`}>{badge}</div>}
        {secs !== null && (
          <div className="seat-count">
            <CountdownDigits seconds={secs} variant="small" />
          </div>
        )}
      </div>
      <div className="seat-info">
        <div className="seat-name">
          {seat.name}
          {seat.isBot && <span className="tag">BOT</span>}
        </div>
        <div className="seat-stack">
          <ChipSvg value={100} size={16} />
          {fmt(seat.stack)}
        </div>
      </div>
      {seat.allIn && !seat.folded && <div className="plate-badge allin">ALL-IN</div>}
      {action && !seat.allIn && <div className={`plate-action act-${seat.lastAction}`}>{action}</div>}
      {/* poker de 5 cartas: quantas cartas o jogador trocou (informação pública) */}
      {typeof seat.drew === 'number' && !seat.folded && (
        <div className="plate-drew">{seat.drew === 0 ? 'manteve' : `trocou ${seat.drew}`}</div>
      )}
      {seat.handName && !seat.folded && <div className="plate-hand">{seat.handName}</div>}
      {emotes.map((e) => (
        <div key={e.id} className="emote-bubble">
          {e.emote}
        </div>
      ))}
      <div className="callout-wrap">
        <AnimatePresence>
          {callouts.map((c) => (
            <motion.div
              key={c.id}
              className={`callout callout-${c.kind}`}
              initial={{ scale: 2.4, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              exit={{ opacity: 0, y: -26, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            >
              {c.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
