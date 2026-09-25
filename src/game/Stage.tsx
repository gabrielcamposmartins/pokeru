import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { STAGE_H, STAGE_W } from './layout';

/** Palco virtual de 1600x900 escalado para caber na janela. */
export function Stage({ children, background, className, style }: { children: ReactNode; background?: string; className?: string; style?: CSSProperties }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className={`stage-wrap ${className ?? ''}`} style={{ ...style, ...(background ? { background } : {}) }}>
      <div className="stage" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
