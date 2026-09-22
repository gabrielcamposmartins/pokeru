/**
 * O título do jogador, pintado pelo **grau da conquista** que o liberou.
 *
 * Um "Novato da Mesa" e um "Tubarão" não podem sair iguais na tela: o primeiro vem de uma mão
 * jogada, o segundo de quinhentas ganhas. A cor (e o brilho) é o que conta isso de longe — a mesma
 * ideia do número do nível, e de propósito a mesma paleta.
 *
 * O grau mora na lista de conquistas (shared/achievements.ts), que é a mesma no cliente e no
 * servidor; aqui é só a pintura.
 */

import { titleTier } from '../../shared/achievements';
import { Sparks } from './Sparks';

/** Uma cor por grau: comum, incomum, raro, épico, lendário. */
const CORES: Record<number, string> = {
  1: '#c9c4de',
  2: '#6bf2c1',
  3: '#35c4ff',
  4: '#c46bff',
  5: '#f2c14e',
};

export function titleColor(title: string | null | undefined): string {
  return CORES[titleTier(title)];
}

/**
 * O título com brilho e partículas, como o nível.
 *
 * As partículas são poucas de propósito: são duas coisas brilhando no mesmo card, e o número é
 * quem deve chamar mais atenção.
 */
export function TitleGlow({ title, className }: { title: string; className?: string }) {
  const cor = titleColor(title);
  return (
    <span className={`ttl ${className ?? ''}`} style={{ color: cor, textShadow: `0 0 9px ${cor}59, 0 1px 3px #000` }}>
      {title}
      <Sparks color={cor} count={4} size={2} rise={13} spread={30} speed={2.2} />
    </span>
  );
}
