import { useEffect, useMemo, useState } from 'react';
import type { PlayerAction } from '../../shared/engine';
import { useSession } from '../store/session';
import { useTable } from '../store/table';
import { sfx } from '../audio/sfx';
import { director } from './director';
import { fmt } from '../util/format';

type Pre = 'none' | 'checkfold' | 'check' | 'callany';

export function ActionPanel() {
  const view = useTable((s) => s.display);
  const send = useSession((s) => s.send);
  const discards = useTable((s) => s.discards);
  const clearDiscards = useTable((s) => s.clearDiscards);
  const [raiseTo, setRaiseTo] = useState(0);
  const [pre, setPre] = useState<Pre>('none');
  const [sentKey, setSentKey] = useState('');
  /** Mão em que já pedi para pular (o botão sai até a próxima). */
  const [skipped, setSkipped] = useState(-1);
  // só numa partida contra bots (um humano na mesa) dá para pular a mão
  const solo = useSession((s) => !s.room || s.room.members.filter((m) => !m.isBot).length <= 1);

  const me = view && view.mySeat !== null ? view.seats[view.mySeat] : null;
  const legal = view?.legal ?? null;
  const turnKey = view ? `${view.handNo}:${view.street}:${view.currentBet}:${view.toAct}` : '';
  const myTurn = !!(view && legal && view.toAct === view.mySeat && sentKey !== turnKey);
  const potTotal = view ? view.pot + view.seats.reduce((s, x) => s + (x?.bet ?? 0), 0) : 0;

  useEffect(() => {
    if (legal) setRaiseTo(legal.minRaiseTo);
  }, [legal?.minRaiseTo, turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // pré-ações e cartas marcadas zeram a cada mão
  useEffect(() => {
    setPre('none');
    clearDiscards();
  }, [view?.handNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (a: PlayerAction) => {
    sfx.click();
    setSentKey(turnKey);
    setPre('none');
    send({ type: 'action', action: a });
  };

  // executa pré-ação quando chegar a vez
  useEffect(() => {
    if (!myTurn || !legal || pre === 'none') return;
    if (pre === 'checkfold') act(legal.canCheck ? { type: 'check' } : { type: 'fold' });
    else if (pre === 'check' && legal.canCheck) act({ type: 'check' });
    else if (pre === 'callany') act(legal.canCheck ? { type: 'check' } : { type: 'call' });
    else setPre('none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);

  // atalho da troca: Enter confirma
  useEffect(() => {
    if (!view || view.street !== 'draw' || view.toAct !== view.mySeat) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key !== 'Enter') return;
      sfx.click();
      setSentKey(turnKey);
      send({ type: 'draw', discards });
      clearDiscards();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.street, view?.toAct, view?.mySeat, turnKey, discards]);

  // atalhos de teclado
  useEffect(() => {
    if (!myTurn || !legal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'f' && legal.canFold) act({ type: 'fold' });
      else if (k === 'c') act(legal.canCheck ? { type: 'check' } : { type: 'call' });
      else if (k === 'r' && legal.canRaise) act(raiseTo >= legal.maxRaiseTo ? { type: 'allin' } : { type: 'raise', amount: raiseTo });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, legal, raiseTo]);

  const presets = useMemo(() => {
    if (!legal || !me || !view) return [];
    const toCall = legal.callAmount;
    const base = me.bet + toCall;
    const potAfter = potTotal + toCall;
    const clamp = (v: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
    return [
      { label: 'Mín', v: legal.minRaiseTo },
      { label: '½ Pote', v: clamp(base + potAfter * 0.5) },
      { label: '¾ Pote', v: clamp(base + potAfter * 0.75) },
      { label: 'Pote', v: clamp(base + potAfter) },
      { label: 'All-in', v: legal.maxRaiseTo },
    ];
  }, [legal, me, view, potTotal]);

  if (!view || !me || view.status !== 'playing') return null;
  const inHand = me.inHand && !me.folded && !me.allIn;
  const running = !!view.street && view.street !== 'showdown';

  // poker de 5 cartas: minha vez de trocar cartas (as marcadas são escolhidas clicando na mão)
  if (view.street === 'draw' && view.toAct === view.mySeat && sentKey !== turnKey) {
    const drawNow = () => {
      sfx.click();
      setSentKey(turnKey);
      send({ type: 'draw', discards });
      clearDiscards();
    };
    return (
      <div className="action-panel draw-panel">
        <div className="draw-hint">
          {discards.length
            ? `Trocar ${discards.length} ${discards.length === 1 ? 'carta' : 'cartas'} — clique nas cartas para escolher`
            : 'Clique nas suas cartas para trocá-las (ou fique com a mão)'}
        </div>
        <div className="act-row">
          {discards.length > 0 && (
            <button className="act-btn fold" onClick={() => { sfx.click(); clearDiscards(); }}>
              Limpar
            </button>
          )}
          <button className={`act-btn ${discards.length ? 'raise' : 'check'}`} onClick={drawNow}>
            {discards.length ? `Trocar ${discards.length}` : 'Manter as cinco'}
            <small>↵</small>
          </button>
        </div>
      </div>
    );
  }
  // desistiu (ou está de fora) numa mesa de bots: pode correr a mão até o fim
  const canSkip = solo && running && (me.folded || !me.inHand) && skipped !== view.handNo;

  if (!myTurn) {
    if (canSkip) {
      return (
        <div className="pre-actions">
          <button
            className="pre-btn skip-btn"
            title="Corre o resto da mão e vai para a próxima (o vencedor é anunciado)"
            onClick={() => {
              sfx.click();
              setSkipped(view.handNo);
              director.skip();
              send({ type: 'skipHand' });
            }}
          >
            ⏭ Pular mão
          </button>
        </div>
      );
    }
    if (!inHand || !view.street || view.street === 'showdown') return null;
    const opt = (p: Pre, label: string) => (
      <button className={`pre-btn ${pre === p ? 'on' : ''}`} onClick={() => setPre(pre === p ? 'none' : p)}>
        <span className="box" />
        {label}
      </button>
    );
    return (
      <div className="pre-actions">
        {opt('checkfold', 'Passar/Desistir')}
        {opt('check', 'Passar')}
        {opt('callany', 'Pagar qualquer')}
      </div>
    );
  }

  const l = legal!;
  const callIsAllin = l.callAmount >= me.stack;
  const raiseIsAllin = raiseTo >= l.maxRaiseTo;
  const step = Math.max(1, view.smallBlind);
  return (
    <div className="action-panel">
      {l.canRaise && (
        <div className="raise-box">
          <div className="raise-presets">
            {presets.map((p) => (
              <button key={p.label} className={`chip-btn ${raiseTo === p.v ? 'on' : ''}`} onClick={() => setRaiseTo(p.v)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="raise-row">
            <button className="round-btn" onClick={() => setRaiseTo((v) => Math.max(l.minRaiseTo, v - step * 2))}>
              −
            </button>
            <input
              className="raise-slider"
              type="range"
              min={l.minRaiseTo}
              max={l.maxRaiseTo}
              step={step}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
            />
            <button className="round-btn" onClick={() => setRaiseTo((v) => Math.min(l.maxRaiseTo, v + step * 2))}>
              +
            </button>
            <input
              className="raise-input"
              type="number"
              value={raiseTo}
              min={l.minRaiseTo}
              max={l.maxRaiseTo}
              onChange={(e) => setRaiseTo(Math.max(0, Number(e.target.value) || 0))}
              onBlur={() => setRaiseTo((v) => Math.max(l.minRaiseTo, Math.min(l.maxRaiseTo, v)))}
            />
          </div>
        </div>
      )}
      <div className="act-row">
        {l.canFold && (
          <button className="act-btn fold" onClick={() => act({ type: 'fold' })}>
            Desistir<small>F</small>
          </button>
        )}
        {l.canCheck ? (
          <button className="act-btn check" onClick={() => act({ type: 'check' })}>
            Passar<small>C</small>
          </button>
        ) : (
          <button className="act-btn call" onClick={() => act({ type: 'call' })}>
            {callIsAllin ? 'All-in' : 'Pagar'} {fmt(l.callAmount)}
            <small>C</small>
          </button>
        )}
        {l.canRaise && (
          <button
            className={`act-btn raise ${raiseIsAllin ? 'allin' : ''}`}
            onClick={() => act(raiseIsAllin ? { type: 'allin' } : { type: 'raise', amount: Math.max(l.minRaiseTo, Math.min(l.maxRaiseTo, raiseTo)) })}
          >
            {raiseIsAllin ? 'All-in' : l.isBet ? 'Apostar' : 'Aumentar'} {fmt(Math.min(raiseTo, l.maxRaiseTo))}
            <small>R</small>
          </button>
        )}
      </div>
    </div>
  );
}
