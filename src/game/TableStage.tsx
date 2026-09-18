import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { sameCard, type Card } from '../../shared/cards';
import { evaluateHand } from '../../shared/evaluator';
import type { TableView } from '../../shared/protocol';
import { useEquipped, useProfile } from '../store/profile';
import { useTable } from '../store/table';
import { TableFelt } from '../render/TableFelt';
import { CardView } from '../render/CardArt';
import { findWinFx, type WinFx } from '../render/cardfx';
import { ChipStack } from '../render/Chip';
import { FlyersLayer } from './Flyers';
import { Nameplate } from './Nameplate';
import { CenterConsole } from './CenterConsole';
import { MyCountdown } from './Countdown';
import { director } from './director';
import { CARD_H, CARD_W, boardSlot, holeCardPos, planeStyle, project, seatLayout, type SeatGeo } from './layout';

const PLANE = planeStyle();
const FLOOR = planeStyle(3200, 2200, 1600, 1100);
const MY_CARD_W = 136;

function isHl(hl: Card[], c: Card | null): boolean {
  return !!c && hl.some((h) => sameCard(h, c));
}

/* ----------------------------------------------------------- dentro do plano (deitado) */

function Board({ board, highlight, fx }: { board: Card[]; highlight: Card[]; fx: WinFx | null }) {
  const prevLen = useRef(board.length);
  const start = prevLen.current;
  useEffect(() => {
    prevLen.current = board.length;
  }, [board.length]);
  return (
    <>
      {board.map((c, i) => {
        const p = boardSlot(i);
        const isNew = i >= start;
        const from = boardSlot(Math.max(start, 0));
        return (
          <motion.div
            key={i}
            className="board-card"
            style={{ left: p.x - CARD_W / 2, top: p.y - CARD_H / 2 }}
            initial={isNew ? { x: from.x - p.x, opacity: 0.9 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.32, delay: isNew ? (i - start) * 0.12 : 0 }}
          >
            <CardView
              card={c}
              width={CARD_W}
              flipIn={isNew}
              flipDelay={isNew ? 0.12 + (i - start) * 0.14 : 0}
              highlight={highlight.length > 0 && isHl(highlight, c)}
              dim={highlight.length > 0 && !isHl(highlight, c)}
              winFx={fx && isHl(highlight, c) ? fx : null}
            />
          </motion.div>
        );
      })}
    </>
  );
}

function OpponentCards({ view, geo, fxOf }: { view: TableView; geo: SeatGeo[]; fxOf: (seat: number) => WinFx | null }) {
  return (
    <>
      {view.seats.map((s, seat) => {
        const g = geo[seat];
        if (!s || !g || seat === view.mySeat) return null;
        const fx = fxOf(seat);
        return s.cards.map((c, i) => {
          const hp = holeCardPos(g, i);
          const w = g.cardW;
          return (
            <div
              key={`${seat}-${i}`}
              className="hole-card"
              style={{ left: hp.p.x - w / 2, top: hp.p.y - (w * 1.4) / 2, transform: `rotate(${hp.rot}deg)` }}
            >
              <CardView
                card={c}
                faceUp={!!c}
                width={w}
                back={s.cosmetics.back}
                highlight={view.highlight.length > 0 && isHl(view.highlight, c)}
                winFx={fx && isHl(view.highlight, c) ? fx : null}
              />
            </div>
          );
        });
      })}
    </>
  );
}

function DealerButton({ view, geo }: { view: TableView; geo: SeatGeo[] }) {
  if (view.dealerSeat === null || !geo[view.dealerSeat]) return null;
  const p = geo[view.dealerSeat].dealer;
  return (
    <motion.div className="dealer-btn" initial={false} animate={{ left: p.x - 20, top: p.y - 20 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }}>
      D
    </motion.div>
  );
}

/* ----------------------------------------------------------- no palco (em pé) */

