import { motion, type Easing } from 'framer-motion';
import { useTable, type Flyer } from '../store/table';
import { CardView } from '../render/CardArt';
import { ChipStack } from '../render/Chip';
import { scaled } from '../anim/tween';

export type FlyerSpace = 'plane' | 'screen';

export function flyerSpace(f: Flyer): FlyerSpace {
  return f.space ?? (f.kind === 'card' ? 'plane' : 'screen');
}

function CardFlyer({ f }: { f: Flyer }) {
  const dur = scaled(f.dur) / 1000;
  const w = f.width ?? 60;
  const offX = w / 2;
  const offY = (w * 1.4) / 2;
  const mid = f.arc ? { x: (f.from.x + f.to.x) / 2, y: Math.min(f.from.y, f.to.y) - f.arc } : null;
  return (
    <motion.div
      className="flyer"
      initial={{ x: f.from.x - offX, y: f.from.y - offY, rotate: f.rotFrom ?? 0, opacity: 1, scale: f.scaleFrom ?? 1 }}
      animate={{
        x: mid ? [f.from.x - offX, mid.x - offX, f.to.x - offX] : f.to.x - offX,
        y: mid ? [f.from.y - offY, mid.y - offY, f.to.y - offY] : f.to.y - offY,
        rotate: f.rotTo ?? f.rotFrom ?? 0,
        opacity: f.fade ? [1, 1, 0] : 1,
        scale: [1, 1.1, 1],
      }}
      transition={{ duration: dur, ease: [0.25, 0.7, 0.35, 1] }}
      onAnimationComplete={() => f.onDone?.()}
    >
      <CardView card={f.card ?? null} faceUp={!!f.faceUp && !!f.card} width={w} back={f.back} />
    </motion.div>
  );
}

/**
 * Quadros-chave do arremesso de fichas: sobem num arco, giram um pouco no ar e quicam ao pousar
 * antes de assentar. Todas as listas têm o mesmo tamanho (é o que o framer espera junto de `times`).
 */
export function chipFlight(f: Flyer): {
  x: number[];
  y: number[];
  rotate: number[];
  opacity: number[];
  scale: number[];
  times: number[];
  ease: Easing[];
} {
  const s0 = f.scaleFrom ?? 1;
  const s1 = f.scaleTo ?? s0;
  const spin = f.spin ?? 0;
  const bounce = f.bounce ?? 0;
  const r0 = f.rotFrom ?? 0;
  const mid = f.arc ? { x: (f.from.x + f.to.x) / 2, y: Math.min(f.from.y, f.to.y) - f.arc } : null;
  if (mid) {
    return {
      x: [f.from.x, mid.x, f.to.x, f.to.x],
      y: [f.from.y, mid.y, f.to.y - bounce, f.to.y],
      rotate: [r0, spin, spin * 0.35, 0],
      opacity: [1, 1, 1, f.fade ? 0 : 1],
      scale: [s0, (s0 + s1) / 2, s1, s1],
      times: [0, 0.52, 0.82, 1],
      ease: ['easeOut', 'easeIn', 'easeOut'],
    };
  }
  return {
    x: [f.from.x, f.to.x, f.to.x],
    y: [f.from.y, f.to.y - bounce, f.to.y],
    rotate: [r0, spin, 0],
    opacity: [1, 1, f.fade ? 0 : 1],
    scale: [s0, s1, s1],
    times: [0, 0.8, 1],
    ease: ['easeOut', 'easeOut'],
  };
}

function ChipFlyer({ f }: { f: Flyer }) {
  const dur = scaled(f.dur) / 1000;
  const { times, ease, ...kf } = chipFlight(f);
  return (
    <motion.div
      className="flyer"
      style={{ transformOrigin: '0 0' }}
      initial={{ x: f.from.x, y: f.from.y, rotate: f.rotFrom ?? 0, opacity: 1, scale: f.scaleFrom ?? 1 }}
      animate={kf}
      transition={{ duration: dur, times, ease }}
      onAnimationComplete={() => f.onDone?.()}
    >
      <div className="flyer-chip-inner">
        <ChipStack amount={f.amount ?? 0} size={30} label={false} maxCols={3} seed={f.id} />
      </div>
    </motion.div>
  );
}

function FlyerItem({ f }: { f: Flyer }) {
  return f.kind === 'card' ? <CardFlyer f={f} /> : <ChipFlyer f={f} />;
}

/** Camada de objetos voando: 'plane' (cartas deitadas na mesa) ou 'screen' (fichas em pé). */
export function FlyersLayer({ space }: { space: FlyerSpace }) {
  const flyers = useTable((s) => s.flyers);
  return (
    <div className="flyers-layer">
      {flyers
        .filter((f) => flyerSpace(f) === space)
        .map((f) => (
          <FlyerItem key={f.id} f={f} />
        ))}
    </div>
  );
}
