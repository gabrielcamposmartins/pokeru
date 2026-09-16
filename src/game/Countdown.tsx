import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTable } from '../store/table';
import { sfx } from '../audio/sfx';

/** Segundos restantes até `deadline` (atualiza várias vezes por segundo). */
export function useSecondsLeft(deadline: number | null): number | null {
  const calc = () => (deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null);
  const [s, setS] = useState<number | null>(calc);
  useEffect(() => {
    if (!deadline) {
      setS(null);
      return;
    }
    const tick = () => setS(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, [deadline]);
  return s;
}

/** Números grandes que caem a cada segundo (estilo Mahjong Soul). */
export function CountdownDigits({ seconds, variant }: { seconds: number; variant: 'big' | 'small' }) {
  const danger = seconds <= 5;
  return (
    <div className={`countdown countdown-${variant} ${danger ? 'danger' : ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={seconds}
          className="countdown-num"
          initial={{ scale: 1.8, opacity: 0, y: -12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.5, opacity: 0, y: 18 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {seconds}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** Contador da minha vez, grande, ao lado da minha mão. */
export function MyCountdown() {
  const view = useTable((s) => s.display);
  const deadline = useTable((s) => s.deadline);
  const myTurn = !!view && view.mySeat !== null && view.toAct === view.mySeat;
  const secs = useSecondsLeft(myTurn ? deadline : null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (secs !== null && secs !== last.current && secs <= 5 && secs > 0) sfx.tick();
    last.current = secs;
  }, [secs]);
  if (!myTurn || secs === null) return null;
  return (
    <div className="my-countdown">
      <span className="my-countdown-label">TEMPO</span>
      <CountdownDigits seconds={secs} variant="big" />
    </div>
  );
}
