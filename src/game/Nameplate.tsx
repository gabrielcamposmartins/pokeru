import { AnimatePresence, motion } from 'framer-motion';
import type { SeatView } from '../../shared/protocol';
import { useTable } from '../store/table';
import { useCharacter, useProfile } from '../store/profile';
import { ACTION_LABEL, fmt } from '../util/format';
import type { SeatGeo } from './layout';
import { ChipSvg } from '../render/Chip';
import { CharacterPortrait } from '../render/CharacterArt';
import { PortraitFrame, findFrame } from '../render/PortraitFrame';
import { CountdownDigits, useSecondsLeft } from './Countdown';
import { useSession } from '../store/session';
import { pedirAmizadeNaMesa, useRelacao } from '../store/friends';
import { sfx } from '../audio/sfx';

/**
 * O botãozinho de pedir amizade, no canto do retrato de quem está na mesa.
 *
 * Aparece ao passar o mouse na placa, e só para quem tem conta e ainda não é amigo. A conta sai da
 * sala (o assento em si não carrega conta nenhuma), e o pedido vai pelo id de jogador: o servidor
 * confere que os dois estão na mesma mesa.
 */
function PedirAmizade({ seat }: { seat: SeatView }) {
  const conta = useSession((s) => s.room?.members.find((m) => m.id === seat.id)?.conta);
  const toast = useSession((s) => s.toast);
  const relacao = useRelacao(conta);
  if (relacao !== 'livre') return null;
  return (
    <button
      className="plate-amigo"
      title={`Pedir amizade a ${seat.name}`}
      aria-label={`Pedir amizade a ${seat.name}`}
      onClick={(e) => {
        e.stopPropagation();
        sfx.click();
        pedirAmizadeNaMesa(seat.id);
        toast(`Pedido de amizade enviado para ${seat.name}`);
      }}
    >
      +♥
    </button>
  );
}

/** Abaixo desta altura (no palco de 1600x900) a placa está colada no alto da tela. */
const ASSENTO_DO_TOPO = 140;

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
  const minhaMoldura = useProfile((s) => s.frame);
  const st = isMe ? mine : seat.cosmetics.character;
  /*
   * A moldura é de quem está sentado, e a minha sai do perfil, não da mesa.
   *
   * O servidor devolve nos cosméticos do assento o que ele aceitou; para o meu assento vale o que
   * eu acabei de escolher, para eu ver a troca na hora em vez de na próxima entrada.
   */
  // bot não tem moldura própria (veja o sorteio dos bots em shared/room.ts): fica a dourada de sempre
  const moldura = findFrame(isMe ? minhaMoldura : seat.isBot ? null : seat.cosmetics.frame);
  const secs = useSecondsLeft(acting && !isMe ? deadline : null);
  const emotes = allEmotes.filter((e) => e.seat === seat.seat);
  const callouts = allCallouts.filter((c) => c.seat === seat.seat);
  const action = seat.lastAction && seat.lastAction !== 'sb' && seat.lastAction !== 'bb' ? ACTION_LABEL[seat.lastAction] : null;
  const size = isMe ? 96 : 76;
  // o assento do alto da mesa não tem espaço em cima: o balão do emote sai ao lado da placa
  const noTopo = geo.plate.y < ASSENTO_DO_TOPO;
  const cls = ['plate', 'seat-card', acting && 'acting', seat.folded && 'folded', winner && 'winner', isMe && 'is-me', !seat.connected && 'offline', seat.busted && 'busted']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={{ left: geo.plate.x, top: geo.plate.y }}>
      <div className="seat-portrait" style={{ background: `linear-gradient(160deg, ${st.bg}, ${st.bg2})`, width: size, height: size }}>
        <CharacterPortrait st={st} size={size} />
        <PortraitFrame frame={moldura} size={size} />
        {badge && <div className={`plate-pos pos-${badge}`}>{badge}</div>}
        {!isMe && !seat.isBot && <PedirAmizade seat={seat} />}
        {secs !== null && (
          <div className="seat-count">
            <CountdownDigits seconds={secs} variant="small" />
          </div>
        )}
      </div>
      <div className="seat-info">
        {seat.title && <div className="seat-title">{seat.title}</div>}
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
        <div key={e.id} className={`emote-bubble ${noTopo ? 'lado' : ''}`}>
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
