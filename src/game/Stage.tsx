import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { STAGE_H, STAGE_W } from './layout';

/** A escala do palco na janela: o maior 1600×900 que cabe nela. */
export function escalaDoPalco(): number {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
}

/**
 * O quanto a janela passa do palco, em unidades do palco: a largura e a altura dela, e a sobra de
 * cada lado. É o espaço que a mesa 3D ocupa (o palco fica no meio).
 */
export function janelaNoPalco(): { largura: number; altura: number; sobraX: number; sobraY: number } {
  const k = escalaDoPalco() || 1;
  const largura = window.innerWidth / k;
  const altura = window.innerHeight / k;
  return { largura, altura, sobraX: Math.max(0, (largura - STAGE_W) / 2), sobraY: Math.max(0, (altura - STAGE_H) / 2) };
}

/** `janelaNoPalco`, acompanhando o tamanho da janela. */
export function useJanelaNoPalco() {
  const [j, setJ] = useState(janelaNoPalco);
  useLayoutEffect(() => {
    const medir = () => setJ(janelaNoPalco());
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return j;
}

/** Palco virtual de 1600x900 escalado para caber na janela. */
export function Stage({ children, background, className, style }: { children: ReactNode; background?: string; className?: string; style?: CSSProperties }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(escalaDoPalco());
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
