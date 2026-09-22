/**
 * Partículas que sobem.
 *
 * Um punhado de pontinhos que nascem na base, sobem e somem. Nasceu para o número do nível na
 * abertura, mas é de propósito genérico — cor, quantidade, altura e ritmo são parâmetros, e o
 * elemento se posiciona sozinho sobre o pai (que precisa ser `position: relative`).
 *
 * As posições e os atrasos são **calculados do índice**, não sorteados: assim o mesmo card desenha
 * igual em toda renderização (inclusive no servidor, nos testes) e não pisca a cada re-render.
 */

import type { CSSProperties } from 'react';

export interface SparksProps {
  /** Cor das partículas. */
  color: string;
  /** Quantas ao mesmo tempo. */
  count?: number;
  /** Diâmetro em px. */
  size?: number;
  /** Quanto sobem, em px. */
  rise?: number;
  /** Largura em que se espalham, em px. */
  spread?: number;
  /** Duração de uma subida, em segundos. */
  speed?: number;
  className?: string;
  style?: CSSProperties;
}

/** Espalhamento e ritmo de cada partícula, tirados do índice (sempre os mesmos). */
function jeito(i: number, count: number, spread: number, speed: number) {
  const passo = count > 1 ? i / (count - 1) : 0.5;
  // ziguezague: pares para um lado, ímpares para o outro, para não virar uma fileira
  const desvio = (passo - 0.5) * spread + (i % 2 ? spread * 0.12 : -spread * 0.12);
  return {
    left: `calc(50% + ${desvio.toFixed(1)}px)`,
    animationDelay: `${((i * 0.37) % 1) * speed}s`,
    animationDuration: `${speed * (0.8 + ((i * 0.23) % 1) * 0.5)}s`,
  };
}

export function Sparks({ color, count = 6, size = 3, rise = 26, spread = 16, speed = 1.6, className, style }: SparksProps) {
  return (
    <span className={`sparks ${className ?? ''}`} style={{ color, ['--spark-rise' as string]: `${rise}px`, ...style }} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className="spark" style={{ width: size, height: size, ...jeito(i, count, spread, speed) }} />
      ))}
    </span>
  );
}
