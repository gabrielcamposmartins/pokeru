import { sameCard, type Card } from '../../shared/cards';
import type { TableEvent, TableView } from '../../shared/protocol';
import { findCharacter, type CardBackStyle } from '../../shared/styles';
import { evaluateHand, HandCategory } from '../../shared/evaluator';
import { isFirstStreet, type Street } from '../../shared/engine';
import type { PotResult } from '../../shared/engine';
import { setTimeScale, wait } from '../anim/tween';
import { sfx } from '../audio/sfx';
import { handSlot, resetVoices, sayAction, sayCommon, sayLine, sayWith, voiceUrl, type ComumSlot } from '../audio/voice';
import { findStyle, useProfile } from '../store/profile';
import { useBond, voiceUnlocked } from '../store/bond';
import type { BondEvent } from './bond';
import { findWinFx } from '../render/cardfx';
import { nextId, useTable, type CalloutKind, type Flyer, type RoundResult, type Splash } from '../store/table';
import { ACTION_LABEL, fmt } from '../util/format';
import { MUCK_POS, POT_POS, betSpot, boardSlot, holeCardPos, project, seatLayout, type Pt, type SeatGeo } from './layout';

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
 * Quanto cada jogador pagou ao vencedor `seat` numa mão: as fichas que ele colocou nos potes
 * levados por `seat`. Em pote dividido conta só a fração que esse vencedor levou, e quem também
 * ganhou o pote não entra (ninguém "paga" a si mesmo nem a um co-vencedor).
 */
