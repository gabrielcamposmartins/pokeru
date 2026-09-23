import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '../../shared/cards';
import { HandCategory, CATEGORY_NAMES } from '../../shared/evaluator';
import { CardFaceSvg } from '../render/CardArt';
import { useEquipped } from '../store/profile';
import { sfx } from '../audio/sfx';

/**
 * As mãos do poker, para quem está começando.
 *
 * É a única tela do jogo que existe para **ensinar**, então a régua é outra: nada de números, de
 * probabilidade ou de jargão. Cada mão aparece com as cinco cartas que a formam — do jeito que o
 * jogador vai ver na mesa, com as cartas dele — e uma linha dizendo o que olhar. A ordem é da mais
 * forte para a mais fraca, que é a ordem em que a dúvida aparece ("a minha ganha da dele?").
 *
 * Os nomes vêm de `CATEGORY_NAMES` (shared/evaluator.ts), o mesmo que a mesa anuncia no showdown:
 * quem aprende aqui lê a mesma palavra lá.
 */

/** Uma mão de exemplo: as cinco cartas e a linha que explica. */
interface Exemplo {
  cat: HandCategory;
  cards: Card[];
  /** O que faz essa mão ser essa mão, em uma frase. */
  como: string;
  /** As cartas que importam (índices), para destacar. */
  foco: number[];
}

const c = (r: number, s: Card['s']): Card => ({ r, s });

/** Da mais forte para a mais fraca. */
const MAOS: Exemplo[] = [
  {
    cat: HandCategory.StraightFlush,
    cards: [c(10, 's'), c(11, 's'), c(12, 's'), c(13, 's'), c(14, 's')],
    como: 'Cinco em seguida, todas do mesmo naipe. A melhor mão do jogo.',
    foco: [0, 1, 2, 3, 4],
  },
  {
    cat: HandCategory.Quads,
    cards: [c(9, 's'), c(9, 'h'), c(9, 'd'), c(9, 'c'), c(4, 'h')],
    como: 'As quatro cartas de um mesmo valor.',
    foco: [0, 1, 2, 3],
  },
  {
    cat: HandCategory.FullHouse,
    cards: [c(12, 's'), c(12, 'h'), c(12, 'd'), c(7, 'c'), c(7, 'h')],
    como: 'Uma trinca e um par ao mesmo tempo.',
    foco: [0, 1, 2, 3, 4],
  },
  {
    cat: HandCategory.Flush,
    cards: [c(14, 'h'), c(11, 'h'), c(8, 'h'), c(6, 'h'), c(3, 'h')],
    como: 'Cinco do mesmo naipe, em qualquer ordem.',
    foco: [0, 1, 2, 3, 4],
  },
  {
    cat: HandCategory.Straight,
    cards: [c(5, 'c'), c(6, 'h'), c(7, 's'), c(8, 'd'), c(9, 'h')],
    como: 'Cinco em seguida, de naipes misturados.',
    foco: [0, 1, 2, 3, 4],
  },
  {
    cat: HandCategory.Trips,
    cards: [c(6, 's'), c(6, 'h'), c(6, 'd'), c(13, 'c'), c(2, 'h')],
    como: 'Três cartas do mesmo valor.',
    foco: [0, 1, 2],
  },
  {
    cat: HandCategory.TwoPair,
    cards: [c(13, 's'), c(13, 'h'), c(4, 'd'), c(4, 'c'), c(10, 'h')],
    como: 'Dois pares diferentes.',
    foco: [0, 1, 2, 3],
  },
  {
    cat: HandCategory.Pair,
    cards: [c(11, 's'), c(11, 'h'), c(9, 'd'), c(5, 'c'), c(2, 'h')],
    como: 'Duas cartas do mesmo valor.',
    foco: [0, 1],
  },
  {
    cat: HandCategory.HighCard,
    cards: [c(14, 's'), c(10, 'h'), c(7, 'd'), c(4, 'c'), c(2, 'h')],
    como: 'Nada se encaixa: vale a carta mais alta.',
    foco: [0],
  },
];

export function HandGuide({ onClose }: { onClose: () => void }) {
  const face = useEquipped('face');
  return (
    <div className="modal-back guia-back" onClick={onClose}>
      <motion.div
        className="modal panel guia"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="guia-cab">
          <h2 className="title-deco">As mãos do poker</h2>
          <span className="muted small">
            Da mais forte para a mais fraca. Empate na mão, ganha a carta mais alta.
          </span>
          <button className="guia-fechar" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <ol className="guia-lista">
          {MAOS.map((m, i) => (
            <li key={m.cat}>
              <span className="guia-pos">{MAOS.length - i}</span>
              <span className="guia-info">
                <b>{CATEGORY_NAMES[m.cat]}</b>
                <small>{m.como}</small>
              </span>
              <span className="guia-cartas">
                {m.cards.map((card, n) => (
                  <i key={n} className={m.foco.includes(n) ? 'on' : ''}>
                    <CardFaceSvg card={card} style={face} width={40} />
                  </i>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </motion.div>
    </div>
  );
}

/**
 * O botão de interrogação que abre o guia.
 *
 * Mora no menu e na mesa — a dúvida costuma vir no meio da mão, não antes dela. `className` deixa
 * cada lugar usar o seu botão redondo (`round-icon` no menu, `hud-btn` na mesa) sem duplicar a
 * lógica de abrir e fechar.
 */
export function HandGuideButton({ className = 'round-icon' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={className}
        title="As mãos do poker"
        aria-label="As mãos do poker"
        onClick={() => {
          sfx.click();
          setOpen(true);
        }}
      >
        ?
      </button>
      {open && <HandGuide onClose={() => setOpen(false)} />}
    </>
  );
}
