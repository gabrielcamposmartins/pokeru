import type { Card } from '../../shared/cards';
import type { TableEvent, TableView } from '../../shared/protocol';
import { findCharacter, type CardBackStyle } from '../../shared/styles';
import { evaluateHand, HandCategory } from '../../shared/evaluator';
import { setTimeScale, wait } from '../anim/tween';
import { sfx } from '../audio/sfx';
import { handSlot, resetVoices, sayAction, sayCommon, sayWith, voiceUrl, type ComumSlot } from '../audio/voice';
import { findStyle, useProfile } from '../store/profile';
import { nextId, useTable, type CalloutKind, type Flyer, type Splash } from '../store/table';
import { ACTION_LABEL, fmt } from '../util/format';
import { MUCK_POS, POT_POS, boardSlot, holeCardPos, project, seatLayout, type Pt, type SeatGeo } from './layout';

/** Um aumento é "bet" (abre a rua), "raise" ou "reraise" (aumento sobre aumento). */
type RaiseKind = 'bet' | 'raise' | 'reraise';

interface Item {
  ev: TableEvent;
  view: TableView;
  at: number;
  raise?: RaiseKind;
}

type StagePt = { x: number; y: number; s?: number };

const BIG_HANDS = new Set([HandCategory.Straight, HandCategory.Flush, HandCategory.FullHouse, HandCategory.Quads, HandCategory.StraightFlush]);

const CALLOUT: Record<string, [string, CalloutKind]> = {
  fold: ['Desisto', 'fold'],
  check: ['Passo', 'check'],
  call: ['Pago!', 'call'],
  raise: ['Aumento!', 'raise'],
  allin: ['All-in!', 'allin'],
};

/**
 * Diretor de animações: recebe eventos do servidor (cada um com o estado resultante)
 * e os encena em sequência — cartas voando, fichas — antes de aplicar o estado.
 */
class Director {
  private queue: Item[] = [];
  private running = false;
  private epoch = 0;
  /** A mesa está montada (há camadas de voo). */
  mounted = false;
  private geoKey = '';
  private geoCache: SeatGeo[] = [];
  // contagem de apostas da rua, para saber se um aumento é bet, raise ou reraise
  private street = 'preflop';
  private raises = 0;
  private lastBet = 0;

  reset(): void {
    this.epoch++;
    this.queue = [];
    this.running = false;
    this.street = 'preflop';
    this.raises = 0;
    this.lastBet = 0;
    resetVoices();
    useTable.getState().reset();
  }

  sync(view: TableView): void {
    this.epoch++;
    this.queue = [];
    this.running = false;
    this.street = view.street ?? 'preflop';
    this.raises = 0;
    this.lastBet = view.currentBet;
    const t = useTable.getState();
    t.removeFlyers(t.flyers.map((f) => f.id));
    t.setDisplay(view, Date.now());
    if (view.status === 'playing') t.setGameOver(null);
  }

  enqueue(ev: TableEvent, view: TableView): void {
    this.queue.push({ ev, view, at: Date.now(), raise: this.tally(ev, view) });
    if (!this.running) void this.run();
  }

  /** Acompanha as apostas da rua (na ordem de chegada) e classifica os aumentos. */
  private tally(ev: TableEvent, view: TableView): RaiseKind | undefined {
    let kind: RaiseKind | undefined;
    if (ev.t === 'handStart') {
      this.street = 'preflop';
      this.raises = 0;
    } else if (ev.t === 'street') {
      this.street = ev.street;
      this.raises = 0;
    } else if (ev.t === 'action' && (ev.action === 'raise' || (ev.action === 'allin' && ev.betTo > this.lastBet))) {
      // no pré-flop o big blind já é a aposta: o primeiro aumento é raise
      const level = this.raises + (this.street === 'preflop' ? 1 : 0);
      kind = level === 0 ? 'bet' : level === 1 ? 'raise' : 'reraise';
      this.raises++;
    }
    this.lastBet = view.currentBet;
    return kind;
  }

  /** Personagem (id) de um assento, para as vozes. */
  private charId(view: TableView, seat: number | null): string | null {
    if (seat === null || !view.seats[seat]) return null;
    return seat === view.mySeat ? findCharacter(useProfile.getState().character).id : view.seats[seat]!.cosmetics.character.id;
  }

