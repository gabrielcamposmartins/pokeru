import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { sameCard, type Card } from '../../shared/cards';
import { useTable, type RoundResult as Result } from '../store/table';
import { CardView } from '../render/CardArt';
import { findWinFx } from '../render/cardfx';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { ChipSvg } from '../render/Chip';
import { useUiTheme } from '../ui/themes';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';

/** Segundos que a tela fica antes de sair sozinha. */
const HOLD = 5;
/** Inclinação da tarja diagonal (graus) — a mesma do CSS em .rr-band. */
const BAND_TILT = -6;
const CARD_W = 132;

function Cards({ label, cards, best, fx }: { label: string; cards: Card[]; best: Card[]; fx: Result['winFx'] }) {
  const effect = findWinFx(fx);
  return (
    <div className="rr-group">
      <span className="rr-label">{label}</span>
      <div className="rr-row">
        {cards.map((c, i) => {
          const used = best.some((b) => sameCard(b, c));
          return (
            <motion.div
              key={`${c.r}${c.s}`}
              initial={{ y: -40, opacity: 0, rotate: -8 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.18 + i * 0.08, type: 'spring', stiffness: 220, damping: 20 }}
            >
              <CardView card={c} width={CARD_W} highlight={used} dim={!used} winFx={used ? effect : null} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** O painel em si (exportado para o teste; na tela use RoundResultScreen). */
export function RoundResultPanel({ r }: { r: Result }) {
  const setResult = useTable((s) => s.setResult);
  const theme = useUiTheme();
  const [secs, setSecs] = useState(HOLD);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (secs <= 0) setResult(null);
  }, [secs, setResult]);
  const close = () => {
    sfx.click();
    setResult(null);
  };
  return (
    <motion.div className="round-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <div className="rr-back" />
      <motion.div
        className="rr-band"
        style={{ background: theme.cutinBand(r.character) }}
        // a rotação vai junto na animação: o transform do framer substitui o do CSS
        initial={{ rotate: BAND_TILT, scaleX: 0.25, opacity: 0 }}
        animate={{ rotate: BAND_TILT, scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
      <motion.div
        className="rr-char"
        initial={{ x: -140, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.06, type: 'spring', stiffness: 150, damping: 20 }}
      >
        <CharacterFull st={r.character} height={880} />
        <div className="rr-plate">
          <small>{r.character.title}</small>
          <b>{r.name}</b>
        </div>
      </motion.div>

      <div className="rr-info">
        <div className="rr-cards">
          <Cards label="Mão" cards={r.hole} best={r.best} fx={r.winFx} />
          {r.board.length > 0 && <Cards label="Mesa" cards={r.board} best={r.best} fx={r.winFx} />}
        </div>

        <motion.div className="rr-hand" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 20 }}>
          <span className="rr-kicker">Mão vencedora</span>
          <div className="splash-title rr-hand-name">{r.handName}</div>
          {r.split.length > 0 && <div className="rr-split">Pote dividido com {r.split.join(', ')}</div>}
        </motion.div>

        <div className="rr-bottom">
          <div className="rr-pays">
            <span className="rr-kicker">{r.payers.length ? 'Quem pagou' : 'Sem pagamentos'}</span>
            {r.payers.map((p, i) => (
              <motion.div key={p.name} className="rr-pay" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.45 + i * 0.08 }}>
                <span className="rr-pay-face" style={{ background: `linear-gradient(160deg, ${p.character.bg}, ${p.character.bg2})` }}>
                  <CharacterPortrait st={p.character} size={40} />
                </span>
                <span className="rr-pay-name">{p.name}</span>
                <b>
                  <ChipSvg value={100} size={16} />
                  {fmt(p.amount)}
                </b>
              </motion.div>
            ))}
          </div>

          <motion.div className="rr-total" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 220, damping: 18 }}>
            <span className="rr-kicker">Ganhou</span>
            <div className="rr-won">+{fmt(r.won)}</div>
            <div className="rr-stack">
              <ChipSvg value={500} size={24} />
              {fmt(r.stack)} fichas
            </div>
            {r.pots.length > 1 && <div className="rr-pot-note">{r.pots.map((p) => `${p.label} ${fmt(p.amount)}`).join(' · ')}</div>}
          </motion.div>
        </div>
      </div>

      <button className="rr-confirm" onClick={close}>
        ({Math.max(0, secs)}) Continuar
      </button>
    </motion.div>
  );
}

/** Tela de fim de round (showdown), no estilo das telas de resultado de Mahjong Soul. */
export function RoundResultScreen() {
  const result = useTable((s) => s.result);
  return <AnimatePresence>{result && <RoundResultPanel key={result.id} r={result} />}</AnimatePresence>;
}
