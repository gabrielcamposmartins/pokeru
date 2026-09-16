/** Mini motor de tweens baseado em requestAnimationFrame, com escala de tempo global. */

let timeScale = 1;

export function setTimeScale(s: number): void {
  timeScale = Math.max(0.1, s);
}

export function getTimeScale(): number {
  return timeScale;
}

export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  in: (t: number) => t * t * t,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: (t: number) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

function skipping(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/** Executa `onUpdate(t)` com t ∈ [0,1] durante `ms` milissegundos (escalados). */
export function tween(ms: number, onUpdate: (t: number) => void, easing: Easing = ease.inOut): Promise<void> {
  const dur = ms / timeScale;
  return new Promise((resolve) => {
    if (dur <= 8 || skipping()) {
      onUpdate(1);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      if (skipping()) {
        onUpdate(1);
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / dur);
      onUpdate(easing(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function wait(ms: number): Promise<void> {
  if (skipping()) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms / timeScale));
}

/** Duração real (ms) já escalada — para animações do framer-motion. */
export function scaled(ms: number): number {
  return skipping() ? 0 : ms / timeScale;
}