export function paymentsTo(pots: PotResult[], seat: number): Map<number, number> {
  const paid = new Map<number, number>();
  for (const p of pots) {
    const share = p.winners.filter((w) => w.seat === seat).reduce((t, w) => t + w.amount, 0) / (p.amount || 1);
    if (!share) continue;
    const winners = p.winners.map((w) => w.seat);
    for (const c of p.paid ?? []) {
      if (winners.includes(c.seat)) continue;
      paid.set(c.seat, (paid.get(c.seat) ?? 0) + c.amount * share);
    }
  }
  return paid;
}

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
  /** Correndo a mão atual (o jogador pediu para pular): sem falas e com as animações rápidas. */
  private skipping = false;
  /** A mesa acabou para este jogador (ele saiu): ignora o que ainda chegar. */
  private frozen = false;
  /**
   * O servidor hospedado é o dono do vínculo: quando ele manda a conta, o cliente para de
   * pontuar sozinho (senão o progresso contaria duas vezes).
   */
  serverBond = false;
  /** Mãos que renderam vínculo nesta partida (para o bônus de fim de partida). */
  private bondHands = 0;
  /** O bônus de fim de partida já foi dado (não conta duas vezes ao sair depois do placar). */
  private bondClosed = false;

  reset(): void {
    this.epoch++;
    this.queue = [];
    this.running = false;
    this.street = 'preflop';
    this.raises = 0;
    this.lastBet = 0;
    this.skipping = false;
    this.frozen = false;
    this.bondHands = 0;
    this.bondClosed = false;
    resetVoices();
    useBond.getState().clearGain();
    useTable.getState().reset();
  }

  /** O jogador pediu para pular a mão: corre o resto sem falas e com as animações aceleradas. */
  skip(): void {
    this.skipping = true;
  }

  /**
   * Congela a mesa: a partida acabou para quem está saindo, então o que ainda chegar é ignorado
   * (sem animações, sons ou mudanças no placar já mostrado).
   */
  freeze(): void {
    // sair da mesa fecha a partida: as mãos jogadas rendem o bônus de partida completa
    this.closeBond(false);
    this.frozen = true;
    this.epoch++;
    this.queue = [];
    this.running = false;
    resetVoices();
  }

  sync(view: TableView): void {
    if (this.frozen) return;
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
    if (this.frozen) return;
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
      const level = this.raises + (isFirstStreet(this.street as Street) ? 1 : 0);
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

  // ---------------------------------------------------------------- vínculo com o personagem

  /** Meu personagem (o vínculo é só com ele: os outros jogadores têm o vínculo deles, na máquina deles). */
  private myChar(): string {
    return findCharacter(useProfile.getState().character).id;
  }

  private awardBond(ev: BondEvent): void {
    useBond.getState().award(this.myChar(), ev);
  }

  /**
   * Vínculo: cada mão jogada com o personagem rende pontos (ganhar vale mais, perder também conta)
   * e o fim da partida dá o bônus. Roda uma vez por evento, com a mesa visível ou não.
   */
  private bond(item: Item): void {
    if (this.serverBond) return;
    const { ev, view } = item;
    const me = view.mySeat;
    if (me === null || !view.seats[me]) return;
    if (ev.t === 'win') {
      const s = view.seats[me]!;
      const iWon = ev.pots.some((p) => p.winners.some((w) => w.seat === me));
      if (iWon) {
        const cards = s.cards.filter(Boolean) as Card[];
        const big = !ev.uncontested && cards.length >= 2 && BIG_HANDS.has(evaluateHand([...cards, ...view.board]).category);
        this.awardBond(big ? 'bigWin' : 'win');
      } else if (s.folded) this.awardBond('fold');
      else if (s.inHand) this.awardBond('loss');
      else return; // não estava na mão (sentou agora, eliminado…)
      this.bondHands++;
      return;
    }
    if (ev.t === 'gameOver') this.closeBond(ev.ranking.find((r) => r.seat === me)?.place === 1);
  }

  /** Fecha o vínculo da partida: bônus de partida completa (ou de partida vencida). */
  private closeBond(won: boolean): void {
    if (this.bondClosed || this.bondHands === 0) return;
    this.bondClosed = true;
    this.awardBond(won ? 'matchWin' : 'match');
  }

  /** Voz da abertura das cartas: com o vínculo feito, o personagem usa a fala própria dele. */
  private showVoice(view: TableView, seat: number): void {
    const char = this.charId(view, seat);
    if (!char) return;
    if (seat === view.mySeat && voiceUnlocked(char, 'showdown')) sayLine(char, 'showdown', { important: true });
    else sayCommon(char, 'show', { important: true });
  }

  /** Fala própria liberada pelo vínculo (só vale para o meu assento). */
  private bondVoice(view: TableView, seat: number, slot: 'turn' | 'lose'): void {
    if (this.skipping || seat !== view.mySeat) return;
    const char = this.charId(view, seat);
    if (char && voiceUnlocked(char, slot)) sayLine(char, slot, { speaker: `${seat}:${char}`, important: slot === 'lose' });
  }

  private async run(): Promise<void> {
    this.running = true;
    const epoch = this.epoch;
    while (this.queue.length && epoch === this.epoch) {
      const item = this.queue.shift()!;
      this.updateSpeed();
      this.bond(item);
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
    setTimeScale(base * boost * (this.skipping ? 5 : 1));
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
  private flyChips(from: StagePt, to: StagePt, amount: number, dur: number, fade = false, arc?: number, toss?: { spin: number; bounce: number }): Promise<number> {
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
      spin: toss?.spin,
      bounce: toss?.bounce,
    });
  }

  /** Fichas atiradas na mesa: cada arremesso sai um pouco diferente. */
  private toss(ms: number, force = 1): { dur: number; arc: number; spin: number; bounce: number } {
    const r = Math.random();
    return {
      dur: ms * (0.88 + r * 0.3),
      arc: (14 + Math.random() * 22) * force,
      spin: (Math.random() - 0.5) * 18 * force,
      bounce: (4 + Math.random() * 7) * force,
    };
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

  /** Dados da tela de resultado do round, a partir dos potes do showdown. */
  private roundResult(view: TableView, pots: PotResult[], seat: number): RoundResult {
    const s = view.seats[seat]!;
    const mine = (p: PotResult) => p.winners.filter((w) => w.seat === seat);
    const best = pots.flatMap((p) => mine(p).map((w) => w.best ?? [])).find((b) => b.length) ?? view.highlight;
    // o destaque é só nas cartas que fazem o jogo (o resto da mão aparece, mas apagado)
    const core = pots.flatMap((p) => mine(p).map((w) => w.core ?? [])).find((b) => b.length) ?? best;
    const hole = s.cards.filter(Boolean) as Card[];
    const board = best.filter((c) => !hole.some((h) => sameCard(h, c)));
    const potLines = pots.flatMap((p, i) => mine(p).map((w) => ({ label: i === 0 ? 'Pote principal' : `Pote ${i + 1}`, amount: w.amount })));
    const payers = [...paymentsTo(pots, seat)]
      .map(([x, amount]) => ({ name: this.seatName(view, x), character: this.charOf(view, x).character ?? findCharacter(''), amount: Math.round(amount) }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const others = [...new Set(pots.flatMap((p) => p.winners.map((w) => w.seat)))].filter((x) => x !== seat);
    return {
      id: nextId(),
      seat,
      name: this.seatName(view, seat),
      character: this.charOf(view, seat).character ?? findCharacter(''),
      hole,
      board,
      best,
      core,
      handName: pots.flatMap((p) => mine(p).map((w) => w.hand)).find(Boolean) ?? s.handName ?? '',
      pots: potLines,
      payers,
      won: potLines.reduce((t, p) => t + p.amount, 0),
      stack: s.stack,
      split: others.map((x) => this.seatName(view, x)),
      winFx: seat === view.mySeat ? useProfile.getState().winFx : s.cosmetics.winFx,
    };
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
    if (ev.t === 'gameOver') {
      t.setGameOver(ev.ranking);
      t.setMatch({ id: nextId(), kind: 'over' });
    }
    if (ev.t === 'handStart') {
      this.skipping = false;
      t.setWinners([]);
      t.setResult(null);
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
        this.skipping = false;
        store.setWinners([]);
        store.setSplash(null);
        store.setResult(null);
        store.addLog(`Mão #${ev.handNo}`, 'hand');
        // recolhe as cartas da mão anterior em direção ao novo dealer
        const target = geo[ev.dealerSeat]?.deck ?? MUCK_POS;
        const flights: Promise<number>[] = [];
        cur.seats.forEach((s, seat) => {
          if (!s || !s.cards.length || !geo[seat] || seat === next.mySeat) return;
          s.cards.forEach((c, i) => {
            const hp = holeCardPos(geo[seat], i, s.cards.length);
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
        if (!this.skipping) sayAction(`${ev.seat}:${who}`, who, slot);
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
        this.clearFlyers([await this.flyChips(project(betSpot(g.bet, ev.seat, cur.street)), g.plate, ev.amount, 420, true)]);
        return;
      }

      case 'collect': {
        const pot = project(POT_POS);
        const flights = ev.bets
          .filter((b) => geo[b.seat])
          .map((b) => this.flyChips(project(betSpot(geo[b.seat].bet, b.seat, cur.street)), pot, b.amount, 460 + Math.random() * 120, true, 10 + Math.random() * 14));
        store.patchDisplay({ seats: cur.seats.map((s) => (s ? { ...s, bet: 0 } : s)), pot: cur.pot });
        sfx.chips(5);
        const ids = await Promise.all(flights);
        store.patchDisplay({ pot: next.pot });
        this.clearFlyers(ids);
        return;
      }

      case 'street': {
        const names: Record<string, string> = { flop: 'Flop', turn: 'Turn', river: 'River', draw: 'Troca de cartas', postdraw: 'Apostas finais' };
        const label = names[ev.street] ?? ev.street;
        // as "ruas" do poker de 5 cartas não põem cartas na mesa
        if (!ev.cards.length) {
          store.addLog(`— ${label}`, 'street');
          if (ev.street === 'draw') sfx.pop();
          await wait(180);
          return;
        }
        store.addLog(`— ${label}: ${ev.cards.map(cardText).join(' ')}`, 'street');
        sfx.deal();
        store.patchDisplay({ board: next.board });
        setTimeout(() => sfx.flip(), 180);
        if (ev.cards.length > 1) setTimeout(() => sfx.flip(), 420);
        await wait(ev.cards.length > 1 ? 480 : 260);
        return;
      }

      case 'drawTurn':
        if (ev.seat === next.mySeat) {
          sfx.turn();
          this.bondVoice(next, ev.seat, 'turn');
        }
        return;

      case 'draw': {
        const g = geo[ev.seat];
        const count = ev.discards.length;
        const name = this.seatName(next, ev.seat);
        store.addLog(count ? `${name} trocou ${count} ${count === 1 ? 'carta' : 'cartas'}` : `${name} ficou com a mão`);
        store.addCallout(ev.seat, count ? `Troco ${count}` : 'Mantenho', count ? 'raise' : 'check');
        // voz: descartar usa a chamada comum de descarte; manter a mão, a de passar
        if (!this.skipping) sayCommon(this.charId(next, ev.seat), count ? 'muck' : 'check', { speaker: `${ev.seat}` });
        const apply = () => store.patchSeat(ev.seat, { cards: next.seats[ev.seat]?.cards ?? [], drew: count });
        if (!g || !count) {
          apply();
          return;
        }
        const cards = cur.seats[ev.seat]?.cards ?? [];
        const n = cards.length || 5;
        const isMe = ev.seat === next.mySeat;
        const back = cur.seats[ev.seat]?.cosmetics.back ?? this.backOf(next, ev.seat);
        // as trocadas saem para o descarte (as minhas, de cara para cima)
        sfx.fold();
        const land = { x: MUCK_POS.x + (Math.random() - 0.5) * 60, y: MUCK_POS.y + (Math.random() - 0.5) * 20 };
        const outs = ev.discards.map((i, k) => {
          const hp = holeCardPos(g, i, n);
          return this.fly({ kind: 'card', from: hp.p, to: { x: land.x + k * 12, y: land.y }, dur: 360, rotFrom: hp.rot, rotTo: hp.rot + 140 + k * 20, card: isMe ? (cards[i] ?? null) : null, faceUp: isMe, back, width: g.cardW, fade: true });
        });
        if (isMe) store.patchSeat(ev.seat, { cards: cards.map((c, i) => (ev.discards.includes(i) ? null : c)) });
        this.clearFlyers(await Promise.all(outs));
        if (!alive()) {
          apply();
          return;
        }
        // e as novas chegam do baralho do dealer
        const origin = next.dealerSeat !== null && geo[next.dealerSeat] ? geo[next.dealerSeat].deck : MUCK_POS;
        const ins: Promise<number>[] = [];
        for (const i of ev.discards) {
          const hp = holeCardPos(g, i, n);
          sfx.deal();
          ins.push(this.fly({ kind: 'card', from: origin, to: hp.p, dur: 300, rotFrom: 0, rotTo: hp.rot, card: null, faceUp: false, back, width: g.cardW }));
          await wait(90);
        }
        this.clearFlyers(await Promise.all(ins));
        apply();
        if (isMe) {
          sfx.flip();
          await wait(160);
        }
        return;
      }

      case 'showdown': {
        // quem abre as cartas primeiro diz a chamada comum (オープン！) — ou a fala própria, com o vínculo feito
        if (ev.reveals[0] && !this.skipping) this.showVoice(next, ev.reveals[0].seat);
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
          // voz de derrota: liberada pelo vínculo com o personagem
          if (iLost) this.bondVoice(next, me!, 'lose');
          // som do efeito das cartas vencedoras (só quando há cartas marcadas)
          if (next.highlight.length) {
            const fxSeat = winnerSeats.includes(me ?? -1) ? me! : main.seat;
            sfx.fx(findWinFx(fxSeat === me ? useProfile.getState().winFx : next.seats[fxSeat]?.cosmetics.winFx).sound);
          }
          // vozes: o vencedor anuncia a mão (no showdown, fala comum) e comemora com a fala própria
          const winner = this.charId(next, main.seat);
          if (!this.skipping)
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
        // showdown: tela de resultado do round (personagem, mão feita e fichas ganhas)
        // ao pular a mão fica só o anúncio de quem ganhou, sem a tela de resultado
        if (!ev.uncontested && main && alive() && !this.skipping) {
          store.setSplash(null);
          store.setResult(this.roundResult(next, ev.pots, main.seat));
        }
        await wait(500);
        return;
      }

      case 'turn':
        if (ev.seat === next.mySeat) {
          sfx.turn();
          this.bondVoice(next, ev.seat, 'turn');
        }
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
        store.setMatch({ id: nextId(), kind: 'over' });
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
    const t = this.toss(ms);
    const id = await this.flyChips(g.plate, project(betSpot(g.bet, seat, next.street)), amount, t.dur, false, t.arc, t);
    if (!alive()) return;
    apply();
    this.clearFlyers([id]);
    sfx.chips(2 + Math.floor(Math.random() * 3));
  }

  private async allinMotion(next: TableView, geo: SeatGeo[], seat: number, amount: number, alive: () => boolean) {
    const g = geo[seat];
    const s = next.seats[seat];
    const store = useTable.getState();
    // all-in: o arremesso é mais forte (arco alto, mais giro e quicada)
    const t = this.toss(520, 1.6);
    const id = g && amount > 0 ? await this.flyChips(g.plate, project(betSpot(g.bet, seat, next.street)), amount, t.dur, false, t.arc, t) : null;
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
      const hp = holeCardPos(g, i, cards.length);
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
      const hp = holeCardPos(g, i, sv.cards.length || 2);
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
