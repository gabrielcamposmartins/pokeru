import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Acessorios } from './acessorios';
import { BOT_APOSTA, BOT_COM_ACESSORIO, apostaveis, chaveDoItem, podeApostar, usando, valorDaAposta } from './aposta';
import { estaAVenda } from './catalog';
import { Lobby, type Connection } from './lobby';
import { DEFAULT_SETTINGS, type RoomSettings, type ServerMsg, type TableEvent, type TableView } from './protocol';
import { sanitizeSettings } from './room';
import type { PlayerAction } from './engine';

/** O acaso de verdade, guardado antes de qualquer espião. */
const acasoDeVerdade = Math.random.bind(Math);
/** O espião do acaso, quando um teste o fixa (as chances dos bots saem de `Math.random`). */
let acaso: ReturnType<typeof vi.spyOn> | null = null;

afterEach(() => {
  vi.useRealTimers();
  // o acaso volta ao normal
  acaso?.mockRestore();
  acaso = null;
});

interface Harness {
  conn: Connection;
  views: TableView[];
  events: string[];
  errors: string[];
}

/** Conecta um "humano" automático que responde à própria vez (apostas e trocas de carta). */
function autoPlayer(lobby: Lobby, name: string, pick?: (v: TableView) => PlayerAction, discards: number[] = [0, 1]): Harness {
  const h: Harness = { conn: null as unknown as Connection, views: [], events: [], errors: [] };
  h.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'error') h.errors.push(m.message);
    if (m.type !== 'event') return;
    h.views.push(m.view);
    h.events.push(m.ev.t);
    if (m.ev.t === 'turn' && m.view.legal && m.view.toAct === m.view.mySeat) {
      const v = m.view;
      const l = v.legal!;
      const action: PlayerAction = pick
        ? pick(v)
        : l.canCheck
          ? { type: 'check' }
          : Math.random() < 0.6
            ? { type: 'call' }
            : { type: 'fold' };
      setTimeout(() => h.conn.handle({ type: 'action', action }), 5);
    }
    // poker de 5 cartas: a vez de trocar cartas
    if (m.ev.t === 'drawTurn' && m.view.toAct === m.view.mySeat) {
      setTimeout(() => h.conn.handle({ type: 'draw', discards }), 5);
    }
  });
  h.conn.handle({ type: 'hello', name, avatar: {}, cosmetics: {} });
  return h;
}

const fast: Partial<RoomSettings> = { pace: 0.4, turnTime: 5 };

/** Passa quando pode, paga quando não pode (nunca manda ação ilegal). */
const passive = (v: TableView): PlayerAction => (v.legal!.canCheck ? { type: 'check' } : { type: 'call' });

/**
 * As fichas da mesa: pilhas, apostas e pote. O valor de um acessório apostado (shared/aposta.ts)
 * entra no número da aposta e do pote sem ser ficha — e os bots apostam peças —, então sai da conta.
 */
function totalChips(v: TableView): number {
  const naMesa = v.seats.reduce((s, x) => s + (x ? x.bet : 0), 0) + v.pot;
  // (o desconto não passa do que há nas apostas e no pote: paga a mão, o pote zera, mas a foto do
  // `win` ainda traz a peça com `emJogo` cheio até a mão fechar — veja o teste marcado `fails` abaixo)
  const emPecas = Math.min(naMesa, pecasEmJogo(v));
  return v.seats.reduce((s, x) => s + (x ? x.stack : 0), 0) + naMesa - emPecas;
}

/** Quanto das apostas e do pote é acessório, pelo que a foto da mesa diz. */
const pecasEmJogo = (v: TableView): number => (v.itens ?? []).reduce((s, i) => s + i.emJogo, 0);

async function runUntil(cond: () => boolean, maxMs = 3_000_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) {
    await vi.advanceTimersByTimeAsync(250);
    // (o espião do acaso guarda cada chamada, e os bots sorteiam aos milhares: esvazia para não juntar)
    acaso?.mockClear();
  }
}