  private async run(): Promise<void> {
    this.running = true;
    const epoch = this.epoch;
    while (this.queue.length && epoch === this.epoch) {
      const item = this.queue.shift()!;
      this.updateSpeed();
      try {
        if (this.mounted && useTable.getState().display && !document.hidden) await this.play(item, epoch);
        else this.sideEffects(item);
      } catch (err) {
        console.error('[director]', err);
      }
      if (epoch !== this.epoch) return;
      useTable.getState().setDisplay(item.view, item.at);
    }
    if (epoch === this.epoch) this.running = false;
  }

  private updateSpeed(): void {
    const base = useProfile.getState().settings.animSpeed;
    const backlog = this.queue.length;
    const boost = backlog > 2 ? Math.min(4, 1 + (backlog - 2) * 0.5) : 1;
    setTimeScale(base * boost);
  }

  private geo(view: TableView): SeatGeo[] {
    const key = `${view.maxPlayers}:${view.mySeat}`;
    if (key !== this.geoKey) {
      this.geoKey = key;
      this.geoCache = seatLayout(view.maxPlayers, view.mySeat ?? 0, view.mySeat !== null);
    }
    return this.geoCache;
  }

  private fly(f: Omit<Flyer, 'id' | 'onDone'>): Promise<number> {
    const id = nextId();
    if (document.hidden) return Promise.resolve(id);
    return new Promise((resolve) => {
      useTable.getState().addFlyer({ ...f, id, onDone: () => resolve(id) });
    });
  }

  /** Fichas voando no palco (em pé), entre dois pontos já projetados. */
  private flyChips(from: StagePt, to: StagePt, amount: number, dur: number, fade = false, arc?: number): Promise<number> {
    return this.fly({
      kind: 'chips',
      space: 'screen',
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      scaleFrom: from.s ?? 1,
      scaleTo: to.s ?? 1,
      amount,
      dur,
      fade,
      arc,
    });
  }

  private clearFlyers(ids: number[]): void {
    useTable.getState().removeFlyers(ids);
  }

  private seatName(view: TableView, seat: number): string {
    return view.seats[seat]?.name ?? `Assento ${seat + 1}`;
  }

  /** Personagem de um assento para o cut-in. */
  private charOf(view: TableView, seat: number): Partial<Splash> {
    const s = view.seats[seat];
    if (!s) return {};
    return { character: seat === view.mySeat ? findCharacter(useProfile.getState().character) : s.cosmetics.character };
  }

  private backOf(view: TableView, seat: number | null): CardBackStyle {
    const s = seat !== null ? view.seats[seat] : null;
    if (s) return s.cosmetics.back;
    const p = useProfile.getState();
    return findStyle(p, 'back', p.equipped.back);
  }

  /** Efeitos que não dependem de animação (log, placar final) quando a mesa não está visível. */
  private sideEffects(item: Item): void {
    const { ev, view } = item;
    const t = useTable.getState();
    if (ev.t === 'gameOver') t.setGameOver(ev.ranking);
    if (ev.t === 'handStart') {
      t.setWinners([]);
      t.addLog(`Mão #${ev.handNo}`, 'hand');
    }
    if (ev.t === 'action') t.addLog(this.actionText(view, ev.seat, ev.action, ev.amount, view.seats[ev.seat]?.bet ?? 0));
  }

  private actionText(view: TableView, seat: number, action: string, amount: number, betTo: number): string {
    const name = this.seatName(view, seat);
    if (action === 'raise') return `${name} aumentou para ${fmt(betTo)}`;
    if (action === 'call') return `${name} pagou ${fmt(amount)}`;
    if (action === 'allin') return `${name} foi all-in (${fmt(betTo)})`;
    return `${name} ${ACTION_LABEL[action]?.toLowerCase() ?? action}`;
  }

