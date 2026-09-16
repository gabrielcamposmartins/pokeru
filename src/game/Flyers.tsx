import { motion } from 'framer-motion';
import { useTable, type Flyer } from '../store/table';
import { CardView } from '../render/CardArt';
import { ChipStack } from '../render/Chip';
import { scaled } from '../anim/tween';

export type FlyerSpace = 'plane' | 'screen';

export function flyerSpace(f: Flyer): FlyerSpace {
  return f.space ?? (f.kind === 'card' ? 'plane' : 'screen');
}

function FlyerItem({ f }: { f: Flyer }) {
  const dur = scaled(f.dur) / 1000;
  const isCard = f.kind === 'card';
  const w = f.width ?? 60;
  // cartas: posição = centro da carta; fichas: posição = base da pilha
  const offX = isCard ? w / 2 : 0;
  const offY = isCard ? (w * 1.4) / 2 : 0;
  const s0 = f.scaleFrom ?? 1;
  const s1 = f.scaleTo ?? s0;
  const mid = f.arc ? { x: (f.from.x + f.to.x) / 2, y: Math.min(f.from.y, f.to.y) - f.arc } : null;
  return (
    <motion.div
      className="flyer"
      style={isCard ? undefined : { transformOrigin: '0 0' }}
      initial={{ x: f.from.x - offX, y: f.from.y - offY, rotate: f.rotFrom ?? 0, opacity: 1, scale: s0 }}
      animate={{
        x: mid ? [f.from.x - offX, mid.x - offX, f.to.x - offX] : f.to.x - offX,
        y: mid ? [f.from.y - offY, mid.y - offY, f.to.y - offY] : f.to.y - offY,
        rotate: f.rotTo ?? f.rotFrom ?? 0,
        opacity: f.fade ? [1, 1, 0] : 1,
        scale: isCard ? [1, 1.1, 1] : s1,
      }}
      transition={{ duration: dur, ease: [0.25, 0.7, 0.35, 1] }}
      onAnimationComplete={() => f.onDone?.()}
    >
      {isCard ? (
        <CardView card={f.card ?? null} faceUp={!!f.faceUp && !!f.card} width={w} back={f.back} />
      ) : (
        <div className="flyer-chip-inner">
          <ChipStack amount={f.amount ?? 0} size={30} label={false} maxCols={3} />
        </div>
      )}
    </motion.div>
  );
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