describe('sala', () => {
  it('Sit & Go completo com bots termina e conserva fichas', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester');
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'sitgo', maxPlayers: 4, startingStack: 1000, smallBlind: 25, bigBlind: 50, blindLevelHands: 3 },
    });
    for (let i = 0; i < 3; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));

    expect(p.events).toContain('gameOver');
    expect(p.events.filter((e) => e === 'handStart').length).toBeGreaterThan(1);
    for (const v of p.views) expect(totalChips(v)).toBe(4000);
    expect(p.errors).toEqual([]);
    // partida inteira com bots (Monte Carlo): folga para máquinas carregadas
  }, 30_000);

  it('dois humanos: um sai no meio da mão e a mesa continua', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Ana');
    const b = autoPlayer(lobby, 'Beto', () => ({ type: 'call' }));
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, maxPlayers: 3 } });
    const roomId = [...lobby.rooms.keys()][0];
    b.conn.handle({ type: 'joinRoom', roomId });
    a.conn.handle({ type: 'addBot', difficulty: 'normal' });
    a.conn.handle({ type: 'startGame' });

    await runUntil(() => a.events.filter((e) => e === 'deal').length >= 2);
    b.conn.close();
    const before = a.events.filter((e) => e === 'handStart').length;
    await runUntil(() => a.events.filter((e) => e === 'handStart').length >= before + 3);

    expect(a.events.filter((e) => e === 'handStart').length).toBeGreaterThanOrEqual(before + 3);
    const last = a.views[a.views.length - 1];
    expect(last.seats.filter(Boolean).length).toBe(2);
    expect(a.errors).toEqual([]);
  });

  it('sala é removida quando o último humano sai', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Solo');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast } });
    a.conn.handle({ type: 'addBot', difficulty: 'hard' });
    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(lobby.rooms.size).toBe(1);
    a.conn.handle({ type: 'leaveRoom' });
    expect(lobby.rooms.size).toBe(0);
  });

  it('personagem na rede é resolvido pelo id (arte sempre oficial)', () => {
    const lobby = new Lobby('teste');
    const rooms: { members: { id: string; isBot: boolean; name: string; character: { id: string; name: string; full: string } }[] }[] = [];
    const a = lobby.connect((m) => {
      if (m.type === 'room') rooms.push(m.room);
    });
    a.handle({ type: 'hello', name: 'Ana', avatar: {}, cosmetics: { character: { id: 'yukina', full: 'http://evil/x.png' } } });
    a.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const me = rooms[rooms.length - 1].members.find((m) => m.id === a.id)!;
    expect(me.character.id).toBe('yukina');
    expect(me.character.full).toBe('/characters/yukina/full.png');
  });

  it('bots recebem personagens diferentes do meu', () => {
    const lobby = new Lobby('teste');
    const rooms: { members: { isBot: boolean; name: string; character: { id: string; name: string } }[] }[] = [];
    const a = lobby.connect((m) => {
      if (m.type === 'room') rooms.push(m.room);
    });
    a.handle({ type: 'hello', name: 'Ana', avatar: {}, cosmetics: { character: { id: 'marina' } } });
    a.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    for (let i = 0; i < 3; i++) a.handle({ type: 'addBot', difficulty: 'easy' });
    const bots = rooms[rooms.length - 1].members.filter((m) => m.isBot);
    expect(bots.every((b) => b.character.name === b.name)).toBe(true);
    expect(new Set(bots.map((b) => b.character.id)).size).toBe(3);
    expect(bots.some((b) => b.character.id === 'marina')).toBe(false);

    // mesa cheia (5 bots, 4 personagens): distribuição equilibrada
    for (let i = 0; i < 2; i++) a.handle({ type: 'addBot', difficulty: 'easy' });
    const all = rooms[rooms.length - 1].members.filter((m) => m.isBot);
    const count = new Map<string, number>();
    for (const b of all) count.set(b.character.id, (count.get(b.character.id) ?? 0) + 1);
    expect(all.length).toBe(5);
    expect(Math.max(...count.values())).toBeLessThanOrEqual(2);
    expect(all.some((b) => b.character.id === 'marina')).toBe(false);
    expect(all.every((b) => b.name.startsWith(b.character.name))).toBe(true);
  });

  it('pular a mao: corre o resto contra os bots e cai na mao seguinte', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    // humano que sempre desiste
    const p = autoPlayer(lobby, 'Tester', () => ({ type: 'fold' }));
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'cash', maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    p.conn.handle({ type: 'addBot', difficulty: 'normal' });
    p.conn.handle({ type: 'addBot', difficulty: 'normal' });
    p.conn.handle({ type: 'startGame' });
    // estando na mao, o pedido e recusado
    await runUntil(() => p.views.length > 0);
    p.conn.handle({ type: 'skipHand' });
    expect(p.errors.some((e) => e.includes('ainda está na mão'))).toBe(true);

    // espera o momento exato em que eu ja desisti e a sala esta parada esperando a vez de um bot:
    // so nele o pedido de pular tem efeito (com a mao encerrada, a proxima corre no ritmo normal)
    const waitingBot = () => {
      const v = p.views[p.views.length - 1];
      return (
        p.events[p.events.length - 1] === 'turn' &&
        !!v &&
        v.mySeat !== null &&
        v.seats[v.mySeat]?.folded === true &&
        v.toAct !== null &&
        v.toAct !== v.mySeat
      );
    };
    await runUntil(waitingBot);
    expect(waitingBot()).toBe(true);
    const before = p.views[p.views.length - 1].handNo;
    const winsBefore = p.events.filter((e) => e === 'win').length;
    p.conn.handle({ type: 'skipHand' });
    await vi.advanceTimersByTimeAsync(1500);
    // a mao terminou (com vencedor anunciado) e a proxima ja comecou
    expect(p.events.filter((e) => e === 'win').length).toBeGreaterThan(winsBefore);
    expect(p.views[p.views.length - 1].handNo).toBeGreaterThan(before);
  });

  it('com outro humano na mesa, nao da para pular', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'A');
    const b = autoPlayer(lobby, 'B');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, maxPlayers: 3 } });
    const roomId = [...lobby.rooms.keys()][0];
    b.conn.handle({ type: 'joinRoom', roomId });
    a.conn.handle({ type: 'startGame' });
    await runUntil(() => a.views.length > 0);
    a.conn.handle({ type: 'skipHand' });
    expect(a.errors.some((e) => e.includes('contra bots'))).toBe(true);
  });

  it('rejeita ação fora da vez', () => {
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    a.conn.handle({ type: 'action', action: { type: 'call' } });
    expect(a.errors.length).toBe(1);
  });
});

