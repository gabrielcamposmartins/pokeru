import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '../../shared/cards';
import type { CardBackStyle, CardFaceStyle, ChipStyle, TableStyle } from '../../shared/styles';
import { CHIP_VALUES } from '../../shared/styles';
import { CardBackSvg, CardFaceSvg, CardView } from './CardArt';
import { CharacterPortrait } from './CharacterArt';
import { PortraitFrame, findFrame } from './PortraitFrame';
import { ChipStack, ChipSvg } from './Chip';
import { TableFelt } from './TableFelt';
import { CARD_H, CARD_W, boardSlot, planeStyle, project } from '../game/layout';
import { useCharacter, useProfile } from '../store/profile';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';

/**
 * As pré-visualizações dos estilos: a peça mostrada como ela aparece na mesa.
 *
 * Nasceram no Estúdio, onde servem para editar; a Loja mostra as mesmas, porque quem vai gastar
 * fichas precisa ver exatamente o que o Estúdio mostraria depois. Duas telas, um desenho só —
 * se a mesa mudar, muda nas duas.
 */

const FACE_SAMPLES: Card[] = [
  { r: 14, s: 's' },
  { r: 13, s: 'h' },
  { r: 12, s: 'd' },
  { r: 11, s: 'c' },
  { r: 10, s: 'h' },
  { r: 7, s: 's' },
  { r: 5, s: 'd' },
  { r: 3, s: 'c' },
];

export function FacePreview({ st, width = 128 }: { st: CardFaceStyle; width?: number }) {
  return (
    <div className="preview-cards">
      {FACE_SAMPLES.map((c, i) => (
        <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -14, rotate: -2 }}>
          <CardFaceSvg card={c} style={st} width={width} />
        </motion.div>
      ))}
    </div>
  );
}

export function BackPreview({ st, width = 230 }: { st: CardBackStyle; width?: number }) {
  return (
    <div className="preview-backs">
      <motion.div whileHover={{ rotateY: 15, rotateX: 8 }} style={{ transformPerspective: 800 }}>
        <CardBackSvg style={st} width={width} />
      </motion.div>
      <div className="mini-fan">
        {[-14, 0, 14].map((a, i) => (
          <div key={i} style={{ transform: `rotate(${a}deg)` }}>
            <CardBackSvg style={st} width={110} />
          </div>
        ))}
      </div>
      <div className="flip-demo">
        <span className="muted small">Passe o mouse ou clique para virar</span>
        <FlipDemo back={st} />
      </div>
    </div>
  );
}

/**
 * A carta virando.
 *
 * Vira com o mouse por cima e também no clique: o mouse é o gesto de quem está no computador, o
 * clique é o de quem está no touch — e sem ele a demonstração não existiria em metade das telas.
 */
export function FlipDemo({ back }: { back: CardBackStyle }) {
  const [hover, setHover] = useState(false);
  const [preso, setPreso] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        sfx.click();
        setPreso((p) => !p);
      }}
      style={{ cursor: 'pointer' }}
    >
      <CardView card={{ r: 14, s: 's' }} faceUp={hover !== preso} width={110} back={back} />
    </div>
  );
}

export function ChipPreview({ st, size = 84 }: { st: ChipStyle; size?: number }) {
  return (
    <div className="preview-chips">
      <div className="chip-row">
        {CHIP_VALUES.map((v, i) => (
          <motion.div key={v} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.04, type: 'spring' }} whileHover={{ y: -8, rotate: 25 }}>
            <ChipSvg value={v} size={size} style={st} />
          </motion.div>
        ))}
      </div>
      <div className="row gap center" style={{ gap: 60, marginTop: 30 }}>
        <ChipStack amount={12860} size={64} style={st} />
        <ChipStack amount={2535} size={64} style={st} />
        <ChipStack amount={31250} size={64} style={st} />
      </div>
    </div>
  );
}

const PREVIEW_PLANE = planeStyle();

/** A mesa de verdade: o mesmo feltro, o mesmo plano inclinado e as mesmas cartas do jogo. */
export function TablePreview({ st }: { st: TableStyle }) {
  // o bordo inteiro, como no fim de uma mão — é o que enche o feltro e mostra a mesa em uso
  const cards: Card[] = [
    { r: 14, s: 'h' },
    { r: 13, s: 'h' },
    { r: 7, s: 'c' },
    { r: 2, s: 's' },
    { r: 10, s: 'd' },
  ];
  // a aposta fica ao lado, e não em cima do logo gravado no feltro
  const chips = project({ x: 1180, y: 800 });
  return (
    <div className="preview-table" style={{ background: `radial-gradient(ellipse at 50% 40%, ${st.bgTop}, ${st.bgBottom} 80%)` }}>
      <div className="preview-table-inner">
        <div style={PREVIEW_PLANE}>
          <TableFelt st={st} />
          {cards.map((c, i) => {
            const p = boardSlot(i);
            return (
              <div key={i} style={{ position: 'absolute', left: p.x - CARD_W / 2, top: p.y - CARD_H / 2 }}>
                <CardView card={c} width={CARD_W} />
              </div>
            );
          })}
        </div>
        <div className="seat-bet" style={{ left: chips.x, top: chips.y, transform: `scale(${chips.s})` }}>
          <div className="seat-bet-inner">
            <ChipStack amount={3450} size={36} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Amostra de componentes da mesa, desenhada com o tema ativo (o da pré-visualização). */
export function ThemeSample() {
  const character = useCharacter();
  const name = useProfile((s) => s.name);
  const moldura = useProfile((s) => s.frame);
  return (
    <div className="theme-sample">
      <div className="theme-sample-row">
        <div className="plate seat-card is-me theme-sample-plate">
          <div className="seat-portrait" style={{ background: `linear-gradient(160deg, ${character.bg}, ${character.bg2})`, width: 76, height: 76 }}>
            <CharacterPortrait st={character} size={76} />
            <PortraitFrame frame={findFrame(moldura)} size={76} />
            <div className="plate-pos pos-D">D</div>
          </div>
          <div className="seat-info">
            <div className="seat-name">{name}</div>
            <div className="seat-stack">
              <ChipSvg value={100} size={16} />
              {fmt(2480)}
            </div>
          </div>
          <div className="plate-action act-raise">Aumentou</div>
        </div>
        <div className="callout callout-raise">Aumento!</div>
      </div>
      <div className="theme-sample-row">
        <CardView card={{ r: 14, s: 's' }} width={74} />
        <CardView card={{ r: 13, s: 'h' }} width={74} />
        <CardView card={null} faceUp={false} width={74} />
        <ChipStack amount={1250} size={30} maxCols={3} />
      </div>
      <div className="act-row">
        <button className="act-btn fold" onClick={() => sfx.click()}>
          Desistir
        </button>
        <button className="act-btn call" onClick={() => sfx.click()}>
          Pagar {fmt(40)}
        </button>
        <button className="act-btn raise" onClick={() => sfx.click()}>
          Aumentar {fmt(120)}
        </button>
      </div>
    </div>
  );
}