  private async play(item: Item, epoch: number): Promise<void> {
    const { ev, view: next } = item;
    const store = useTable.getState();
    const cur = store.display!;
    const geo = this.geo(next);
    const alive = () => epoch === this.epoch;

    switch (ev.t) {
      case 'handStart': {
        store.setWinners([]);
        store.setSplash(null);
        store.addLog(`Mão #${ev.handNo}`, 'hand');
        // recolhe as cartas da mão anterior em direção ao novo dealer
        const target = geo[ev.dealerSeat]?.deck ?? MUCK_POS;
        const flights: Promise<number>[] = [];
        cur.seats.forEach((s, seat) => {
          if (!s || !s.cards.length || !geo[seat] || seat === next.mySeat) return;
          s.cards.forEach((c, i) => {
            const hp = holeCardPos(geo[seat], i);
            flights.push(
              this.fly({ kind: 'card', from: hp.p, to: target, dur: 420, rotFrom: hp.rot, rotTo: hp.rot + 90, card: c, faceUp: !!c, back: s.cosmetics.back, width: geo[seat].cardW, fade: true }),
            );
          });
        });
        cur.board.forEach((c, i) => {
          flights.push(this.fly({ kind: 'card', from: boardSlot(i), to: target, dur: 420, rotFrom: 0, rotTo: 90, card: c, faceUp: true, back: this.backOf(next, ev.dealerSeat), width: 88, fade: true }));
        });
        store.patchDisplay({
          board: [],
          highlight: [],
          seats: cur.seats.map((s) => (s ? { ...s, cards: [], handName: undefined } : s)),
        });
        if (flights.length) this.clearFlyers(await Promise.all(flights));
        return;
      }

      case 'blinds':
        await Promise.all(ev.posts.map((p) => this.betMotion(next, geo, p.seat, p.amount, 360, alive)));
        return;

      case 'deal':
        await this.dealMotion(next, geo, ev.order, alive);
        return;

      case 'action': {
        store.addLog(this.actionText(next, ev.seat, ev.action, ev.amount, ev.betTo));
        const co = CALLOUT[ev.action];
        if (co) store.addCallout(ev.seat, co[0], co[1]);
        // voz: a chamada comum (チェック, ベット, コール, レイズ/リレイズ, フォールド); no all-in, a fala própria
        const slot: ComumSlot = ev.action === 'raise' ? (item.raise ?? 'raise') : ev.action;
        const who = this.charId(next, ev.seat);
        sayAction(`${ev.seat}:${who}`, who, slot);
        if (ev.action === 'fold') await this.foldMotion(cur, next, geo, ev.seat);
        else if (ev.action === 'check') this.knockMotion(next, ev.seat);
        else if (ev.action === 'allin') await this.allinMotion(next, geo, ev.seat, ev.amount, alive);
        else await this.betMotion(next, geo, ev.seat, ev.amount, 420, alive);
        return;
      }

      case 'refund': {
        const g = geo[ev.seat];
        if (!g) return;
        const s = cur.seats[ev.seat];
        store.patchSeat(ev.seat, { bet: Math.max(0, (s?.bet ?? 0) - ev.amount) });
        this.clearFlyers([await this.flyChips(project(g.bet), g.plate, ev.amount, 420, true)]);
        return;
      }

      case 'collect': {
        const pot = project(POT_POS);
        const flights = ev.bets.filter((b) => geo[b.seat]).map((b) => this.flyChips(project(geo[b.seat].bet), pot, b.amount, 480, true));
        store.patchDisplay({ seats: cur.seats.map((s) => (s ? { ...s, bet: 0 } : s)), pot: cur.pot });
        sfx.chips(5);
        const ids = await Promise.all(flights);
        store.patchDisplay({ pot: next.pot });
        this.clearFlyers(ids);
        return;
      }

      case 'street': {
        const names: Record<string, string> = { flop: 'Flop', turn: 'Turn', river: 'River' };
        store.addLog(`— ${names[ev.street] ?? ev.street}: ${ev.cards.map(cardText).join(' ')}`, 'street');
        sfx.deal();
        store.patchDisplay({ board: next.board });
        setTimeout(() => sfx.flip(), 180);
        if (ev.cards.length > 1) setTimeout(() => sfx.flip(), 420);
        await wait(ev.cards.length > 1 ? 480 : 260);
        return;
      }

      case 'showdown': {
        // quem abre as cartas primeiro diz a chamada comum (オープン！)
        if (ev.reveals[0]) sayCommon(this.charId(next, ev.reveals[0].seat), 'show', { important: true });
        for (const r of ev.reveals) {
          if (!alive()) return;
          store.addLog(`${this.seatName(next, r.seat)} mostra ${r.cards.map(cardText).join(' ')} — ${r.hand}`);
          store.patchSeat(r.seat, { cards: r.cards, handName: r.hand });
          if (r.seat === next.mySeat || !geo[r.seat]) continue;
          sfx.flip();
          await wait(300);
        }
        return;
      }

      case 'win': {
        const me = next.mySeat;
        const winnerSeats = [...new Set(ev.pots.flatMap((p) => p.winners.map((w) => w.seat)))];
        store.setWinners(winnerSeats);
        const main = ev.pots[0]?.winners[0];
        for (const pot of ev.pots) {
          for (const w of pot.winners) {
            store.addLog(`${this.seatName(next, w.seat)} ganha ${fmt(w.amount)}${w.hand ? ` com ${w.hand}` : ''}`, 'win');
          }
        }
        const iWon = me !== null && winnerSeats.includes(me);
        if (main) {
          const name = this.seatName(next, main.seat);
          const total = ev.pots.reduce((s, p) => s + p.amount, 0);
          let title = iWon ? 'Vitória!' : `${name} vence`;
          let kind: 'win' | 'lose' | 'info' | 'big' = iWon ? 'win' : 'info';
          let cat: HandCategory | null = null;
          if (!ev.uncontested && main.hand) {
            const cards = next.seats[main.seat]?.cards.filter(Boolean) as Card[] | undefined;
            cat = cards?.length ? evaluateHand([...cards, ...next.board]).category : null;
            if (cat !== null && BIG_HANDS.has(cat)) {
              title = main.hand.split(',')[0].replace(/ até.*| de .*/, '');
              kind = 'big';
            }
          }
          store.setSplash({
            id: nextId(),
            title,
            subtitle: ev.uncontested ? `${name} leva ${fmt(total)}` : `${name} • ${main.hand ?? ''} • +${fmt(total)}`,
            kind,
            ...(kind === 'big' ? this.charOf(next, main.seat) : {}),
          });
          const iLost = !iWon && me !== null && !!next.seats[me]?.inHand && !ev.uncontested;
          if (iWon) sfx.win();
          else if (iLost) sfx.lose();
          // vozes: o vencedor anuncia a mão (no showdown, fala comum) e comemora com a fala própria
          const winner = this.charId(next, main.seat);
          sayWith(
            { important: true },
            winner && cat !== null ? voiceUrl(winner, 'comum', handSlot(cat, !!main.hand?.startsWith('Royal'))) : undefined,
            winner ? voiceUrl(winner, 'fala', kind === 'big' ? 'big_win' : 'win') : undefined,
          );
        }
        // as fichas do pote voam para cada vencedor
        store.patchDisplay({ pot: 0, seats: cur.seats.map((s) => (s ? { ...s, bet: 0 } : s)) });
        const potStage = project(POT_POS);
        const flights: Promise<number>[] = [];
        for (const pot of ev.pots) {
          for (const w of pot.winners) {
            const g = geo[w.seat];
            if (g) flights.push(this.flyChips(potStage, g.plate, w.amount, 760, true, 30));
          }
        }
        sfx.chips(8);
        this.clearFlyers(await Promise.all(flights));
        await wait(500);
        return;
      }

      case 'turn':
        if (ev.seat === next.mySeat) sfx.turn();
        return;

      case 'bust':
        store.addLog(`${this.seatName(next, ev.seat)} foi eliminado (${ev.place}º)`);
        return;

      case 'rebuy':
        store.addLog(`${this.seatName(next, ev.seat)} recompra ${fmt(ev.amount)}`);
        return;

      case 'blindsUp':
        store.setSplash({ id: nextId(), title: 'Blinds sobem!', subtitle: `${fmt(ev.smallBlind)} / ${fmt(ev.bigBlind)}`, kind: 'info' });
        await wait(900);
        return;

      case 'gameOver':
        store.setGameOver(ev.ranking);
        return;

      default:
        return;
    }
  }