describe('modo normal (rodadas fixas)', () => {
  it('termina no número de rodadas contratado e mostra o placar', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    // passa ou desiste, nunca paga: contra bots, quebrar encerra a partida — e pagar um all-in na
    // primeira mão acabava com ela antes das três rodadas, conforme o baralho
    const p = autoPlayer(lobby, 'Tester', (v) => (v.legal!.canCheck ? { type: 'check' } : { type: 'fold' }));
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 3, maxPlayers: 4, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 3; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    expect(p.events.filter((e) => e === 'handStart').length).toBe(3);
    for (const v of p.views) expect(totalChips(v)).toBe(4000);
    // a view diz de quantas rodadas é a partida (para o placar da tela)
    expect(p.views[p.views.length - 1].rounds).toBe(3);
    expect(p.errors).toEqual([]);

    // nada mais acontece depois do fim
    const after = p.events.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(p.events.length).toBe(after);
  }, 30_000);

  it('blinds não sobem e quem quebra é eliminado (sem rebuy)', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    // humano all-in sempre: quebra rápido contra os bots
    const p = autoPlayer(lobby, 'Tester', () => ({ type: 'allin' }));
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 20, maxPlayers: 3, startingStack: 300, smallBlind: 25, bigBlind: 50, blindLevelHands: 2 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    expect(p.events).not.toContain('blindsUp');
    expect(p.events).not.toContain('rebuy');
    const last = p.views[p.views.length - 1];
    expect(last.smallBlind).toBe(25);
    expect(last.bigBlind).toBe(50);
  }, 30_000);
});