function BetChips({ view, geo }: { view: TableView; geo: SeatGeo[] }) {
  return (
    <>
      {view.seats.map((s, seat) => {
        const g = geo[seat];
        if (!s || !g || s.bet <= 0) return null;
        const p = project(g.bet);
        return (
          <div key={seat} className="seat-bet" style={{ left: p.x, top: p.y, transform: `scale(${p.s})` }}>
            <div className="seat-bet-inner">
              <ChipStack amount={s.bet} size={32} maxCols={3} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Suas cartas, grandes e em pé na parte de baixo da tela (como a mão no Mahjong Soul). */
function MyHand({ view, fx }: { view: TableView; fx: WinFx | null }) {
  const me = view.mySeat !== null ? view.seats[view.mySeat] : null;
  const cards = me && !me.folded ? me.cards : [];
  const hl = view.highlight;
  return (
    <div className="my-hand">
      <AnimatePresence>
        {me &&
          cards.map((c, i) => (
            <motion.div
              key={i}
              className="my-card"
              style={{ left: (i === 0 ? -1 : 1) * 80 - MY_CARD_W / 2 }}
              initial={{ y: -70, scale: 0.55, opacity: 0, rotate: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1, rotate: i === 0 ? -6 : 6 }}
              exit={{ y: 230, opacity: 0, rotate: i === 0 ? -28 : 28, transition: { duration: 0.35 } }}
              whileHover={{ y: -24 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            >
              <CardView
                card={c}
                faceUp={!!c}
                width={MY_CARD_W}
                back={me.cosmetics.back}
                highlight={hl.length > 0 && isHl(hl, c)}
                dim={hl.length > 0 && !isHl(hl, c)}
                winFx={fx && isHl(hl, c) ? fx : null}
              />
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

function HandHint({ view }: { view: TableView }) {
  const enabled = useProfile((s) => s.settings.handHint);
  if (!enabled || view.mySeat === null) return null;
  const me = view.seats[view.mySeat];
  const cards = me?.cards.filter(Boolean) as Card[] | undefined;
  if (!me || !cards || cards.length < 2 || me.folded) return null;
  return (
    <div className="hand-hint" style={{ left: 560, top: 836 }}>
      {evaluateHand([...cards, ...view.board]).name}
    </div>
  );
}

export function TableStage() {
  const view = useTable((s) => s.display);
  const winners = useTable((s) => s.winners);
  const tableStyle = useEquipped('table');
  const myFx = useProfile((s) => s.winFx);
  const maxPlayers = view?.maxPlayers ?? 6;
  const mySeat = view?.mySeat ?? null;
  const geo = useMemo(() => seatLayout(maxPlayers, mySeat ?? 0, mySeat !== null), [maxPlayers, mySeat]);

  useEffect(() => {
    director.mounted = true;
    return () => {
      director.mounted = false;
    };
  }, []);

  if (!view) return null;
  /** Efeito das cartas de um vencedor (cada jogador tem o seu); null para quem não ganhou. */
  const fxOf = (seat: number | null): WinFx | null => {
    if (seat === null || !winners.includes(seat)) return null;
    return findWinFx(seat === view.mySeat ? myFx : view.seats[seat]?.cosmetics.winFx);
  };
  // as cartas da mesa são de todos: usam o efeito de quem ganhou (o seu, se você ganhou)
  const boardFx = fxOf(winners.includes(view.mySeat ?? -1) ? view.mySeat : (winners[0] ?? null));
  const badgeOf = (seat: number): 'D' | 'SB' | 'BB' | null =>
    view.dealerSeat === seat ? 'D' : view.sbSeat === seat ? 'SB' : view.bbSeat === seat ? 'BB' : null;
  return (
    <div className="table-stage">
      <div className="floor-plane" style={FLOOR} />
      <div className="table-plane" style={PLANE}>
        <TableFelt st={tableStyle} />
        <CenterConsole view={view} geo={geo} />
        <Board board={view.board} highlight={view.highlight} fx={boardFx} />
        <OpponentCards view={view} geo={geo} fxOf={fxOf} />
        <DealerButton view={view} geo={geo} />
        <FlyersLayer space="plane" />
      </div>
      <BetChips view={view} geo={geo} />
      <FlyersLayer space="screen" />
      <HandHint view={view} />
      <MyHand view={view} fx={fxOf(view.mySeat)} />
      {view.seats.map((s, seat) =>
        s && geo[seat] ? (
          <Nameplate
            key={seat}
            seat={s}
            geo={geo[seat]}
            acting={view.toAct === seat}
            isMe={seat === view.mySeat}
            winner={winners.includes(seat)}
            badge={badgeOf(seat)}
          />
        ) : null,
      )}
      <MyCountdown />
    </div>
  );
}
