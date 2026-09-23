import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TableView } from '../../shared/protocol';
import { findCharacter, type CharacterStyle, type FrameId } from '../../shared/styles';
import { useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { useTable, type MatchEnd, type Ranking } from '../store/table';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { PortraitFrame, findFrame } from '../render/PortraitFrame';
import { BondGain } from './BondBar';
import { ChipSvg } from '../render/Chip';
import { useUiTheme } from '../ui/themes';
import { fmt, matchLabel } from '../util/format';
import { sfx } from '../audio/sfx';

/** Uma linha do placar. */
export interface MatchRow {
  place: number;
  name: string;
  character: CharacterStyle;
  /** Moldura do retrato desta linha (a de cada jogador, veja src/render/PortraitFrame.tsx). */
  frame: FrameId;
  stack: number;
  /** Resultado em relação às fichas iniciais. */
  delta: number;
  isMe: boolean;
  isBot: boolean;
}

/** Quantas linhas cabem numa página do placar. */
const PER_PAGE = 4;

/** Inclinação das placas do placar (graus) — a mesma do CSS em .me-row / .me-row-in. */
const ROW_SKEW = -9;

const ORDINAL = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];
const place = (n: number) => ORDINAL[n - 1] ?? `${n}º`;

/**
 * Monta o placar: usa a classificação do Sit & Go quando existe, senão ordena pelas fichas.
 * `delta` é o resultado em relação às fichas iniciais.
 */
export function buildMatchRows(view: TableView, ranking: Ranking[] | null, startingStack: number): MatchRow[] {
  const myCharacter = findCharacter(useProfile.getState().character);
  const myFrame = useProfile.getState().frame;
  const row = (seat: number, placeNo: number, name?: string): MatchRow => {
    const s = view.seats[seat];
    const isMe = seat === view.mySeat;
    return {
      place: placeNo,
      name: name ?? s?.name ?? `Assento ${seat + 1}`,
      character: isMe ? myCharacter : (s?.cosmetics.character ?? findCharacter('')),
      frame: isMe ? myFrame : (s?.cosmetics.frame ?? 'ouro'),
      stack: s?.stack ?? 0,
      delta: (s?.stack ?? 0) - startingStack,
      isMe,
      isBot: !!s?.isBot,
    };
  };
  if (ranking?.length) return [...ranking].sort((a, b) => a.place - b.place).map((r) => row(r.seat, r.place, r.name));
  return view.seats
    .map((s, seat) => (s ? { seat, stack: s.stack } : null))
    .filter((x): x is { seat: number; stack: number } => !!x)
    .sort((a, b) => b.stack - a.stack)
    .map((x, i) => row(x.seat, i + 1));
}

/**
 * Páginas do placar.
 *
 * Normalmente são blocos de quatro (1º–4º, 5º–8º…). Se você ficou fora dos quatro primeiros, a
 * primeira página mostra 1º, 2º, 3º e a sua linha no quarto lugar (com a sua posição real), para não
 * precisar paginar; as páginas seguintes continuam a partir do 3º.
 */
export function pagesOf(rows: MatchRow[]): MatchRow[][] {
  const chunk = (list: MatchRow[]) => Array.from({ length: Math.ceil(list.length / PER_PAGE) || 1 }, (_, i) => list.slice(i * PER_PAGE, i * PER_PAGE + PER_PAGE));
  const me = rows.find((r) => r.isMe);
  if (!me || me.place <= PER_PAGE) return chunk(rows);
  return [[...rows.slice(0, PER_PAGE - 1), me], ...chunk(rows.slice(PER_PAGE - 2))];
}

function Row({ r, i }: { r: MatchRow; i: number }) {
  const top = r.place === 1;
  return (
    <motion.div
      className={`me-row ${top ? 'first' : ''} ${r.isMe ? 'mine' : ''}`}
      // a inclinação vai junto na animação: o transform do framer substitui o do CSS
      initial={{ x: 90, skewX: ROW_SKEW, opacity: 0 }}
      animate={{ x: 0, skewX: ROW_SKEW, opacity: 1 }}
      transition={{ delay: 0.12 + i * 0.09, type: 'spring', stiffness: 220, damping: 22 }}
    >
      <div className="me-row-in">
        <span className="me-place">{place(r.place)}</span>
        <span className="me-portrait com-moldura" style={{ background: `linear-gradient(160deg, ${r.character.bg}, ${r.character.bg2})` }}>
          <CharacterPortrait st={r.character} size={72} />
          <PortraitFrame frame={findFrame(r.frame)} size={72} />
        </span>
        <span className="me-who">
          <span className="me-name">
            {r.name}
            {r.isBot && <span className="tag">BOT</span>}
            {r.isMe && <span className="me-badge">Você</span>}
          </span>
          <span className="me-stack">
            <ChipSvg value={100} size={20} />
            {fmt(r.stack)}
          </span>
        </span>
        <span className={`me-delta ${r.delta < 0 ? 'down' : 'up'}`}>
          {r.delta >= 0 ? '+' : '−'}
          {fmt(Math.abs(r.delta))}
        </span>
      </div>
    </motion.div>
  );
}