  // ---------------------------------------------------------------- coreografias

  /** As fichas saem da placa do jogador e pousam na frente dele. */
  private async betMotion(next: TableView, geo: SeatGeo[], seat: number, amount: number, ms: number, alive: () => boolean) {
    const g = geo[seat];
    const s = next.seats[seat];
    const store = useTable.getState();
    const apply = () => s && store.patchSeat(seat, { bet: s.bet, stack: s.stack, lastAction: s.lastAction, allIn: s.allIn });
    if (!g || amount <= 0) {
      apply();
      return;
    }
    const id = await this.flyChips(g.plate, project(g.bet), amount, ms);
    if (!alive()) return;
    apply();
    this.clearFlyers([id]);
    sfx.chips(3);
  }

  private async allinMotion(next: TableView, geo: SeatGeo[], seat: number, amount: number, alive: () => boolean) {
    const g = geo[seat];
    const s = next.seats[seat];
    const store = useTable.getState();
    const id = g && amount > 0 ? await this.flyChips(g.plate, project(g.bet), amount, 520) : null;
    if (!alive()) return;
    if (s) store.patchSeat(seat, { bet: s.bet, stack: s.stack, lastAction: s.lastAction, allIn: true });
    if (id !== null) this.clearFlyers([id]);
    sfx.allin();
    store.setSplash({ id: nextId(), title: 'All-in!', subtitle: `${s?.name ?? ''} • ${fmt(s?.bet ?? amount)}`, kind: 'big', ...this.charOf(next, seat) });
    await wait(620);
  }