describe('poker de 5 cartas (draw) na sala', () => {
  it('cinco cartas, troca no meio e mão terminada', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester', passive, [0, 2]);
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, variant: 'draw5', mode: 'normal', rounds: 2, maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    expect(p.errors).toEqual([]);
    // a mesa nunca teve bordo e a mão tem cinco cartas
    for (const v of p.views) {
      expect(v.variant).toBe('draw5');
      expect(v.board).toEqual([]);
      const me = v.mySeat !== null ? v.seats[v.mySeat] : null;
      if (me?.inHand && !me.folded && me.cards.length) expect(me.cards).toHaveLength(5);
    }
    // houve vez de trocar, troca de fato e a contagem apareceu na view
    expect(p.events).toContain('drawTurn');
    expect(p.events).toContain('draw');
    expect(p.views.some((v) => v.seats.some((x) => typeof x?.drew === 'number'))).toBe(true);
    // eu troquei duas cartas quando foi a minha vez
    expect(p.views.some((v) => v.mySeat !== null && v.seats[v.mySeat]?.drew === 2)).toBe(true);
    expect(p.events).toContain('win');
    for (const v of p.views) expect(totalChips(v)).toBe(3000);
  }, 30_000);

  it('apostar na hora da troca (e trocar fora dela) é recusado', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester', passive);
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, variant: 'draw5', maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    // fora da fase de troca, o pedido é recusado
    await runUntil(() => p.views.length > 0);
    p.conn.handle({ type: 'draw', discards: [0] });
    expect(p.errors.some((e) => e.includes('trocar cartas') || e.includes('sua vez'))).toBe(true);

    // na vez de trocar, apostar é recusado
    const before = p.errors.length;
    await runUntil(() => p.views.some((v) => v.street === 'draw' && v.toAct === v.mySeat));
    p.conn.handle({ type: 'action', action: { type: 'check' } });
    expect(p.errors.length).toBeGreaterThan(before);
  }, 30_000);
});

/**
 * Bots com acessórios (shared/aposta.ts). As chances saem de `Math.random`: um em cada quatro bots
 * senta com alguma peça (`BOT_COM_ACESSORIO`) e, sem fichas, aposta uma delas uma vez em dez
 * (`BOT_APOSTA`). Os testes fixam o acaso de um lado ou do outro da chance; o resto do jogo dos bots
 * continua ao acaso, só que dentro dessa faixa. (O baralho não muda: ele é embaralhado com `crypto`.)
 */
