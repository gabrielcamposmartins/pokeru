import { randomInt } from './cards';
import type { TableBank } from './accounts';
import type { BondEvent } from './bond';
import { HandCategory, evaluateHand } from './evaluator';
import { Hand, type HandEvent, type PlayerAction } from './engine';
import { botDecide, botDraw, botThinkTimeMs } from './bot';
import {
  EMOTES,
  type BotDifficulty,
  type RoomInfo,
  type RoomSettings,
  type RoomSummary,
  type SeatView,
  type ServerMsg,
  type TableEvent,
  type TableView,
} from './protocol';
import { AVATAR_ICONS, BACK_PRESETS, CHARACTER_PRESETS, WIN_FX_IDS, type AvatarInfo, type PlayerCosmetics } from './styles';

export interface ClientHandle {
  id: string;
  /** Conta no servidor hospedado (sem conta, a mesa é livre). */
  accountId?: string;
  name: string;
  avatar: AvatarInfo;
  cosmetics: PlayerCosmetics;
  send(msg: ServerMsg): void;
}

interface Member {
  id: string;
  /** Conta do servidor, quando houver (bots e modo offline não têm). */
  accountId?: string;
  /**
   * Personagem com que o jogador entrou na mão atual. O vínculo vai para ele, não para o que
   * estiver escolhido quando a mão acabar — senão daria para trocar de personagem no meio e
   * levar os pontos para outro.
   */
  handCharacter?: string;
  /** Personagem com que entrou na partida (o bônus de fim de partida é dele). */
  matchCharacter?: string;
  name: string;
  isBot: boolean;
  difficulty: BotDifficulty;
  avatar: AvatarInfo;
  cosmetics: PlayerCosmetics;
  seat: number;
  stack: number;
  client: ClientHandle | null;
  connected: boolean;
  /** Saiu durante uma mão: o assento é liberado quando a mão acaba. */
  leaving: boolean;
  busted: boolean;
}

interface QueueItem {
  ev: TableEvent;
  views: Map<string, TableView>;
  delay: number;
}

export function makeId(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[randomInt(chars.length)];
  return s;
}

/** Mãos que contam como "mão grande" no vínculo (as mesmas do cliente). */
const BIG_HANDS = new Set([HandCategory.Straight, HandCategory.Flush, HandCategory.FullHouse, HandCategory.Quads, HandCategory.StraightFlush]);

const AVATAR_COLORS = ['#ff6b9a', '#7c5cff', '#35c4ff', '#3ddc97', '#ffb547', '#ff5d5d', '#b07bff', '#4fd1c5'];