export function MatchEndPanel({ m, rows, info }: { m: MatchEnd; rows: MatchRow[]; info?: string }) {
  const setMatch = useTable((s) => s.setMatch);
  const setGameOver = useTable((s) => s.setGameOver);
  const leaveRoom = useSession((s) => s.leaveRoom);
  const send = useSession((s) => s.send);
  const room = useSession((s) => s.room);
  const playerId = useSession((s) => s.playerId);
  const theme = useUiTheme();
  const me = rows.find((r) => r.isMe);
  const title = m.kind === 'over' ? 'Fim da Partida' : 'Você saiu da mesa';
  const subtitle = me ? `Você terminou em ${place(me.place)}` : 'Placar final';
  const pages = pagesOf(rows);
  const meIndex = Math.max(
    0,
    pages.findIndex((p) => p.some((r) => r.isMe)),
  );
  const [page, setPage] = useState(meIndex);
  const champion = rows.find((r) => r.place === 1)?.character ?? findCharacter('');
  const isHost = !!room && room.hostId === playerId;
  const shown = pages[Math.min(page, pages.length - 1)] ?? [];

  useEffect(() => {
    sfx.pop();
  }, []);

  const close = () => {
    sfx.click();
    setMatch(null);
    setGameOver(null);
    if (m.kind === 'leave') leaveRoom();
  };
  const again = () => {
    sfx.click();
    setMatch(null);
    setGameOver(null);
    send({ type: 'startGame' });
  };

  return (
    <motion.div className="match-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <div className="rr-back" />
      <motion.div
        className="rr-band"
        style={{ background: theme.cutinBand(champion) }}
        initial={{ rotate: -6, scaleX: 0.25, opacity: 0 }}
        animate={{ rotate: -6, scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
      <motion.div className="me-title" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}>
        <div className="splash-title me-title-name">{title}</div>
        <span className="rr-kicker">{subtitle}</span>
      </motion.div>
      <motion.div
        className="rr-char me-char"
        initial={{ x: -140, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.06, type: 'spring', stiffness: 150, damping: 20 }}
      >
        <CharacterFull st={champion} height={820} />
      </motion.div>

      <div className="me-list">
        {shown.map((r, i) => (
          <Row key={`${r.place}-${r.name}`} r={r} i={i} />
        ))}
        {me && <BondGain char={me.character} />}
        {info && <div className="me-foot">{info}</div>}
        {pages.length > 1 && (
          <div className="me-pager">
            <button className="me-pager-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              ‹
            </button>
            {pages.map((_, i) => (
              <button key={i} className={`me-dot ${i === page ? 'on' : ''}`} onClick={() => setPage(i)} aria-label={`Página ${i + 1}`} />
            ))}
            <button className="me-pager-btn" onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))} disabled={page === pages.length - 1}>
              ›
            </button>
          </div>
        )}
      </div>

      <div className="me-actions">
        {m.kind === 'over' && isHost && (
          <button className="btn btn-gold" onClick={again}>
            Jogar de novo
          </button>
        )}
        {m.kind === 'over' && (
          <button className="btn btn-ghost" onClick={() => { sfx.click(); setMatch(null); setGameOver(null); leaveRoom(); }}>
            Sair da mesa
          </button>
        )}
        <button className="rr-confirm me-confirm" onClick={close}>
          Confirmar
        </button>
      </div>
    </motion.div>
  );
}

/** Tela de fim de partida com o placar (fim do jogo ou saída da mesa). */
export function MatchEndScreen() {
  const match = useTable((s) => s.match);
  const view = useTable((s) => s.display);
  const ranking = useTable((s) => s.gameOver);
  const room = useSession((s) => s.room);
  const startingStack = room?.settings.startingStack ?? 0;
  const rows = useMemo(() => (view ? buildMatchRows(view, ranking, startingStack) : []), [view, ranking, startingStack]);
  const account = useSession((s) => s.account);
  const info = [
    room?.settings.name,
    room ? matchLabel(room.settings) : null,
    view ? `${view.handNo} mãos` : null,
    // servidor hospedado: o saldo já com o que entrou (ou saiu) nesta partida
    account ? `Saldo ${fmt(account.money)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return <AnimatePresence>{match && rows.length > 0 && <MatchEndPanel key={match.id} m={match} rows={rows} info={info} />}</AnimatePresence>;
}