describe('bots com acessórios', () => {
  /** Todo sorteio dá abaixo de `teto`: a chance a favor. */
  function acasoAbaixoDe(teto: number): void {
    acaso = vi.spyOn(Math, 'random').mockImplementation(() => acasoDeVerdade() * teto);
  }
  /** Todo sorteio dá de `piso` para cima: a chance contra. */
  function acasoAPartirDe(piso: number): void {
    acaso = vi.spyOn(Math, 'random').mockImplementation(() => Math.min(0.999999, piso + acasoDeVerdade() * (1 - piso)));
  }
  /** O acaso num número só. */
  function acasoFixo(valor: number): void {
    acaso = vi.spyOn(Math, 'random').mockReturnValue(valor);
  }
  const A_FAVOR = Math.min(BOT_COM_ACESSORIO, BOT_APOSTA);
  const CONTRA = Math.max(BOT_COM_ACESSORIO, BOT_APOSTA);

  /** As peças que alguém está usando (braços e anéis), sem repetição. */
  const pecasDe = (a: Acessorios | undefined): string[] => (a ? [...new Set([...a.bracos.E, ...a.bracos.D, ...a.aneis.map((x) => x.id)])] : []);

  interface Olheiro {
    conn: Connection;
    eventos: TableEvent[];
    visoes: TableView[];
    erros: string[];
  }

  /** Uma pessoa sem acessório nenhum, que só olha: passa quando pode e desiste do resto. */
  function olheiro(lobby: Lobby): Olheiro {
    const o: Olheiro = { conn: null as unknown as Connection, eventos: [], visoes: [], erros: [] };
    o.conn = lobby.connect((m: ServerMsg) => {
      if (m.type === 'error') o.erros.push(m.message);
      if (m.type !== 'event') return;
      o.eventos.push(m.ev);
      o.visoes.push(m.view);
      if (m.ev.t === 'turn' && m.view.legal && m.view.toAct === m.view.mySeat) {
        const action: PlayerAction = m.view.legal.canCheck ? { type: 'check' } : { type: 'fold' };
        setTimeout(() => o.conn.handle({ type: 'action', action }), 5);
      }
    });
    o.conn.handle({ type: 'hello', name: 'Olheiro', avatar: {}, cosmetics: {} });
    return o;
  }

  /** A sala do lobby, por dentro (os testes abrem uma só). */
  const salaDe = (lobby: Lobby) => [...lobby.rooms.values()][0];
  const botsDe = (lobby: Lobby) => salaDe(lobby).seats.filter((m) => !!m && m.isBot).map((m) => m!);

  /**
   * Um Sit & Go de três bots (e o olheiro), todos os bots com peça: sentam com a chance a favor, e a
   * partida corre com o acaso que `noJogo` fixar.
   */
  function partidaDeBots(regras: Partial<RoomSettings>, noJogo: () => void) {
    const lobby = new Lobby('teste');
    const o = olheiro(lobby);
    o.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'sitgo', maxPlayers: 4, startingStack: 1000, smallBlind: 25, bigBlind: 50, blindLevelHands: 3, ...regras },
    });
    acasoAbaixoDe(A_FAVOR);
    for (let i = 0; i < 3; i++) o.conn.handle({ type: 'addBot', difficulty: 'easy' });
    const bots = botsDe(lobby);
    /** O que cada bot tinha ao sentar, por assento. */
    const aoSentar = new Map(bots.map((b) => [b.seat, pecasDe(b.cosmetics.acessorios)]));
    for (const [seat, pecas] of aoSentar) expect(pecas.length, `assento ${seat}`).toBeGreaterThan(0);
    noJogo();
    o.conn.handle({ type: 'startGame' });
    return { lobby, o, bots, aoSentar };
  }

  const eBot = (o: Olheiro, seat: number) => !!o.visoes[0]?.seats[seat]?.isBot;

  it('com o acaso baixo o bot senta com alguma peça — só das que a loja vende, e todas das que se apostam', () => {
    const lobby = new Lobby('teste');
    const o = olheiro(lobby);
    o.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const vistas = new Set<string>();
    for (let n = 0; n < 80; n++) {
      // a primeira consulta é "vem com peça?" (um pouco abaixo da chance); as outras — que peça, em que mão — ficam ao acaso de verdade
      let consulta = 0;
      acaso = vi.spyOn(Math, 'random').mockImplementation(() => (consulta++ === 0 ? BOT_COM_ACESSORIO - 0.001 : acasoDeVerdade()));
      o.conn.handle({ type: 'addBot', difficulty: 'easy' });
      const [bot] = botsDe(lobby);
      const pecas = pecasDe(bot.cosmetics.acessorios);
      expect(pecas.length).toBeGreaterThan(0);
      for (const id of pecas) {
        expect(estaAVenda(chaveDoItem(id)), id).toBe(true);
        expect(podeApostar(id), id).toBe(true);
        vistas.add(id);
      }
      // tudo o que ele usa é peça de apostar: nem esmalte nem luva
      expect(apostaveis(bot.cosmetics.acessorios).sort()).toEqual([...pecas].sort());
      // uma peça no pulso esquerdo, ou um anel no anelar — ou os dois
      expect(bot.cosmetics.acessorios!.bracos.D).toEqual([]);
      expect(bot.cosmetics.acessorios!.bracos.E.length).toBeLessThanOrEqual(1);
      expect(bot.cosmetics.acessorios!.aneis.length).toBeLessThanOrEqual(1);
      for (const anel of bot.cosmetics.acessorios!.aneis) expect(anel.dedo).toBe(2);
      o.conn.handle({ type: 'removeBot', seat: bot.seat });
      expect(botsDe(lobby)).toHaveLength(0);
    }
    // (o sorteio da peça não está preso numa só)
    expect(vistas.size).toBeGreaterThan(3);
    expect(o.erros).toEqual([]);
  });

  it('a chance de vir com peça é BOT_COM_ACESSORIO: abaixo dela vem com alguma, dela para cima vem sem nenhuma', () => {
    expect(BOT_COM_ACESSORIO).toBe(0.25);
    const lobby = new Lobby('teste');
    const o = olheiro(lobby);
    o.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const senta = (valor: number) => {
      acasoFixo(valor);
      o.conn.handle({ type: 'addBot', difficulty: 'easy' });
      const [bot] = botsDe(lobby);
      const acessorios = bot.cosmetics.acessorios;
      o.conn.handle({ type: 'removeBot', seat: bot.seat });
      return acessorios;
    };
    for (const baixo of [0, 0.1, BOT_COM_ACESSORIO - 0.0001]) {
      const pecas = pecasDe(senta(baixo));
      expect(pecas.length, String(baixo)).toBeGreaterThan(0);
      for (const id of pecas) expect(estaAVenda(chaveDoItem(id)), id).toBe(true);
    }
    // sem peça nenhuma: o bot nem leva a lista de acessórios
    for (const alto of [BOT_COM_ACESSORIO, 0.5, 0.999]) expect(senta(alto), String(alto)).toBeUndefined();
    expect(o.erros).toEqual([]);
  });

  it('mesa cheia de bots: com o acaso baixo todos vêm com peça; com o acaso alto, nenhum', () => {
    const lobby = new Lobby('teste');
    const o = olheiro(lobby);
    o.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    acasoAbaixoDe(BOT_COM_ACESSORIO);
    for (let i = 0; i < 5; i++) o.conn.handle({ type: 'addBot', difficulty: 'easy' });
    expect(botsDe(lobby)).toHaveLength(5);
    for (const b of botsDe(lobby)) {
      expect(pecasDe(b.cosmetics.acessorios).length, b.name).toBeGreaterThan(0);
      for (const id of pecasDe(b.cosmetics.acessorios)) expect(estaAVenda(chaveDoItem(id)), id).toBe(true);
    }
    for (const b of botsDe(lobby)) o.conn.handle({ type: 'removeBot', seat: b.seat });
    acasoAPartirDe(BOT_COM_ACESSORIO);
    for (let i = 0; i < 5; i++) o.conn.handle({ type: 'addBot', difficulty: 'easy' });
    expect(botsDe(lobby)).toHaveLength(5);
    for (const b of botsDe(lobby)) expect(pecasDe(b.cosmetics.acessorios), b.name).toEqual([]);
    expect(o.erros).toEqual([]);
  });

  it('partida fechada, chance a favor: o bot com peça que zera entra na mão seguinte all-in com ela, e a peça aparece na mesa', async () => {
    vi.useFakeTimers();
    expect(BOT_APOSTA).toBe(0.1);
    const { o, bots, aoSentar } = partidaDeBots({}, () => acasoAbaixoDe(BOT_APOSTA));
    const entradas = () => o.eventos.filter((e) => e.t === 'entradaComItem');
    await runUntil(() => entradas().length > 0 || o.eventos.some((e) => e.t === 'gameOver'));
    const entrada = entradas()[0];
    expect(entrada).toBeTruthy();
    if (entrada.t !== 'entradaComItem') throw new Error('sem entrada');
    const i = o.eventos.indexOf(entrada);
    const bot = bots.find((b) => b.seat === entrada.seat)!;
    // foi um bot que ficou sem fichas, com uma peça das dele — pelo valor dela nos blinds daquela hora
    expect(bot).toBeTruthy();
    expect(aoSentar.get(entrada.seat)).toContain(entrada.item);
    expect(o.visoes[i].seats[entrada.seat]).toMatchObject({ isBot: true, stack: 0, busted: false });
    expect(entrada.valor).toBe(valorDaAposta(entrada.item, o.visoes[i].bigBlind));
    // não foi eliminado: nenhum bot cai enquanto tiver peça e a chance a favor
    expect(o.eventos.slice(0, i).some((e) => e.t === 'bust' && eBot(o, e.seat))).toBe(false);

    // na mão seguinte: a aposta dele é a peça, que sai das mãos para a mesa
    const iAposta = () => o.eventos.findIndex((e, k) => k > i && e.t === 'action' && !!e.item && e.seat === entrada.seat);
    await runUntil(() => iAposta() >= 0);
    const aposta = o.eventos[iAposta()];
    expect(aposta).toMatchObject({ t: 'action', seat: entrada.seat, action: 'allin', amount: 0, item: { id: entrada.item } });
    const naMesa = o.visoes[iAposta()];
    // (pelo valor dito quando ele aceitou: se os blinds subiram de uma mão para a outra, o combinado não muda)
    const valor = entrada.valor;
    expect(aposta).toMatchObject({ item: { valor } });
    expect(naMesa.itens).toContainEqual(expect.objectContaining({ seat: entrada.seat, id: entrada.item, valor }));
    expect(usando(naMesa.seats[entrada.seat]!.cosmetics.acessorios, entrada.item)).toBe(false);
    // (até anunciar a aposta, a peça ainda estava com ele)
    expect(usando(o.visoes[iAposta() - 1].seats[entrada.seat]!.cosmetics.acessorios, entrada.item)).toBe(true);
    expect(o.eventos.slice(0, iAposta()).some((e) => e.t === 'bust' && e.seat === entrada.seat)).toBe(false);
    // e as fichas se conservam, com a peça na conta da aposta e do pote sem ser ficha
    for (const v of o.visoes) expect(totalChips(v)).toBe(4000);
    expect(o.erros).toEqual([]);
  }, 60_000);

  it('partida fechada, chance contra: o bot com peça que zera é eliminado, e fica com a peça', async () => {
    vi.useFakeTimers();
    const { o, bots, aoSentar } = partidaDeBots({}, () => acasoAPartirDe(CONTRA));
    const quedas = () => o.eventos.filter((e) => e.t === 'bust' && eBot(o, e.seat));
    await runUntil(() => quedas().length > 0 || o.eventos.some((e) => e.t === 'gameOver'));
    const queda = quedas()[0];
    expect(queda).toBeTruthy();
    if (queda.t !== 'bust') throw new Error('sem eliminação');
    const i = o.eventos.indexOf(queda);
    expect(o.visoes[i].seats[queda.seat]).toMatchObject({ isBot: true, stack: 0, busted: true });
    // tinha o que apostar, e não apostou: nenhuma entrada com peça, nenhuma peça na mesa
    const bot = bots.find((b) => b.seat === queda.seat)!;
    expect(aoSentar.get(queda.seat)!.length).toBeGreaterThan(0);
    expect(pecasDe(bot.cosmetics.acessorios)).toEqual(aoSentar.get(queda.seat));
    expect(o.eventos.some((e) => e.t === 'entradaComItem')).toBe(false);
    expect(o.eventos.some((e) => e.t === 'action' && !!e.item)).toBe(false);
    for (const v of o.visoes) {
      expect(v.itens).toEqual([]);
      expect(totalChips(v)).toBe(4000);
    }
    expect(o.erros).toEqual([]);
  }, 60_000);

  it('na mesa que não deixa apostar (apostaDeItens: false), o bot com peça que zera é eliminado mesmo com a chance a favor', async () => {
    vi.useFakeTimers();
    const { lobby, o, aoSentar } = partidaDeBots({ apostaDeItens: false }, () => acasoAbaixoDe(BOT_APOSTA));
    expect(salaDe(lobby).settings.apostaDeItens).toBe(false);
    const quedas = () => o.eventos.filter((e) => e.t === 'bust' && eBot(o, e.seat));
    await runUntil(() => quedas().length > 0 || o.eventos.some((e) => e.t === 'gameOver'));
    const queda = quedas()[0];
    expect(queda).toBeTruthy();
    if (queda.t !== 'bust') throw new Error('sem eliminação');
    expect(aoSentar.get(queda.seat)!.length).toBeGreaterThan(0);
    expect(o.eventos.some((e) => e.t === 'entradaComItem')).toBe(false);
    expect(o.eventos.some((e) => e.t === 'action' && !!e.item)).toBe(false);
    for (const v of o.visoes) {
      expect(v.apostaDeItens).toBe(false);
      expect(v.apostaveis).toEqual([]);
      expect(v.itens).toEqual([]);
      expect(totalChips(v)).toBe(4000);
    }
    expect(o.erros).toEqual([]);
  }, 60_000);

  /*
   * Paga a mão, o motor zera o pote mas a peça continua na mesa (vai para quem ganhou): a foto do `win`
   * sai com `pot: 0`, e a parte da peça que conta (`emJogo`) tem de sair zerada também — quem a desconta
   * do pote para desenhar as fichas não pode chegar a um número negativo.
   */
  it('a peça nunca conta mais do que há nas apostas e no pote — nem na foto do `win`, com o pote já pago', async () => {
    vi.useFakeTimers();
    const { o } = partidaDeBots({}, () => acasoAbaixoDe(BOT_APOSTA));
    // até o fim de uma mão em que um bot entrou com peça
    const iAposta = () => o.eventos.findIndex((e) => e.t === 'action' && !!e.item);
    const iFim = () => o.eventos.findIndex((e, k) => iAposta() >= 0 && k > iAposta() && e.t === 'handEnd');
    await runUntil(() => iFim() >= 0 || o.eventos.some((e) => e.t === 'gameOver'));
    expect(iFim()).toBeGreaterThan(0);
    for (const [k, v] of o.visoes.entries()) {
      const naMesa = v.seats.reduce((s, x) => s + (x ? x.bet : 0), 0) + v.pot;
      expect(pecasEmJogo(v), `foto ${k} (${o.eventos[k].t})`).toBeLessThanOrEqual(naMesa);
    }
  }, 60_000);

  it('partida inteira com os bots apostando peças termina, e conserva as fichas descontando o que é peça', async () => {
    vi.useFakeTimers();
    const { o } = partidaDeBots({}, () => acasoAbaixoDe(BOT_APOSTA));
    await runUntil(() => o.eventos.some((e) => e.t === 'gameOver'));
    expect(o.eventos.some((e) => e.t === 'gameOver')).toBe(true);
    expect(o.eventos.some((e) => e.t === 'entradaComItem')).toBe(true);
    for (const v of o.visoes) expect(totalChips(v)).toBe(4000);
    // houve peça contada na aposta ou no pote: sem o desconto, a conta das fichas não fecharia
    expect(o.visoes.some((v) => (v.itens ?? []).some((i) => i.emJogo > 0))).toBe(true);
    // no fim não sobra peça na mesa, e as fichas estão todas nas pilhas
    const ultima = o.visoes.at(-1)!;
    expect(ultima.itens).toEqual([]);
    expect(ultima.seats.reduce((s, x) => s + (x?.stack ?? 0), 0)).toBe(4000);
    expect(o.erros).toEqual([]);
  }, 120_000);
});

