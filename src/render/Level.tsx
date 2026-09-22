/**
 * O nível do jogador, em número colorido.
 *
 * A cor é da **dezena**: 0–9 prata, 10–19 menta, … 90–100 rubi. Serve para ler a experiência de
 * longe, sem contar dígitos — e é a mesma cor das partículas que sobem do número.
 *
 * O nível em si sai dos contadores das conquistas (veja `playerLevel`, em shared/achievements.ts);
 * aqui é só a pintura.
 */

import { Sparks } from './Sparks';

/** Uma cor por dezena, do começo ao 100. */
const CORES = [
  '#c9c4de', // 0–9    prata
  '#6bf2c1', // 10–19  menta
  '#35c4ff', // 20–29  ciano
  '#7c5cff', // 30–39  violeta
  '#c46bff', // 40–49  lilás
  '#ff6b9a', // 50–59  rosa
  '#ff8a5c', // 60–69  coral
  '#ffb347', // 70–79  âmbar
  '#f2c14e', // 80–89  ouro
  '#ff5d73', // 90–99  rubi
  '#ffe7a0', // 100    ouro claro
];

export function levelColor(level: number): string {
  const n = Math.max(0, Math.min(100, Math.floor(level)));
  return CORES[Math.min(CORES.length - 1, Math.floor(n / 10))];
}

/**
 * O número, na cor da dezena, soltando partículas para cima.
 *
 * `size` aceita medida CSS (por exemplo um `clamp`) para o número acompanhar um card que muda de
 * tamanho com a janela; as partículas, que precisam de número, usam 28 como base nesse caso.
 */
export function LevelNumber({ level, size = 30, sparks = true, className }: { level: number; size?: number | string; sparks?: boolean; className?: string }) {
  const cor = levelColor(level);
  const base = typeof size === 'number' ? size : 28;
  return (
    <span className={`lvl ${className ?? ''}`} style={{ color: cor, fontSize: size }}>
      <span className="lvl-cap">Nv</span>
      <b className="lvl-num" style={{ textShadow: `0 0 10px ${cor}66, 0 2px 3px #000` }}>
        {Math.max(0, Math.floor(level))}
      </b>
      {sparks && <Sparks color={cor} count={7} size={Math.max(3, Math.round(base / 7))} rise={base * 1.15} spread={base * 0.8} />}
    </span>
  );
}