export function sanitizeSettings(s: Partial<RoomSettings> | undefined): RoomSettings {
  const o = s ?? {};
  const n = (v: unknown, min: number, max: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : d;
  const smallBlind = n(o.smallBlind, 1, 100_000, 10);
  const bigBlind = Math.max(smallBlind, n(o.bigBlind, 2, 200_000, smallBlind * 2));
  return {
    name: (typeof o.name === 'string' && o.name.trim().slice(0, 32)) || 'Mesa Pokeru',
    maxPlayers: n(o.maxPlayers, 2, 6, 6),
    startingStack: Math.max(bigBlind * 10, n(o.startingStack, 100, 10_000_000, 2000)),
    smallBlind,
    bigBlind,
    mode: o.mode === 'sitgo' ? 'sitgo' : o.mode === 'normal' ? 'normal' : 'cash',
    variant: o.variant === 'draw5' ? 'draw5' : 'holdem',
    rounds: n(o.rounds, 1, 100, 8),
    buyIn: n(o.buyIn, 0, 10_000_000, 0),
    turnTime: n(o.turnTime, 5, 120, 20),
    blindLevelHands: n(o.blindLevelHands, 2, 50, 8),
    password: typeof o.password === 'string' && o.password ? o.password.slice(0, 32) : undefined,
    pace:
      typeof o.pace === 'number' && Number.isFinite(o.pace) ? Math.min(2, Math.max(0.4, o.pace)) : 1,
    // quem não disser nada entra na lista: só as partidas contra bots pedem para ficar fora
    listed: o.listed !== false,
    currency: o.currency === 'pado' ? 'pado' : 'chips',
    queue: o.queue === true,
  };
}

/**
 * Controlador de uma sala/mesa. Roda tanto no servidor Node quanto no navegador (modo offline).
 * Todos os eventos da mão passam por uma fila com pausas, para que as animações dos clientes
 * tenham tempo de acontecer antes da próxima decisão.
 */
export class Room {
  readonly id: string;
  settings: RoomSettings;
  /**
   * Banca do servidor hospedado: cobra o buy-in ao sentar, devolve as fichas ao sair e pontua o
   * vínculo das contas. Sem banca (modo offline), a mesa é livre.
   */
  bank: TableBank | null = null;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished' = 'waiting';
  readonly seats: (Member | null)[];
  hand: Hand | null = null;
  /** Quantas vezes cada conta pagou buy-in aqui — a chave de idempotência do padocoin usa isto. */
  private buyIns = new Map<string, number>();
  handNo = 0;
  smallBlind: number;
  bigBlind: number;
  onChange: () => void = () => {};
  onEmpty: () => void = () => {};

  private dealerSeat = -1;
  private handClosed = true;
  private queue: QueueItem[] = [];
  private pumping = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnKey = '';
  private turnDeadline = 0;
  private nextHandScheduled = false;
  private destroyed = false;
  /** Correndo a mão atual até o fim (pedido de "pular" numa partida contra bots). */
  private rushing = false;
  private eliminated: { name: string; seat: number; place: number }[] = [];

  constructor(id: string, settings: RoomSettings, host: ClientHandle) {
    this.id = id;
    this.settings = sanitizeSettings(settings);
    this.hostId = host.id;
    this.seats = new Array(this.settings.maxPlayers).fill(null);
    this.smallBlind = this.settings.smallBlind;
    this.bigBlind = this.settings.bigBlind;
  }

  // ------------------------------------------------------------------ util

  private later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  private members(): Member[] {
    return this.seats.filter((m): m is Member => !!m);
  }

  private humans(): Member[] {
    return this.members().filter((m) => !m.isBot && m.client);
  }

  memberById(id: string): Member | undefined {
    return this.members().find((m) => m.id === id);
  }

  get humanCount(): number {
    return this.humans().filter((m) => !m.leaving).length;
  }

  private sendAll(msg: ServerMsg): void {
    for (const m of this.humans()) if (m.connected) m.client!.send(msg);
  }

  private system(text: string): void {
    this.sendAll({ type: 'chat', from: 'Mesa', seat: null, text, system: true });
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.turnTimer) clearTimeout(this.turnTimer);
  }

  // ------------------------------------------------------------------ info

  info(): RoomInfo {
    const { password, ...rest } = this.settings;
    return {
      id: this.id,
      settings: { ...rest, hasPassword: !!password },
      hostId: this.hostId,
      status: this.status,
      members: this.members()
        .filter((m) => !m.leaving)
        .map((m) => ({
          id: m.id,
          seat: m.seat,
          name: m.name,
          isBot: m.isBot,
          avatar: m.avatar,
          character: m.cosmetics.character,
          stack: m.stack,
          connected: m.connected,
        })),
    };
  }

  summary(): RoomSummary {
    return {
      id: this.id,
      name: this.settings.name,
      players: this.members().filter((m) => !m.leaving).length,
      maxPlayers: this.settings.maxPlayers,
      status: this.status,
      blinds: `${this.smallBlind}/${this.bigBlind}`,
      mode: this.settings.mode,
      variant: this.settings.variant,
      buyIn: this.settings.buyIn,
      currency: this.settings.currency,
      bots: this.members().filter((m) => m.isBot && !m.leaving).length,
      hasPassword: !!this.settings.password,
    };
  }

  private broadcastRoom(): void {
    const room = this.info();
    this.sendAll({ type: 'room', room });
    this.onChange();
  }

  // ------------------------------------------------------------------ membros

  /**
   * A cobrança do buy-in precisa ir à rede? (mesa de padocoin, cujo dinheiro está no bot)
   *
   * É o que decide entre `join` e `joinPaid`. As mesas normais continuam sentando o jogador de
   * forma **síncrona**, e isso não é detalhe: o cliente manda `createRoom` e, logo atrás,
   * `addBot`/`startGame`. Com o assento resolvido só num microtask, essas mensagens chegariam
   * antes de haver cadeira e seriam descartadas em silêncio.
   */
  get asyncBuyIn(): boolean {
    return this.settings.buyIn > 0 && this.settings.currency !== 'chips';
  }

  /** As regras de entrada, sem cobrar nada: devolve a cadeira ou o motivo da recusa. */
  private checkJoin(client: ClientHandle, password?: string): { erro: string } | { seat: number } {
    if (this.settings.password && this.settings.password !== password) return { erro: 'Senha incorreta' };
    if (this.status === 'playing' && this.closedGame()) return { erro: 'Partida em andamento' };
    if (this.status === 'finished') return { erro: 'Partida encerrada' };
    let seat = this.seats.findIndex((s) => s === null);
    // mesa da fila cheia: um bot sai para dar lugar a gente — nunca um que esteja numa mão
    if (seat < 0 && this.settings.queue) {
      const bot = this.members().find((m) => m.isBot && !m.leaving && !this.naMao(m));
      if (bot) {
        this.system(`${bot.name} saiu para dar lugar a um jogador.`);
        this.removeOrMark(bot);
        seat = this.seats.findIndex((s) => s === null);
      }
    }
    if (seat < 0) return { erro: 'Mesa cheia' };
    if (this.settings.buyIn > 0 && (!this.bank || !client.accountId)) {
      return { erro: 'Esta mesa é a dinheiro: entre com uma conta do servidor' };
    }
    return { seat };
  }

  /**
   * Senta o jogador numa mesa de padocoin: cobra no bot do Discord **antes** de ocupar a cadeira.
   *
   * Entre a cobrança e o assento passa tempo de rede, então as regras são conferidas de novo — e,
   * se a cadeira tiver sido tomada nesse meio, o dinheiro volta.
   */
  async joinPaid(client: ClientHandle, password?: string): Promise<string | null> {
    if (this.memberById(client.id)) return null;
    const antes = this.checkJoin(client, password);
    if ('erro' in antes) return antes.erro;

    const pago = await this.cobra(client.accountId!, this.settings.buyIn);
    if (!pago) return 'Padocoins insuficientes para esta mesa';

    const agora = this.checkJoin(client, password);
    if ('erro' in agora) {
      void this.bank?.creditIn?.(client.accountId!, pago, this.settings.currency, `pokeru:volta:${this.id}:${client.id}:${Date.now()}`);
      return agora.erro;
    }
    this.seatAt(client, agora.seat, pago);
    return null;
  }

  join(client: ClientHandle, password?: string): string | null {
    if (this.memberById(client.id)) return null;
    const check = this.checkJoin(client, password);
    if ('erro' in check) return check.erro;
    const seat = check.seat;
    // mesa a dinheiro: as fichas saem do saldo da conta
    let stack = this.settings.startingStack;
    if (this.settings.buyIn > 0) {
      const paid = this.bank!.charge(client.accountId!, this.settings.buyIn);
      if (!paid) return 'Saldo insuficiente para o buy-in desta mesa';
      stack = paid;
    }
    this.seatAt(client, seat, stack);
    return null;
  }

  /** Ocupa a cadeira (o buy-in já foi pago, se havia). */
  private seatAt(client: ClientHandle, seat: number, stack: number): void {
    const m: Member = {
      id: client.id,
      accountId: client.accountId,
      name: client.name,
      isBot: false,
      difficulty: 'normal',
      avatar: client.avatar,
      cosmetics: client.cosmetics,
      seat,
      stack,
      client,
      connected: true,
      leaving: false,
      busted: false,
    };
    this.seats[seat] = m;
    this.system(`${m.name} sentou-se à mesa.`);
    this.broadcastRoom();
    if (this.status === 'playing') {
      client.send({ type: 'sync', view: this.buildView(client.id) });
      this.emit({ t: 'seatJoin', seat });
      this.maybeResume();
    }
  }

  updateProfile(client: ClientHandle): void {
    const m = this.memberById(client.id);
    if (!m) return;
    m.name = client.name;
    m.avatar = client.avatar;
    m.cosmetics = client.cosmetics;
    this.broadcastRoom();
    if (this.status === 'playing') for (const h of this.humans()) h.client!.send({ type: 'sync', view: this.buildView(h.id) });
  }

  leave(clientId: string): void {
    const m = this.memberById(clientId);
    if (!m) return;
    m.connected = false;
    m.client?.send({ type: 'left' });
    m.client = null;
    this.system(`${m.name} saiu da mesa.`);
    this.removeOrMark(m);
    if (this.hostId === clientId) {
      const next = this.humans().find((h) => !h.leaving);
      if (next) this.hostId = next.id;
    }
    if (this.humanCount === 0) {
      this.destroy();
      this.onEmpty();
      return;
    }
    this.broadcastRoom();
  }

  private removeOrMark(m: Member): void {
    const hp = this.hand && !this.hand.finished ? this.hand.players.find((p) => p.id === m.id) : undefined;
    if (!hp) this.cashOut(m);
    if (hp && !hp.folded) {
      m.leaving = true;
      // se for a vez dele, desiste imediatamente
      if (this.hand!.toActSeat === m.seat && this.turnKey === this.currentTurnKey()) this.autoAct(m.seat);
    } else {
      this.seats[m.seat] = null;
      if (this.status === 'playing') this.emit({ t: 'seatLeave', seat: m.seat });
    }
  }

  addBot(byId: string, difficulty: BotDifficulty): string | null {
    if (byId !== this.hostId) return 'Apenas o anfitrião pode adicionar bots';
    if (this.status === 'finished') return 'Partida encerrada';
    if (this.status === 'playing' && this.closedGame()) return 'Partida em andamento';
    const seat = this.seats.findIndex((s) => s === null);
    if (seat < 0) return 'Mesa cheia';
    const used = new Set(this.members().map((m) => m.name));
    const pick = <T>(arr: readonly T[]) => arr[randomInt(arr.length)];
    // bots levam o nome do personagem:
    // escolhe entre os menos usados na mesa, evitando o personagem dos humanos
    const usage = new Map<string, number>();
    for (const o of this.members()) usage.set(o.cosmetics.character.id, (usage.get(o.cosmetics.character.id) ?? 0) + 1);
    const humanChars = new Set(this.members().filter((o) => !o.isBot).map((o) => o.cosmetics.character.id));
    const score = (id: string) => (usage.get(id) ?? 0) * 2 + (humanChars.has(id) ? 1 : 0);
    const best = Math.min(...CHARACTER_PRESETS.map((c) => score(c.id)));
    const character = pick(CHARACTER_PRESETS.filter((c) => score(c.id) === best));
    let name = character.name;
    for (let k = 2; used.has(name); k++) name = `${character.name} ${k}`;
    const m: Member = {
      id: 'bot-' + makeId(6),
      name,
      isBot: true,
      difficulty,
      avatar: { color: pick(AVATAR_COLORS), icon: pick(AVATAR_ICONS) },
      cosmetics: { back: pick(BACK_PRESETS), character, winFx: pick(WIN_FX_IDS) },
      seat,
      stack: this.settings.startingStack,
      client: null,
      connected: true,
      leaving: false,
      busted: false,
    };
    this.seats[seat] = m;
    this.broadcastRoom();
    if (this.status === 'playing') {
      this.emit({ t: 'seatJoin', seat });
      this.maybeResume();
    }
    return null;
  }

  removeBot(byId: string, seat: number): string | null {
    if (byId !== this.hostId) return 'Apenas o anfitrião pode remover bots';
    const m = this.seats[seat];
    if (!m || !m.isBot) return 'Não há bot neste assento';
    this.removeOrMark(m);
    this.broadcastRoom();
    return null;
  }

  start(byId: string): string | null {
    if (byId !== this.hostId) return 'Apenas o anfitrião pode iniciar';
    if (this.status === 'playing') return 'A partida já começou';
    const seated = this.members().filter((m) => !m.leaving);
    if (seated.length < 2) return 'São necessários ao menos 2 jogadores';
    this.status = 'playing';
    this.handNo = 0;
    this.eliminated = [];
    this.smallBlind = this.settings.smallBlind;
    this.bigBlind = this.settings.bigBlind;
    for (const m of seated) {
      m.matchCharacter = m.cosmetics.character.id;
      if (this.paid()) {
        // todos começam com o buy-in: os bots de graça, os jogadores pagando a diferença
        if (m.isBot) m.stack = this.settings.buyIn;
        else if (m.stack < this.settings.buyIn) m.stack += this.charge(m, this.settings.buyIn - m.stack);
      } else m.stack = this.settings.startingStack;
      m.busted = false;
    }
    this.dealerSeat = seated[randomInt(seated.length)].seat;
    // o próximo startHand avança o botão; recua um para começar no sorteado
    this.dealerSeat = this.prevSeat(this.dealerSeat);
    this.broadcastRoom();
    for (const h of this.humans()) h.client!.send({ type: 'sync', view: this.buildView(h.id) });
    this.system('A partida começou! Boa sorte.');
    this.later(() => this.startHand(), 1200);
    return null;
  }

  /** Mesa a dinheiro: custa fichas do saldo para sentar (e a saída devolve o que sobrou). */
  private paid(): boolean {
    return this.settings.buyIn > 0 && !!this.bank;
  }

  /** O membro está numa mão em andamento? (tirar quem está jogando quebraria a mão) */
  private naMao(m: Member): boolean {
    return !!this.hand && !this.hand.finished && this.hand.players.some((p) => p.id === m.id);
  }

  /**
   * Cobra o buy-in na moeda da mesa. Devolve quanto saiu (0 = não deu).
   *
   * Em padocoin a cobrança é no bot do Discord, e a chave de idempotência é fixa por
   * conta + mesa + número de entradas: se a chamada der timeout e a pessoa tentar sentar de novo,
   * o bot devolve a resposta guardada em vez de cobrar duas vezes.
   */
  private async cobra(accountId: string, amount: number): Promise<number> {
    if (!this.bank) return 0;
    if (this.settings.currency === 'chips') return this.bank.charge(accountId, amount);
    if (!this.bank.chargeIn) return 0;
    const n = (this.buyIns.get(accountId) ?? 0) + 1;
    const pago = await this.bank.chargeIn(accountId, amount, 'pado', `pokeru:${this.id}:${accountId}:${n}`);
    // só conta a entrada que deu certo: uma tentativa que falhou repete a mesma chave
    if (pago > 0) this.buyIns.set(accountId, n);
    return pago;
  }

  /**
   * Cobra fichas do saldo de um membro (devolve quanto saiu; 0 sem conta ou sem saldo).
   *
   * Só serve para a moeda do próprio jogo. Numa mesa de padocoin devolve 0 de propósito: a
   * cobrança lá é ida à rede, e isto roda no meio da mão (no rebuy) — então em padocoin **não há
   * rebuy automático**, quem zera sai e entra de novo se quiser recomprar.
   */
  private charge(m: Member, amount: number): number {
    if (!this.paid() || !m.accountId || amount <= 0) return 0;
    if (this.settings.currency !== 'chips') return 0;
    return this.bank!.charge(m.accountId, amount);
  }

  /** Devolve as fichas da mesa ao saldo do jogador e zera a pilha (ele não leva duas vezes). */
  private cashOut(m: Member): void {
    if (!this.paid() || !m.accountId || m.stack <= 0) return;
    if (this.settings.currency === 'pado') {
      // padocoin volta para o bot: é rede, então não dá para esperar aqui. O banco registra falha.
      void this.bank!.creditIn?.(m.accountId, m.stack, 'pado', `pokeru:out:${this.id}:${m.accountId}:${Date.now()}`);
      m.stack = 0;
      return;
    }
    this.bank!.credit(m.accountId, m.stack);
    m.stack = 0;
  }

  /** Fichas que uma conta tem nesta mesa agora (para o servidor mostrar o "em jogo"). */
  chipsOf(accountId: string): number {
    return this.members().reduce((t, m) => t + (m.accountId === accountId ? m.stack : 0), 0);
  }

  /** Devolve a todos as fichas da mesa (o servidor chama isto ao desligar). */
  cashOutAll(): void {
    for (const m of this.members()) this.cashOut(m);
  }

  /** Partida fechada: quem quebra é eliminado e ninguém entra no meio (Sit & Go e modo normal). */
  private closedGame(): boolean {
    return this.settings.mode !== 'cash';
  }

  /** Modo normal: a partida acaba ao completar as rodadas contratadas. */
  private roundsOver(): boolean {
    return this.settings.mode === 'normal' && this.handNo >= this.settings.rounds;
  }

  private prevSeat(seat: number): number {
    return (seat - 1 + this.seats.length) % this.seats.length;
  }

  /** Retoma o jogo em modo cash quando havia menos de 2 jogadores. */
  private maybeResume(): void {
    if (this.status !== 'playing') return;
    if ((!this.hand || this.handClosed) && !this.nextHandScheduled && this.queue.length === 0 && !this.pumping) {
      this.nextHandScheduled = true;
      this.later(() => {
        this.nextHandScheduled = false;
        this.startHand();
      }, 1000);
    }
  }

  // ------------------------------------------------------------------ mãos

  private startHand(): void {
    if (this.status !== 'playing') return;
    this.rushing = false;
    // limpa quem saiu
    for (const m of this.members()) {
      if (m.leaving) {
        this.cashOut(m);
        this.seats[m.seat] = null;
        this.emit({ t: 'seatLeave', seat: m.seat });
      }
    }
    // quem saiu no meio da mão anterior já teve o assento liberado acima: devolve as fichas
    const eligible = this.members().filter((m) => !m.leaving && !m.busted && m.stack > 0);
    if (eligible.length < 2) {
      this.hand = null;
      if (this.closedGame()) {
        this.finishGame();
        return;
      }
      this.status = 'waiting';
      this.system('Aguardando jogadores para continuar…');
      this.broadcastRoom();
      for (const h of this.humans()) h.client!.send({ type: 'sync', view: this.buildView(h.id) });
      return;
    }

    if (this.settings.mode === 'sitgo' && this.handNo > 0 && this.handNo % this.settings.blindLevelHands === 0) {
      this.smallBlind *= 2;
      this.bigBlind *= 2;
      this.emit({ t: 'blindsUp', smallBlind: this.smallBlind, bigBlind: this.bigBlind });
      this.system(`Blinds sobem para ${this.smallBlind}/${this.bigBlind}.`);
    }

    // avança o botão
    const eligibleSeats = new Set(eligible.map((m) => m.seat));
    let d = this.dealerSeat;
    for (let i = 0; i < this.seats.length; i++) {
      d = (d + 1) % this.seats.length;
      if (eligibleSeats.has(d)) break;
    }
    this.dealerSeat = d;
    this.handNo++;
    this.handClosed = false;
    this.turnKey = '';
    this.hand = new Hand(
      {
        players: eligible.map((m) => ({ seat: m.seat, id: m.id, stack: m.stack })),
        dealerSeat: d,
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        variant: this.settings.variant,
      },
      (ev) => this.emit(ev),
    );
    if (this.settings.mode === 'normal') {
      const left = this.settings.rounds - this.handNo;
      this.system(left === 0 ? 'Última rodada!' : `Rodada ${this.handNo} de ${this.settings.rounds}.`);
    }
    // o vínculo da mão é do personagem com que ela começou; o da partida, do primeiro de todos
    for (const m of eligible) {
      m.handCharacter = m.cosmetics.character.id;
      m.matchCharacter ??= m.handCharacter;
    }
    this.emit({ t: 'handStart', handNo: this.handNo, dealerSeat: d });
    this.hand.start();
    this.onChange();
  }

  private closeHand(): void {
    const h = this.hand!;
    this.handClosed = true;
    for (const hp of h.players) {
      const m = this.memberById(hp.id);
      if (m) m.stack = hp.stack;
    }
    const alive = () => this.members().filter((m) => !m.busted && !m.leaving && m.stack > 0).length;
    // quem começou a mão com mais fichas fica com a melhor colocação
    const broke = this.members()
      .filter((m) => m.stack === 0 && !m.busted)
      .sort((a, b) => (h.players.find((p) => p.id === b.id)?.total ?? 0) - (h.players.find((p) => p.id === a.id)?.total ?? 0));
    const remaining = alive();
    broke.forEach((m, i) => {
      // cash: recompra. Na mesa a dinheiro custa outro buy-in; sem saldo, o jogador é eliminado
      const rebuy = !this.closedGame() && (!this.paid() || m.isBot || this.charge(m, this.settings.buyIn) > 0);
      if (rebuy) {
        m.stack = this.paid() ? this.settings.buyIn : this.settings.startingStack;
        this.emit({ t: 'rebuy', seat: m.seat, amount: m.stack });
        this.system(`${m.name} fez rebuy de ${m.stack}.`);
      } else {
        m.busted = true;
        const place = remaining + 1 + i;
        this.eliminated.push({ name: m.name, seat: m.seat, place });
        this.emit({ t: 'bust', seat: m.seat, place });
        this.system(`${m.name} foi eliminado em ${place}º lugar.`);
      }
    });
    this.awardBond(h);
    this.emit({ t: 'handEnd' });
    if (this.closedGame() && alive() <= 1) this.finishGame();
    else if (this.roundsOver()) this.finishGame();
  }

  /**
   * Vínculo das contas: as mesmas regras do cliente (shared/bond.ts), mas pontuadas **aqui**.
   * Num servidor hospedado o progresso é dele; o cliente só mostra o que recebe.
   */
  private awardBond(h: Hand): void {
    if (!this.bank) return;
    for (const m of this.members()) {
      if (m.isBot || !m.accountId) continue;
      const hp = h.players.find((p) => p.id === m.id);
      if (!hp) continue;
      const won = h.results.some((r) => r.winners.some((w) => w.seat === m.seat));
      let ev: BondEvent;
      if (won) {
        const cards = [...hp.hole, ...h.board];
        const big = h.street === 'showdown' && cards.length >= 5 && BIG_HANDS.has(evaluateHand(cards).category);
        ev = big ? 'bigWin' : 'win';
      } else if (hp.folded) ev = 'fold';
      else ev = 'loss';
      this.bank.bond(m.accountId, m.handCharacter ?? m.cosmetics.character.id, ev);
      this.bank.note(m.accountId, 'hand');
      if (won) this.bank.note(m.accountId, 'win');
    }
  }

  private finishGame(): void {
    this.status = 'finished';
    const alive = this.members().filter((m) => !m.busted && !m.leaving);
    const ranking = [
      ...alive.sort((a, b) => b.stack - a.stack).map((m, i) => ({ name: m.name, seat: m.seat, place: i + 1 })),
      ...[...this.eliminated].sort((a, b) => a.place - b.place),
    ];
    this.emit({ t: 'gameOver', ranking });
    if (ranking[0]) this.system(`${ranking[0].name} venceu ${this.settings.mode === 'normal' ? `as ${this.settings.rounds} rodadas` : 'o Sit & Go'}!`);
    // as contas levam o vínculo da partida e as fichas que sobraram na mesa
    if (this.bank) {
      for (const m of this.members()) {
        if (m.isBot || !m.accountId) continue;
        const place = ranking.find((r) => r.seat === m.seat)?.place;
        this.bank.bond(m.accountId, m.matchCharacter ?? m.handCharacter ?? m.cosmetics.character.id, place === 1 ? 'matchWin' : 'match');
        this.bank.note(m.accountId, 'match');
      }
    }
    for (const m of this.members()) this.cashOut(m);
    this.broadcastRoom();
  }

  /** Permite ao anfitrião reiniciar a sala após o fim do Sit & Go. */
  reset(byId: string): string | null {
    if (byId !== this.hostId) return 'Apenas o anfitrião pode reiniciar';
    if (this.status !== 'finished') return null;
    this.status = 'waiting';
    this.hand = null;
    for (const m of this.members()) {
      m.busted = false;
      m.stack = this.settings.startingStack;
    }
    this.broadcastRoom();
    return null;
  }

  // ------------------------------------------------------------------ fila de eventos

  private delayFor(ev: TableEvent): number {
    const n = this.hand?.players.length ?? 2;
    switch (ev.t) {
      case 'handStart':
        return 700;
      case 'blinds':
        return 900;
      case 'deal':
        return 500 + n * 2 * 170 + 500;
      case 'action':
        return ev.action === 'fold' ? 900 : ev.action === 'check' ? 850 : ev.action === 'allin' ? 1400 : 1050;
      case 'refund':
        return 650;
      case 'collect':
        return 850;
      case 'street':
        // no poker de 5 cartas as "ruas" da troca não põem cartas na mesa: pausa curta
        return ev.street === 'flop' ? 1500 : ev.street === 'draw' || ev.street === 'postdraw' ? 700 : 1100;
      case 'draw':
        return ev.discards.length ? 1100 : 700;
      case 'showdown':
        return 900 + 700 * ev.reveals.length;
      case 'win':
        return ev.uncontested ? 2000 : 3600;
      case 'rebuy':
      case 'bust':
        return 900;
      case 'blindsUp':
        return 1200;
      case 'handEnd':
        return 300;
      default:
        return 0;
    }
  }

  private emit(ev: TableEvent | HandEvent): void {
    const views = new Map<string, TableView>();
    for (const m of this.humans()) views.set(m.id, this.buildView(m.id));
    this.queue.push({ ev, views, delay: this.rushing ? 12 : this.delayFor(ev) * this.settings.pace });
    this.pump();
  }

  private pump(): void {
    if (this.pumping || this.destroyed) return;
    const item = this.queue.shift();
    if (!item) {
      this.onIdle();
      return;
    }
    this.pumping = true;
    for (const m of this.humans()) {
      if (!m.connected) continue;
      m.client!.send({ type: 'event', ev: item.ev, view: item.views.get(m.id) ?? this.buildView(m.id) });
    }
    this.later(() => {
      this.pumping = false;
      this.pump();
    }, item.delay);
  }

  private currentTurnKey(): string {
    return this.hand ? `${this.handNo}:${this.hand.seq}` : '';
  }

  private onIdle(): void {
    if (this.destroyed || this.status !== 'playing' || !this.hand) return;
    const h = this.hand;
    if (!h.finished) {
      if (h.toActSeat !== null && this.turnKey !== this.currentTurnKey()) this.startTurn();
      return;
    }
    if (!this.handClosed) {
      this.closeHand();
      return;
    }
    if (this.status === 'playing' && !this.nextHandScheduled) {
      this.nextHandScheduled = true;
      this.later(
        () => {
          this.nextHandScheduled = false;
          this.startHand();
        },
        this.rushing ? 80 : 900 * this.settings.pace,
      );
    }
  }

  private startTurn(): void {
    const h = this.hand!;
    const seat = h.toActSeat!;
    const m = this.seats[seat];
    const drawing = h.phase === 'draw';
    this.turnKey = this.currentTurnKey();
    const timeMs = this.settings.turnTime * 1000;
    this.turnDeadline = Date.now() + timeMs;
    this.emit(drawing ? { t: 'drawTurn', seat, timeMs } : { t: 'turn', seat, timeMs });
    if (this.turnTimer) clearTimeout(this.turnTimer);
    const key = this.turnKey;
    const guard = (fn: () => void) => () => {
      if (this.turnKey === key && this.currentTurnKey() === key) fn();
    };
    if (!m || m.leaving || (!m.isBot && !m.connected)) {
      this.turnTimer = this.later(guard(() => this.autoAct(seat)), 400);
    } else if (m.isBot) {
      const think = this.rushing ? 10 : botThinkTimeMs() * Math.min(1, this.settings.pace);
      this.turnTimer = this.later(guard(() => (drawing ? this.botDrawAct(m) : this.botAct(m))), think);
    } else {
      this.turnTimer = this.later(guard(() => this.autoAct(seat)), timeMs + 300);
    }
  }

  /** Vez perdida (tempo esgotado, jogador saindo): passa/desiste, ou mantém as cartas na troca. */
  private autoAct(seat: number): void {
    const h = this.hand;
    if (!h || h.finished) return;
    if (h.phase === 'draw') {
      if (h.toActSeat === seat) this.applyDraw(seat, []);
      return;
    }
    const l = h.legalActions(seat);
    if (!l) return;
    this.applyAction(seat, l.canCheck ? { type: 'check' } : { type: 'fold' });
  }

  /** Troca do bot: mantém o que já vale e pede cartas novas para o resto. */
  private botDrawAct(m: Member): void {
    const h = this.hand!;
    const hp = h.players.find((p) => p.id === m.id);
    if (!hp || h.toActSeat !== m.seat) return;
    let discards: number[] = [];
    try {
      discards = botDraw(hp.hole, m.difficulty);
    } catch {
      discards = [];
    }
    this.applyDraw(m.seat, discards);
  }

  private applyDraw(seat: number, discards: number[]): boolean {
    if (!this.hand) return false;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.timers.delete(this.turnTimer);
      this.turnTimer = null;
    }
    return this.hand.draw(seat, discards).ok;
  }

  private botAct(m: Member): void {
    const h = this.hand!;
    const hp = h.players.find((p) => p.id === m.id);
    const legal = h.legalActions(m.seat);
    if (!hp || !legal) return;
    let action: PlayerAction;
    try {
      action = botDecide({
        hole: hp.hole,
        board: h.board,
        legal,
        pot: h.totalPot,
        bigBlind: h.bigBlind,
        stack: hp.stack,
        opponents: h.players.filter((p) => !p.folded && p !== hp).length,
        street: h.street,
        variant: h.variant,
        difficulty: m.difficulty,
      });
    } catch {
      action = legal.canCheck ? { type: 'check' } : { type: 'fold' };
    }
    const r = this.applyAction(m.seat, action);
    if (!r) this.autoAct(m.seat);
  }

  private applyAction(seat: number, action: PlayerAction): boolean {
    if (!this.hand) return false;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.timers.delete(this.turnTimer);
      this.turnTimer = null;
    }
    const r = this.hand.act(seat, action);
    return r.ok;
  }

  /**
   * Corre a mão atual até o fim, sem as pausas das animações. Serve para o jogador que já
   * desistiu não ter de esperar os bots — por isso só vale numa mesa com um humano só.
   */
  skipHand(clientId: string): string | null {
    const m = this.memberById(clientId);
    if (!m || m.isBot) return 'Você não está na mesa';
    if (this.humanCount > 1) return 'Só dá para pular jogando contra bots';
    if (this.status !== 'playing' || !this.hand || this.hand.finished) return null;
    const p = this.hand.players.find((x) => x.id === clientId);
    if (p && !p.folded) return 'Você ainda está na mão';
    if (this.rushing) return null;
    this.rushing = true;
    // refaz a vez atual para o bot decidir na hora, sem o tempo de "pensar"
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.timers.delete(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnKey = '';
    this.pump();
    return null;
  }

  handleAction(clientId: string, action: PlayerAction): string | null {
    const m = this.memberById(clientId);
    const h = this.hand;
    if (!m || !h || h.finished) return 'Nenhuma mão em andamento';
    if (h.toActSeat !== m.seat || this.turnKey !== this.currentTurnKey()) return 'Não é a sua vez';
    if (!action || typeof action.type !== 'string') return 'Ação inválida';
    const res = h.legalActions(m.seat);
    if (!res) return 'Ação inválida';
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.timers.delete(this.turnTimer);
      this.turnTimer = null;
    }
    const r = h.act(m.seat, { type: action.type, amount: Number(action.amount) || undefined });
    if (!r.ok) {
      // devolve o timer da vez
      this.turnKey = '';
      this.pump();
      return r.error;
    }
    return null;
  }

  /** Troca de cartas pedida por um jogador (poker de 5 cartas). */
  handleDraw(clientId: string, discards: number[]): string | null {
    const m = this.memberById(clientId);
    const h = this.hand;
    if (!m || !h || h.finished) return 'Nenhuma mão em andamento';
    if (h.phase !== 'draw') return 'Não é a hora de trocar cartas';
    if (h.toActSeat !== m.seat || this.turnKey !== this.currentTurnKey()) return 'Não é a sua vez';
    const list = Array.isArray(discards) ? discards.map(Number).filter((n) => Number.isInteger(n)) : [];
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.timers.delete(this.turnTimer);
      this.turnTimer = null;
    }
    const r = h.draw(m.seat, list);
    if (!r.ok) {
      // devolve o timer da vez
      this.turnKey = '';
      this.pump();
      return r.error;
    }
    return null;
  }

  chat(clientId: string, text: string): void {
    const m = this.memberById(clientId);
    if (!m) return;
    const t = [...String(text ?? '')].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').trim().slice(0, 200);
    if (!t) return;
    this.sendAll({ type: 'chat', from: m.name, seat: m.seat, text: t });
  }

  emote(clientId: string, emote: string): void {
    const m = this.memberById(clientId);
    if (!m || !EMOTES.includes(emote)) return;
    this.sendAll({ type: 'emote', seat: m.seat, emote });
  }

  // ------------------------------------------------------------------ views

  buildView(forId: string): TableView {
    const h = this.hand;
    const me = this.memberById(forId);
    const turnLive = !!h && !h.finished && h.toActSeat !== null && this.turnKey === this.currentTurnKey();
    const toAct = turnLive ? h!.toActSeat : null;
    let highlight: TableView['highlight'] = [];
    // destaque (moldura + efeito): só as cartas que fazem o jogo do vencedor
    if (h?.finished && h.results[0]) highlight = h.results[0].winners.flatMap((w) => w.core ?? w.best ?? []);

    const seats = this.seats.map((m): SeatView | null => {
      if (!m) return null;
      const hp = h?.players.find((p) => p.id === m.id);
      const live = !!hp && !this.handClosed;
      const showCards = !!hp && !hp.folded;
      return {
        seat: m.seat,
        id: m.id,
        name: m.name,
        isBot: m.isBot,
        avatar: m.avatar,
        cosmetics: m.cosmetics,
        stack: live ? hp!.stack : m.stack,
        bet: hp?.bet ?? 0,
        inHand: !!hp,
        folded: hp?.folded ?? false,
        allIn: hp?.allIn ?? false,
        cards: showCards ? hp!.hole.map((c) => (m.id === forId || hp!.revealed ? c : null)) : [],
        lastAction: hp?.lastAction ?? null,
        drew: hp?.drew,
        handName: hp?.revealed && h ? evaluateHand([...hp.hole, ...h.board]).name : undefined,
        connected: m.connected,
        busted: m.busted,
      };
    });

    const dealerSeat = h ? h.players[h.dealerIdx].seat : null;
    return {
      roomId: this.id,
      handNo: this.handNo,
      rounds: this.settings.mode === 'normal' ? this.settings.rounds : null,
      status: this.status,
      variant: this.settings.variant,
      maxPlayers: this.settings.maxPlayers,
      seats,
      board: h?.board ?? [],
      pot: h?.pot ?? 0,
      street: h?.street ?? null,
      dealerSeat,
      sbSeat: h && h.sbIdx >= 0 ? h.players[h.sbIdx].seat : null,
      bbSeat: h && h.bbIdx >= 0 ? h.players[h.bbIdx].seat : null,
      toAct,
      timeLeftMs: toAct !== null ? Math.max(0, this.turnDeadline - Date.now()) : null,
      turnTimeMs: this.settings.turnTime * 1000,
      currentBet: h?.currentBet ?? 0,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      mySeat: me ? me.seat : null,
      legal: toAct !== null && me && toAct === me.seat ? h!.legalActions(me.seat) : null,
      highlight,
    };
  }
}