describe('as regras da sala: acessório como aposta', () => {
  it('sem o campo, vale; só `false` desliga', () => {
    expect('apostaDeItens' in DEFAULT_SETTINGS).toBe(false);
    expect(sanitizeSettings(undefined).apostaDeItens).toBe(true);
    expect(sanitizeSettings({}).apostaDeItens).toBe(true);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS }).apostaDeItens).toBe(true);
    expect(sanitizeSettings({ apostaDeItens: true }).apostaDeItens).toBe(true);
    expect(sanitizeSettings({ apostaDeItens: false }).apostaDeItens).toBe(false);
    // (o que não é `false` de verdade não desliga: um cliente antigo ou torto não tira a regra da mesa)
    expect(sanitizeSettings({ apostaDeItens: undefined }).apostaDeItens).toBe(true);
    expect(sanitizeSettings({ apostaDeItens: 0 as never }).apostaDeItens).toBe(true);
  });

  it('a sala criada sem o campo diz na mesa que vale; criada com `false`, que não', async () => {
    vi.useFakeTimers();
    for (const [regra, esperado] of [[undefined, true], [true, true], [false, false]] as const) {
      const lobby = new Lobby('teste');
      const p = autoPlayer(lobby, 'Tester', passive);
      p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, maxPlayers: 2, ...(regra === undefined ? {} : { apostaDeItens: regra }) } });
      p.conn.handle({ type: 'addBot', difficulty: 'easy' });
      p.conn.handle({ type: 'startGame' });
      await runUntil(() => p.views.length > 0);
      expect(p.views.length).toBeGreaterThan(0);
      for (const v of p.views) expect(v.apostaDeItens, String(regra)).toBe(esperado);
      expect(p.views[0].apostaDeItens !== false).toBe(esperado);
      p.conn.handle({ type: 'leaveRoom' });
    }
  });
});