  private knockMotion(next: TableView, seat: number) {
    const s = next.seats[seat];
    if (s) useTable.getState().patchSeat(seat, { lastAction: s.lastAction });
    sfx.knock();
  }

  /** As cartas do oponente deslizam para o descarte (as minhas saem pela animação da mão). */
  private async foldMotion(cur: TableView, next: TableView, geo: SeatGeo[], seat: number) {
    const g = geo[seat];
    const s = cur.seats[seat];
    const cards = s?.cards ?? [];
    useTable.getState().patchSeat(seat, { cards: [], folded: true, lastAction: 'fold' });
    if (!cards.length) return;
    sfx.fold();
    if (!g || g.isMe) return;
    const back = s?.cosmetics.back ?? this.backOf(next, seat);
    const land = { x: MUCK_POS.x + (Math.random() - 0.5) * 70, y: MUCK_POS.y + (Math.random() - 0.5) * 20 };
    const flights = cards.map((_, i) => {
      const hp = holeCardPos(g, i);
      return this.fly({ kind: 'card', from: hp.p, to: { x: land.x + i * 12, y: land.y }, dur: 400, rotFrom: hp.rot, rotTo: hp.rot + 160 + i * 30, card: null, faceUp: false, back, width: g.cardW, fade: true });
    });
    this.clearFlyers(await Promise.all(flights));
  }

  private async dealMotion(next: TableView, geo: SeatGeo[], order: number[], alive: () => boolean) {
    const dealer = next.dealerSeat;
    const store = useTable.getState();
    const dg = dealer !== null ? geo[dealer] : undefined;
    const origin: Pt = dg ? dg.deck : MUCK_POS;
    const counts: Record<number, number> = {};
    const flights: Promise<void>[] = [];
    for (const seat of order) {
      if (!alive()) return;
      const g = geo[seat];
      const sv = next.seats[seat];
      if (!g || !sv) continue;
      const i = (counts[seat] = (counts[seat] ?? -1) + 1);
      const hp = holeCardPos(g, i);
      sfx.deal();
      flights.push(
        this.fly({ kind: 'card', from: origin, to: hp.p, dur: 300, rotFrom: dg?.cardsRot ?? 0, rotTo: hp.rot, card: null, faceUp: false, back: sv.cosmetics.back, width: g.cardW }).then((id) => {
          const d = useTable.getState().display;
          const curCards = d?.seats[seat]?.cards ?? [];
          store.patchSeat(seat, { cards: Array.from({ length: i + 1 }, (_, k) => curCards[k] ?? null) });
          this.clearFlyers([id]);
        }),
      );
      await wait(165);
    }
    await Promise.all(flights);
    // minhas cartas: aplica o valor real (elas viram para cima)
    if (next.mySeat !== null && next.seats[next.mySeat]) {
      await wait(200);
      store.patchSeat(next.mySeat, { cards: next.seats[next.mySeat]!.cards });
      sfx.flip();
      await wait(300);
    }
  }
}

function cardText(c: Card): string {
  const r = c.r === 14 ? 'A' : c.r === 13 ? 'K' : c.r === 12 ? 'Q' : c.r === 11 ? 'J' : String(c.r);
  return r + { s: '♠', h: '♥', d: '♦', c: '♣' }[c.s];
}

export const director = new Director();
