import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEM_ACESSORIOS, type Acessorios } from '../shared/acessorios';
import { BOT_APOSTA, BOT_COM_ACESSORIO, usando } from '../shared/aposta';
import { PRECO_DO_ACESSORIO, marcaDePerdido, quantasTem } from '../shared/catalog';
import { Lobby, type Connection } from '../shared/lobby';
import { DEFAULT_SETTINGS, type RoomSettings, type ServerMsg, type TableEvent, type TableView } from '../shared/protocol';
import type { Room } from '../shared/room';
import { Accounts } from './accounts';

/**
 * Apostar um acessório, com contas de verdade: a peça sai das mãos, fica na mesa, e no fim da mão é
 * de quem ganhou — na conta, não só na tela. (As contas das fichas estão em shared/aposta.test.ts.)
 */

const RELOGIO = 'relogio-esportivo';
const CHAVE = 'acessorio:' + RELOGIO;
/** A aliança lisa: a peça de início, que toda conta tem sem estar na lista (veja `DE_INICIO` em shared/catalog.ts). */
const ALIANCA = 'anel-alianca';
const CHAVE_DA_ALIANCA = 'acessorio:' + ALIANCA;
const PERDEU_A_ALIANCA = marcaDePerdido(CHAVE_DA_ALIANCA);

/** O acaso de verdade, guardado antes de qualquer espião. */
const acasoDeVerdade = Math.random.bind(Math);
let acaso: ReturnType<typeof vi.spyOn> | null = null;
/**
 * Fixa o acaso do lado do "não": todo sorteio dá da chance para cima — o bot senta sem peça nenhuma
 * e, sem fichas, não aposta por sorte. (O resto do jogo dos bots continua ao acaso, só que nessa faixa.)
 */
function acasoContra(): void {
  const piso = Math.max(BOT_COM_ACESSORIO, BOT_APOSTA);
  acaso = vi.spyOn(Math, 'random').mockImplementation(() => Math.min(0.999999, piso + acasoDeVerdade() * (1 - piso)));
}

const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  acaso?.mockRestore();
  acaso = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function contas(): Accounts {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-'));
  dirs.push(dir);
  return new Accounts({ file: join(dir, 'accounts.json'), startingMoney: 5000, faucet: 0 });
}

interface Jogador {
  conn: Connection;
  id: string;
  eventos: TableEvent[];
  visoes: TableView[];
  erros: string[];
  conversa: string[];
}

/** Um jogador que, na vez dele, faz o que `naVez` mandar (e, sem fichas, responde à oferta com `naOferta`). */
function jogador(lobby: Lobby, nome: string, naVez: (v: TableView, j: Jogador) => void, naOferta?: (v: TableView, j: Jogador) => void): Jogador {
  const j: Jogador = { conn: null as unknown as Connection, id: '', eventos: [], visoes: [], erros: [], conversa: [] };
  j.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'account') j.id = m.account.id;
    if (m.type === 'error') j.erros.push(m.message);
    if (m.type === 'chat') j.conversa.push(m.text);
    if (m.type === 'opening') setTimeout(() => j.conn.handle({ type: 'ready' }), 5);
    if (m.type !== 'event') return;
    j.eventos.push(m.ev);
    j.visoes.push(m.view);
    const v = m.view;
    if (m.ev.t === 'turn' && v.legal && v.toAct === v.mySeat) setTimeout(() => naVez(v, j), 5);
    if (m.ev.t === 'ofertaItem' && m.ev.seat === v.mySeat) setTimeout(() => naOferta?.(v, j), 5);
  });
  j.conn.handle({ type: 'hello', name: nome, avatar: {}, cosmetics: {} });
  return j;
}

/** Dá a peça à conta e a põe no pulso esquerdo do jogador. */
function vestir(acc: Accounts, j: Jogador, nome: string) {
  const dentro = acc as unknown as { byId(id: string): { owned: string[] }; changed(id: string): void };
  dentro.byId(j.id).owned.push(CHAVE);
  // (avisa o lobby, como uma compra avisaria: é ele que sabe o que a conta tem)
  dentro.changed(j.id);
  j.conn.handle({ type: 'updateProfile', name: nome, avatar: {}, cosmetics: { acessorios: { ...SEM_ACESSORIOS, bracos: { E: [RELOGIO], D: [] } } } as never });
}

/** Põe estes acessórios nas mãos do jogador (o servidor corta o que a conta não tem). */
function usar(j: Jogador, nome: string, acessorios: Partial<Acessorios>) {
  j.conn.handle({ type: 'updateProfile', name: nome, avatar: {}, cosmetics: { acessorios: { ...SEM_ACESSORIOS, ...acessorios } } as never });
}

async function ate(cond: () => boolean, maxMs = 600_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) {
    await vi.advanceTimersByTimeAsync(250);
    // (o espião guarda cada chamada, e os bots sorteiam aos milhares: esvazia para não juntar)
    acaso?.mockClear();
  }
}

const paga = (v: TableView, j: Jogador) => j.conn.handle({ type: 'action', action: v.legal!.canCheck ? { type: 'check' } : { type: 'call' } });
const tudo = (_v: TableView, j: Jogador) => j.conn.handle({ type: 'action', action: { type: 'allin' } });
const noPulso = (v: TableView, seat: number) => v.seats[seat]?.cosmetics.acessorios?.bracos.E[0] ?? null;
const aneisDe = (v: TableView, seat: number) => (v.seats[seat]?.cosmetics.acessorios?.aneis ?? []).map((x) => x.id);
const fim = (j: Jogador, t: TableEvent['t']) => j.eventos.some((e) => e.t === t);
const quantos = (j: Jogador, t: TableEvent['t']) => j.eventos.filter((e) => e.t === t).length;
/** As peças que mudaram (ou não) de mãos no fim das mãos que o jogador viu. */
const ganhos = (j: Jogador) => j.eventos.flatMap((e) => (e.t === 'win' ? e.pots.flatMap((p) => p.itens ?? []) : []));

/** A mesa dos testes: um Sit & Go mano a mano, rápido, de blinds 10/20 que não sobem. */
const MANO_A_MANO: RoomSettings = { ...DEFAULT_SETTINGS, pace: 0.2, turnTime: 5, mode: 'sitgo', maxPlayers: 2, startingStack: 1000, smallBlind: 10, bigBlind: 20, blindLevelHands: 50 };

describe('apostar um acessório, com contas', () => {
  it('a peça sai da mão de quem apostou, fica na mesa, e no fim é de quem ganhou — numa conta só', async () => {
    vi.useFakeTimers();
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    let apostou = false;
    // a Ana aposta o relógio na primeira vez dela; depois só paga. O Beto paga tudo.
    const a = jogador(lobby, 'Ana', (v, j) => {
      if (!apostou && v.apostaveis?.some((p) => p.id === RELOGIO)) {
        apostou = true;
        j.conn.handle({ type: 'apostarItem', item: RELOGIO });
      } else paga(v, j);
    });
    const b = jogador(lobby, 'Beto', paga);
    await vi.advanceTimersByTimeAsync(50);
    vestir(acc, a, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, pace: 0.2, turnTime: 5, mode: 'sitgo', maxPlayers: 2, startingStack: 1000, smallBlind: 10, bigBlind: 20, blindLevelHands: 50 } });
    await vi.advanceTimersByTimeAsync(50);
    b.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
    await vi.advanceTimersByTimeAsync(50);
    a.conn.handle({ type: 'startGame' });

    await ate(() => apostou && a.eventos.filter((e) => e.t === 'handEnd').length >= 1);
    expect(a.erros).toEqual([]);
    expect(b.erros).toEqual([]);

    // a aposta: uma ação com o acessório, que vale 6 big blinds (é raro)
    const aposta = a.eventos.find((e) => e.t === 'action' && !!e.item);
    expect(aposta).toMatchObject({ t: 'action', item: { id: RELOGIO, valor: 120 } });
    const meuAssento = a.visoes[0].mySeat!;
    // enquanto a mão corria, o relógio estava na mesa e fora do pulso dela
    const durante = a.visoes.filter((v) => v.itens?.some((i) => i.id === RELOGIO));
    expect(durante.length).toBeGreaterThan(0);
    for (const v of durante) {
      expect(noPulso(v, meuAssento)).toBeNull();
      expect(v.itens).toMatchObject([{ seat: meuAssento, id: RELOGIO, valor: 120 }]);
    }
    // no fim: ou voltou para ela (e para o pulso), ou é do Beto (e ela não tem mais)
    const ganho = a.eventos.flatMap((e) => (e.t === 'win' ? e.pots.flatMap((p) => p.itens ?? []) : []))[0];
    expect(ganho).toBeTruthy();
    const depois = a.visoes.at(-1)!;
    expect(depois.itens).toEqual([]);
    if (ganho.para === meuAssento) {
      expect(acc.owned(a.id)).toContain(CHAVE);
      expect(acc.owned(b.id)).not.toContain(CHAVE);
      expect(noPulso(depois, meuAssento)).toBe(RELOGIO);
    } else {
      expect(acc.owned(a.id)).not.toContain(CHAVE);
      expect(acc.owned(b.id)).toContain(CHAVE);
      expect(noPulso(depois, meuAssento)).toBeNull();
      expect(a.conversa.some((t) => t.includes('ficou com'))).toBe(true);
    }
  }, 30_000);

  it('quem ganha uma peça que já tem fica com mais uma (as joias se contam); o que um bot ganha sai da conta de quem perdeu; o que vem de graça com o jogo não troca de dono', () => {
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby, 'Ana', () => {});
    const b = jogador(lobby, 'Beto', () => {});
    const dar = (j: Jogador) => (acc as unknown as { byId(id: string): { owned: string[] } }).byId(j.id).owned.push(CHAVE);
    dar(a);
    dar(b);
    const antes = acc.money(b.id);
    expect(acc.transferirItem(a.id, b.id, CHAVE)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).not.toContain(CHAVE);
    expect(acc.owned(b.id).filter((k) => k === CHAVE)).toHaveLength(2);
    expect(acc.money(b.id)).toBe(antes);
    // para um bot (sem conta): a peça sai de quem perdeu — uma — e não entra em conta nenhuma (fica com o bot, na mesa)
    expect(acc.transferirItem(b.id, undefined, CHAVE)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(b.id).filter((k) => k === CHAVE)).toHaveLength(1);
    expect(acc.transferirItem(b.id, undefined, CHAVE)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(b.id)).not.toContain(CHAVE);
    // quem não tem a peça não a perde nem a entrega
    expect(acc.transferirItem(a.id, b.id, CHAVE)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(b.id)).not.toContain(CHAVE);
    expect(acc.temItem(a.id, CHAVE)).toBe(false);
    // e o que vem de graça com o jogo não troca de dono, nem vira reembolso
    // (a aliança lisa não é mais desse grupo: é de início, e troca — veja "a aliança de início, nas contas")
    const saldos = [acc.money(a.id), acc.money(b.id)];
    for (const gratis of ['acessorio:luva-traje', 'acessorio:esmalte-natural']) {
      expect(acc.transferirItem(a.id, b.id, gratis), gratis).toEqual({ repetido: false, reembolso: 0 });
      expect(acc.transferirItem(undefined, b.id, gratis), gratis).toEqual({ repetido: false, reembolso: 0 });
    }
    expect([acc.money(a.id), acc.money(b.id)]).toEqual(saldos);
    expect(acc.owned(a.id)).toEqual([]);
    expect(acc.owned(b.id)).toEqual([]);
    // nem o que não é acessório, ou não existe
    expect(acc.transferirItem(undefined, b.id, 'character:yukina')).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.transferirItem(undefined, b.id, 'acessorio:inventado')).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(b.id)).toEqual([]);
  });

  it('de um bot (que não tem conta), a peça entra na conta de quem a ganhou', () => {
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby, 'Ana', () => {});
    expect(acc.temItem(a.id, CHAVE)).toBe(false);
    expect(acc.transferirItem(undefined, a.id, CHAVE)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([CHAVE]);
    expect(acc.temItem(a.id, CHAVE)).toBe(true);
    // a segunda, do mesmo jeito, é mais uma: a conta passa a ter duas
    const antes = acc.money(a.id);
    expect(acc.transferirItem(undefined, a.id, CHAVE)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([CHAVE, CHAVE]);
    expect(quantasTem(acc.owned(a.id), CHAVE)).toBe(2);
    expect(acc.money(a.id)).toBe(antes);
  });

  it('sem fichas, a mesa pergunta; apostar o acessório é entrar na mão seguinte all-in com ele', async () => {
    vi.useFakeTimers();
    // a Ana vai de all-in sempre e o Beto paga: em algumas partidas ela quebra primeiro
    let viu = false;
    for (let tentativa = 0; tentativa < 40 && !viu; tentativa++) {
      const acc = contas();
      const lobby = new Lobby('teste', acc);
      const a = jogador(lobby, 'Ana', tudo, (v, j) => {
        expect(v.oferta?.itens).toEqual([{ id: RELOGIO, valor: expect.any(Number) }]);
        j.conn.handle({ type: 'entrarComItem', item: RELOGIO });
      });
      const b = jogador(lobby, 'Beto', paga);
      await vi.advanceTimersByTimeAsync(50);
      vestir(acc, a, 'Ana');
      a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, pace: 0.2, turnTime: 5, mode: 'sitgo', maxPlayers: 2, startingStack: 1000, smallBlind: 10, bigBlind: 20, blindLevelHands: 50 } });
      await vi.advanceTimersByTimeAsync(50);
      b.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
      await vi.advanceTimersByTimeAsync(50);
      a.conn.handle({ type: 'startGame' });
      await ate(() => fim(a, 'gameOver') || fim(a, 'entradaComItem'));
      if (!fim(a, 'entradaComItem')) continue;
      viu = true;
      // ela não foi eliminada: entra na mão seguinte sem fichas, all-in com o relógio
      expect(a.eventos.some((e) => e.t === 'bust')).toBe(false);
      await ate(() => a.eventos.some((e) => e.t === 'action' && !!e.item));
      const entrada = a.eventos.find((e) => e.t === 'action' && !!e.item);
      const eu = a.visoes[0].mySeat!;
      expect(entrada).toMatchObject({ seat: eu, action: 'allin', amount: 0, item: { id: RELOGIO } });
      await ate(() => fim(a, 'gameOver') || a.eventos.filter((e) => e.t === 'handEnd').length >= 2);
      expect(a.erros).toEqual([]);
      expect(b.erros).toEqual([]);
      // o relógio está numa conta só
      const donos = [a, b].filter((j) => acc.owned(j.id).includes(CHAVE));
      expect(donos).toHaveLength(1);
    }
    expect(viu).toBe(true);
  }, 60_000);

  it('recusar a oferta (ou deixar o tempo passar) é ser eliminado, como antes', async () => {
    vi.useFakeTimers();
    for (const resposta of ['nao', 'tempo'] as const) {
      let viu = false;
      for (let tentativa = 0; tentativa < 40 && !viu; tentativa++) {
        const acc = contas();
        const lobby = new Lobby('teste', acc);
        const a = jogador(lobby, 'Ana', tudo, (_v, j) => {
          if (resposta === 'nao') j.conn.handle({ type: 'entrarComItem', item: null });
        });
        const b = jogador(lobby, 'Beto', paga);
        await vi.advanceTimersByTimeAsync(50);
        vestir(acc, a, 'Ana');
        a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, pace: 0.2, turnTime: 5, mode: 'sitgo', maxPlayers: 2, startingStack: 1000, smallBlind: 10, bigBlind: 20, blindLevelHands: 50 } });
        await vi.advanceTimersByTimeAsync(50);
        b.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
        await vi.advanceTimersByTimeAsync(50);
        a.conn.handle({ type: 'startGame' });
        await ate(() => fim(a, 'gameOver'));
        expect(fim(a, 'gameOver'), resposta).toBe(true);
        if (!fim(a, 'ofertaItem')) continue;
        viu = true;
        expect(a.eventos.some((e) => e.t === 'bust' && e.seat === a.visoes[0].mySeat)).toBe(true);
        // não apostou: o relógio continua dela
        expect(acc.owned(a.id)).toContain(CHAVE);
        expect(a.erros).toEqual([]);
      }
      expect(viu, resposta).toBe(true);
    }
  }, 90_000);
});

/**
 * A aliança lisa é **de início**: toda conta tem uma sem ela estar na lista do que foi ganho. Perdida
 * numa aposta, a lista ganha a marca de perdida; ganha de volta, a marca some. (A compra e a roleta
 * estão em server/shop.test.ts; a regra de `owns`, em shared/catalog.test.ts.)
 */
describe('a aliança de início, nas contas', () => {
  /** Duas contas novas, de quem acabou de entrar. */
  function duasContas() {
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby, 'Ana', () => {});
    const b = jogador(lobby, 'Beto', () => {});
    return { acc, lobby, a, b };
  }

  it('toda conta nova a tem, sem nada na lista', () => {
    const { acc, a, b } = duasContas();
    for (const j of [a, b]) {
      expect(acc.owned(j.id)).toEqual([]);
      expect(acc.temItem(j.id, CHAVE_DA_ALIANCA)).toBe(true);
    }
    // (e conta que não existe não tem nada)
    expect(acc.temItem('a-nao-existe', CHAVE_DA_ALIANCA)).toBe(false);
  });

  it('perder a aliança de início deixa a marca de perdida, e a conta deixa de tê-la', () => {
    const { acc, a, b } = duasContas();
    // para um bot: sai de quem perdeu e não entra em conta nenhuma
    expect(acc.transferirItem(a.id, undefined, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([PERDEU_A_ALIANCA]);
    expect(acc.info(a.id)!.owned).toEqual([PERDEU_A_ALIANCA]);
    expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(false);
    // a do outro não tem nada com isso
    expect(acc.owned(b.id)).toEqual([]);
    expect(acc.temItem(b.id, CHAVE_DA_ALIANCA)).toBe(true);
    // quem já não tem não perde de novo, nem entrega o que não tem: as marcas não se juntam e o outro não ganha nada
    const antes = acc.money(b.id);
    expect(acc.transferirItem(a.id, undefined, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.transferirItem(a.id, b.id, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([PERDEU_A_ALIANCA]);
    expect(acc.owned(b.id)).toEqual([]);
    expect(acc.money(b.id)).toBe(antes);
  });

  it('quem perdeu e ganha uma de volta apaga a marca — sem ficar com duplicata nem com reembolso', () => {
    const { acc, a, b } = duasContas();
    acc.transferirItem(a.id, undefined, CHAVE_DA_ALIANCA);
    expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(false);
    const saldo = acc.money(a.id);
    // o Beto aposta a dele e perde para a Ana
    expect(acc.transferirItem(b.id, a.id, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([]);
    expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(true);
    expect(acc.money(a.id)).toBe(saldo);
    // e a marca passou para quem perdeu agora
    expect(acc.owned(b.id)).toEqual([PERDEU_A_ALIANCA]);
    expect(acc.temItem(b.id, CHAVE_DA_ALIANCA)).toBe(false);
    // de um bot é a mesma coisa: a marca some, sem duplicata nem reembolso
    const saldoDoBeto = acc.money(b.id);
    expect(acc.transferirItem(undefined, b.id, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(b.id)).toEqual([]);
    expect(acc.temItem(b.id, CHAVE_DA_ALIANCA)).toBe(true);
    expect(acc.money(b.id)).toBe(saldoDoBeto);
  });

  it('quem ainda tem a de início e ganha outra fica com duas — sem reembolso', () => {
    const { acc, a, b } = duasContas();
    const saldo = acc.money(b.id);
    expect(acc.transferirItem(a.id, b.id, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.money(b.id)).toBe(saldo);
    // quem ganhou tem a de início e a ganha; quem perdeu fica com a marca
    expect(acc.owned(b.id)).toEqual([CHAVE_DA_ALIANCA]);
    expect(quantasTem(acc.owned(b.id), CHAVE_DA_ALIANCA)).toBe(2);
    expect(acc.owned(a.id)).toEqual([PERDEU_A_ALIANCA]);
    // a que vem de um bot também é mais uma
    expect(acc.transferirItem(undefined, b.id, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(quantasTem(acc.owned(b.id), CHAVE_DA_ALIANCA)).toBe(3);
    expect(acc.money(b.id)).toBe(saldo);
    // perdendo, sai primeiro uma das ganhas; a de início é a última a sair
    expect(acc.transferirItem(b.id, undefined, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.transferirItem(b.id, undefined, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(b.id)).toEqual([]);
    expect(acc.temItem(b.id, CHAVE_DA_ALIANCA)).toBe(true);
  });

  it('quem perdeu a de início e comprou outra: perde a comprada, e ganhando mais uma fica com ela', async () => {
    const { acc, a, b } = duasContas();
    acc.transferirItem(a.id, undefined, CHAVE_DA_ALIANCA);
    const saldo = acc.money(a.id);
    expect(await acc.buy(a.id, CHAVE_DA_ALIANCA, 'chips')).toBeNull();
    expect(acc.money(a.id)).toBe(saldo - PRECO_DO_ACESSORIO.comum);
    expect(acc.owned(a.id)).toEqual([PERDEU_A_ALIANCA, CHAVE_DA_ALIANCA]);
    expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(true);
    // a do Beto, ganha numa aposta, apaga a marca: ela volta a ter a de início, e fica com duas
    expect(acc.transferirItem(b.id, a.id, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([CHAVE_DA_ALIANCA]);
    expect(quantasTem(acc.owned(a.id), CHAVE_DA_ALIANCA)).toBe(2);
    // perde a comprada: sai da lista, e fica a de início
    expect(acc.transferirItem(a.id, undefined, CHAVE_DA_ALIANCA)).toEqual({ repetido: false, reembolso: 0 });
    expect(acc.owned(a.id)).toEqual([]);
    expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(true);
  });

  it('as joias se compram mais de uma vez: cada compra é mais uma peça', async () => {
    const { acc, a } = duasContas();
    const saldo = acc.money(a.id);
    expect(await acc.buy(a.id, CHAVE_DA_ALIANCA, 'chips')).toBeNull();
    expect(await acc.buy(a.id, CHAVE_DA_ALIANCA, 'chips')).toBeNull();
    expect(quantasTem(acc.owned(a.id), CHAVE_DA_ALIANCA)).toBe(3);
    expect(acc.money(a.id)).toBe(saldo - 2 * PRECO_DO_ACESSORIO.comum);
  });

  it('pelo lobby: quem a perde deixa de usá-la na mesa, e não a veste de novo; comprando outra, ela volta ao dedo', async () => {
    vi.useFakeTimers();
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby, 'Ana', () => {});
    await vi.advanceTimersByTimeAsync(50);
    const noDedo = { aneis: [{ id: ALIANCA, mao: 'E' as const, dedo: 2 }] };
    usar(a, 'Ana', noDedo);
    a.conn.handle({ type: 'createRoom', settings: MANO_A_MANO });
    await vi.advanceTimersByTimeAsync(50);
    const eu = () => salaAberta(lobby).seats.find((m) => m?.id === a.conn.id)!;
    // conta nova: a aliança é dela, e está no dedo
    expect(eu().cosmetics.acessorios?.aneis).toEqual(noDedo.aneis);

    // perdeu (para um bot, noutra mesa): a conta avisa o lobby, e a aliança sai do dedo
    acc.transferirItem(a.id, undefined, CHAVE_DA_ALIANCA);
    await vi.advanceTimersByTimeAsync(100);
    expect(eu().cosmetics.acessorios?.aneis).toEqual([]);
    // e um cliente que insiste em mandá-la no perfil não a põe de volta
    usar(a, 'Ana', noDedo);
    await vi.advanceTimersByTimeAsync(100);
    expect(eu().cosmetics.acessorios?.aneis).toEqual([]);

    // compra outra na loja: o preço de comum, e a que ela queria usar volta ao dedo
    const saldo = acc.money(a.id);
    a.conn.handle({ type: 'buy', item: CHAVE_DA_ALIANCA, currency: 'chips' });
    await vi.advanceTimersByTimeAsync(100);
    expect(a.erros).toEqual([]);
    expect(acc.money(a.id)).toBe(saldo - PRECO_DO_ACESSORIO.comum);
    expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(true);
    expect(eu().cosmetics.acessorios?.aneis).toEqual(noDedo.aneis);
  });

  it('na mesa: a aliança de início se aposta (vale 2 big blinds); perdida, deixa a marca em quem perdeu, e quem já tem a dele fica com duas', async () => {
    vi.useFakeTimers();
    // a Ana aposta a aliança e o Beto paga tudo: em algumas mãos é ele quem leva
    let perdeu = false;
    for (let tentativa = 0; tentativa < 40 && !perdeu; tentativa++) {
      const acc = contas();
      const lobby = new Lobby('teste', acc);
      let apostou = false;
      const a = jogador(lobby, 'Ana', (v, j) => {
        if (!apostou && v.apostaveis?.some((p) => p.id === ALIANCA)) {
          apostou = true;
          // (não há nada na lista da conta: a aliança é dela por ser de início)
          expect(v.apostaveis).toEqual([{ id: ALIANCA, valor: 40 }]);
          j.conn.handle({ type: 'apostarItem', item: ALIANCA });
        } else paga(v, j);
      });
      const b = jogador(lobby, 'Beto', paga);
      await vi.advanceTimersByTimeAsync(50);
      usar(a, 'Ana', { aneis: [{ id: ALIANCA, mao: 'D', dedo: 2 }] });
      a.conn.handle({ type: 'createRoom', settings: MANO_A_MANO });
      await vi.advanceTimersByTimeAsync(50);
      b.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
      await vi.advanceTimersByTimeAsync(50);
      const saldoDoBeto = acc.money(b.id);
      a.conn.handle({ type: 'startGame' });

      await ate(() => apostou && quantos(a, 'handEnd') >= 1);
      expect(a.erros).toEqual([]);
      expect(b.erros).toEqual([]);
      const eu = a.visoes[0].mySeat!;
      expect(a.eventos.find((e) => e.t === 'action' && !!e.item)).toMatchObject({ t: 'action', seat: eu, item: { id: ALIANCA, valor: 40 } });
      // enquanto a mão corria, a aliança estava na mesa e fora do dedo dela
      const durante = a.visoes.filter((v) => v.itens?.some((i) => i.id === ALIANCA));
      expect(durante.length).toBeGreaterThan(0);
      for (const v of durante) expect(aneisDe(v, eu)).toEqual([]);
      const ganho = ganhos(a)[0];
      expect(ganho).toMatchObject({ id: ALIANCA, de: eu });
      await vi.advanceTimersByTimeAsync(100);
      if (ganho.para === eu) {
        // voltou para ela: nada na lista, e a aliança no dedo de novo
        expect(acc.owned(a.id)).toEqual([]);
        expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(true);
        expect(aneisDe(a.visoes.at(-1)!, eu)).toEqual([ALIANCA]);
        continue;
      }
      perdeu = true;
      // ela fica com a marca de perdida, e sem a aliança — na conta e no dedo
      expect(acc.owned(a.id)).toEqual([PERDEU_A_ALIANCA]);
      expect(acc.temItem(a.id, CHAVE_DA_ALIANCA)).toBe(false);
      expect(aneisDe(salaAberta(lobby).buildView(a.conn.id), eu)).toEqual([]);
      // o Beto já tinha a dele (a de início): fica com duas, sem reembolso
      expect(acc.owned(b.id)).toEqual([CHAVE_DA_ALIANCA]);
      expect(quantasTem(acc.owned(b.id), CHAVE_DA_ALIANCA)).toBe(2);
      expect(acc.money(b.id)).toBe(saldoDoBeto);
      expect(a.conversa.some((t) => t.includes('ficou com') && !t.includes('fichas'))).toBe(true);
    }
    expect(perdeu).toBe(true);
  }, 60_000);
});

/**
 * Numa mesa Custom, quem a cria decide se os acessórios valem como aposta (`apostaDeItens` nas regras
 * da sala). Sem dizer nada, valem.
 */
describe('a mesa decide se acessório vale como aposta', () => {
  /** A Ana (de relógio no pulso) e o Beto numa mesa com estas regras, já começada. */
  async function mesaDeDois(regras: RoomSettings, naVez: (v: TableView, j: Jogador) => void, naOferta?: (v: TableView, j: Jogador) => void) {
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby, 'Ana', naVez, naOferta);
    const b = jogador(lobby, 'Beto', paga);
    await vi.advanceTimersByTimeAsync(50);
    vestir(acc, a, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: regras });
    await vi.advanceTimersByTimeAsync(50);
    b.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
    await vi.advanceTimersByTimeAsync(50);
    a.conn.handle({ type: 'startGame' });
    return { acc, lobby, a, b };
  }

  it('a sala criada sem o campo vale: a mesa diz que sim e oferece o relógio na vez de quem o usa', async () => {
    vi.useFakeTimers();
    expect('apostaDeItens' in MANO_A_MANO).toBe(false);
    const { lobby, a } = await mesaDeDois(MANO_A_MANO, paga);
    expect(salaAberta(lobby).settings.apostaDeItens).toBe(true);
    const podendo = (v: TableView) => v.toAct === v.mySeat && !!v.legal?.canStake;
    await ate(() => a.visoes.some(podendo));
    const naVez = a.visoes.find(podendo)!;
    expect(naVez.apostaDeItens).not.toBe(false);
    expect(naVez.apostaveis).toEqual([{ id: RELOGIO, valor: 120 }]);
    for (const v of a.visoes) expect(v.apostaDeItens).toBe(true);
    expect(a.erros).toEqual([]);
  }, 30_000);

  it('com apostaDeItens: false, a mesa diz que não, não oferece nada na vez de quem usa um relógio, recusa o pedido sem mudar nada e elimina quem zera sem perguntar', async () => {
    vi.useFakeTimers();
    // a Ana vai de all-in sempre e o Beto paga: em algumas partidas ela quebra primeiro
    let eliminada = false;
    for (let tentativa = 0; tentativa < 40 && !eliminada; tentativa++) {
      let naVez: TableView | null = null;
      let recusa: string[] = [];
      const { acc, lobby, a, b } = await mesaDeDois(
        { ...MANO_A_MANO, apostaDeItens: false },
        (v, j) => {
          // na primeira vez em que caberia uma peça, ela tenta o relógio assim mesmo (um cliente que ignora a regra)
          if (!naVez && v.legal?.canStake) {
            naVez = v;
            const antes = j.erros.length;
            j.conn.handle({ type: 'apostarItem', item: RELOGIO });
            recusa = j.erros.slice(antes);
          }
          // a vez continua sendo dela: a jogada de verdade é aceita
          tudo(v, j);
        },
        // (se a pergunta viesse, ela diria que sim — não pode vir)
        (_v, j) => j.conn.handle({ type: 'entrarComItem', item: RELOGIO }),
      );
      expect(salaAberta(lobby).settings.apostaDeItens).toBe(false);
      await ate(() => fim(a, 'gameOver'));
      expect(fim(a, 'gameOver')).toBe(true);
      const eu = a.visoes[0].mySeat!;

      // a mesa diz que não, do começo ao fim, e não oferece nada a ninguém
      for (const j of [a, b]) {
        for (const v of j.visoes) {
          expect(v.apostaDeItens).toBe(false);
          expect(v.apostaveis).toEqual([]);
          expect(v.itens).toEqual([]);
          expect(v.oferta ?? null).toBeNull();
        }
        // ninguém recebeu a pergunta, ninguém entrou com peça, nenhuma aposta levou acessório
        expect(fim(j, 'ofertaItem')).toBe(false);
        expect(fim(j, 'entradaComItem')).toBe(false);
        expect(j.eventos.some((e) => e.t === 'action' && !!e.item)).toBe(false);
        expect(ganhos(j)).toEqual([]);
      }
      // na vez dela caberia uma peça, e o relógio estava no pulso: a lista veio vazia por causa da regra da mesa
      expect(naVez).not.toBeNull();
      expect(naVez!.legal?.canStake).toBe(true);
      expect(noPulso(naVez!, eu)).toBe(RELOGIO);
      expect(naVez!.apostaveis).toEqual([]);
      // o pedido foi recusado (um erro só, o dele) e não mudou nada: o relógio continua dela, na conta e no pulso
      expect(recusa).toHaveLength(1);
      expect(a.erros).toEqual(recusa);
      expect(b.erros).toEqual([]);
      expect(acc.owned(a.id)).toEqual([CHAVE]);
      expect(acc.owned(b.id)).toEqual([]);
      for (const v of a.visoes) expect(noPulso(v, eu)).toBe(RELOGIO);

      if (!a.eventos.some((e) => e.t === 'bust' && e.seat === eu)) continue;
      eliminada = true;
      // zerou com o relógio no pulso, e foi eliminada na hora — responder a uma pergunta que não houve também é recusado
      a.conn.handle({ type: 'entrarComItem', item: RELOGIO });
      expect(a.erros).toHaveLength(2);
      expect(salaAberta(lobby).buildView(a.conn.id).seats[eu]).toMatchObject({ busted: true, stack: 0 });
    }
    expect(eliminada).toBe(true);
  }, 90_000);
});

/**
 * A peça que já esteve num pote da partida continua em jogo (shared/aposta.ts): o bot que a ganha
 * fica com ela, na mesa — ela sai da conta de quem perdeu —, e a aposta **sempre** que zerar. De um
 * bot ela vai para a conta de quem a ganhar.
 */
describe('a peça em circulação', () => {
  it('uma pessoa aposta o relógio e um bot o ganha: sai da conta dela e vai para o pulso dele; quando ele zera, aposta-o mesmo com a chance contra', async () => {
    vi.useFakeTimers();
    let viu = false;
    for (let tentativa = 0; tentativa < 40 && !viu; tentativa++) {
      // a chance contra, da hora em que o bot senta até o fim: ele vem sem peça e nunca aposta por sorte
      acasoContra();
      const acc = contas();
      const lobby = new Lobby('teste', acc);
      // a Ana aposta o relógio sempre que dá, e paga o resto; depois que o perde, vai de all-in para quebrar o bot
      const a = jogador(lobby, 'Ana', (v, j) => {
        if (v.apostaveis?.some((p) => p.id === RELOGIO)) j.conn.handle({ type: 'apostarItem', item: RELOGIO });
        else if (acc.temItem(j.id, CHAVE)) paga(v, j);
        else tudo(v, j);
      });
      await vi.advanceTimersByTimeAsync(50);
      vestir(acc, a, 'Ana');
      a.conn.handle({ type: 'createRoom', settings: MANO_A_MANO });
      await vi.advanceTimersByTimeAsync(50);
      a.conn.handle({ type: 'addBot', difficulty: 'easy' });
      const sala = salaAberta(lobby);
      const bot = sala.seats.find((m) => m?.isBot)!;
      expect(bot.cosmetics.acessorios).toBeUndefined();
      a.conn.handle({ type: 'startGame' });

      // 1) o bot ganha o relógio
      await ate(() => fim(a, 'gameOver') || !acc.temItem(a.id, CHAVE));
      // (a partida pode acabar antes: o bot desistiu de tudo até ficar sem fichas, ou ela quebrou com o relógio no pulso)
      if (acc.temItem(a.id, CHAVE)) continue;
      const eu = a.visoes[0].mySeat!;
      expect(acc.owned(a.id)).toEqual([]);
      // está nas mãos do bot, na mesa — e em conta nenhuma
      expect(bot.cosmetics.acessorios?.bracos).toEqual({ E: [RELOGIO], D: [] });
      await ate(() => noPulso(a.visoes.at(-1)!, bot.seat) === RELOGIO, 10_000);
      expect(noPulso(a.visoes.at(-1)!, bot.seat)).toBe(RELOGIO);
      expect(noPulso(a.visoes.at(-1)!, eu)).toBeNull();
      expect(ganhos(a).find((g) => g.para !== g.de)).toMatchObject({ id: RELOGIO, de: eu, para: bot.seat });
      expect(a.conversa.some((t) => t.includes('ficou com'))).toBe(true);
      expect(fim(a, 'entradaComItem')).toBe(false);

      // 2) o bot zera: a peça está em circulação, então ele a aposta — a chance (uma em dez) não entra na conta
      await ate(() => fim(a, 'gameOver') || fim(a, 'entradaComItem'));
      const entrada = a.eventos.find((e) => e.t === 'entradaComItem');
      if (!entrada) {
        // foi ela quem quebrou: a partida acabou com o relógio no pulso do bot, que não foi eliminado
        expect(a.eventos.some((e) => e.t === 'bust' && e.seat === bot.seat)).toBe(false);
        expect(usando(bot.cosmetics.acessorios, RELOGIO)).toBe(true);
        expect(acc.temItem(a.id, CHAVE)).toBe(false);
        continue;
      }
      viu = true;
      // (o acaso continuava fixado do lado do "não": não foi a sorte que o fez apostar)
      expect(vi.isMockFunction(Math.random)).toBe(true);
      expect(Math.random()).toBeGreaterThanOrEqual(BOT_APOSTA);
      expect(entrada).toMatchObject({ t: 'entradaComItem', seat: bot.seat, item: RELOGIO, valor: 120 });
      expect(a.eventos.some((e) => e.t === 'bust' && e.seat === bot.seat)).toBe(false);
      expect(a.erros).toEqual([]);
      // entra na mão seguinte sem fichas, all-in com o relógio, que sai do pulso dele para a mesa
      const iEntrada = a.eventos.indexOf(entrada);
      const iAposta = () => a.eventos.findIndex((e, i) => i > iEntrada && e.t === 'action' && !!e.item);
      await ate(() => iAposta() >= 0);
      expect(a.eventos[iAposta()]).toMatchObject({ t: 'action', seat: bot.seat, action: 'allin', amount: 0, item: { id: RELOGIO, valor: 120 } });
      // (até anunciar a aposta ele ainda estava com o relógio no pulso; anunciada, o relógio está na mesa)
      expect(noPulso(a.visoes[iAposta() - 1], bot.seat)).toBe(RELOGIO);
      expect(a.visoes[iAposta()].itens).toMatchObject([{ seat: bot.seat, id: RELOGIO, valor: 120 }]);
      expect(noPulso(a.visoes[iAposta()], bot.seat)).toBeNull();

      // 3) no fim dessa mão o relógio está num lugar só: de volta na conta dela (veio de um bot), ou ainda com ele
      const iFim = () => a.eventos.findIndex((e, i) => i > iAposta() && e.t === 'handEnd');
      await ate(() => iFim() >= 0);
      const desfecho = a.eventos.slice(iAposta(), iFim()).flatMap((e) => (e.t === 'win' ? e.pots.flatMap((p) => p.itens ?? []) : []));
      expect(desfecho).toMatchObject([{ id: RELOGIO, de: bot.seat }]);
      const naConta = acc.owned(a.id).filter((k) => k === CHAVE).length;
      const comOBot = usando(bot.cosmetics.acessorios, RELOGIO) || !!bot.bolso?.includes(RELOGIO) ? 1 : 0;
      const emJogo = sala.buildView(a.conn.id).itens?.some((i) => i.id === RELOGIO) ? 1 : 0;
      expect(naConta + comOBot + emJogo).toBe(1);
      // (ganhou dela: fica com ele; ganhou ela: a peça de um bot entra na conta de quem a ganhou)
      if (desfecho[0].para === eu) expect(acc.owned(a.id)).toEqual([CHAVE]);
      else expect(acc.owned(a.id)).toEqual([]);
      expect(a.erros).toEqual([]);
    }
    expect(viu).toBe(true);
  }, 180_000);
});

/**
 * As colocações de quem é eliminado na mesma mão em que outro ficou sem fichas mas tem um acessório
 * para apostar: quem fica (com a pergunta em aberto) está à frente de quem sai na hora.
 */
describe('colocações, quando dois zeram na mesma mão', () => {
  it('quem zerou junto com alguém que recebeu a pergunta não divide a colocação com ele: 1º, 2º e 3º', async () => {
    vi.useFakeTimers();
    // três de all-in na primeira mão, com pilhas iguais: quem ganha leva tudo, e os outros dois zeram juntos.
    // O Beto (assento 0) não tem o que apostar; a Ana (assento 1) está de relógio, recebe a pergunta e recusa.
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const acc = contas();
      const lobby = new Lobby('teste', acc);
      const b = jogador(lobby, 'Beto', tudo);
      const a = jogador(lobby, 'Ana', tudo, (_v, j) => j.conn.handle({ type: 'entrarComItem', item: null }));
      const c = jogador(lobby, 'Caio', tudo);
      await vi.advanceTimersByTimeAsync(50);
      vestir(acc, a, 'Ana');
      b.conn.handle({ type: 'createRoom', settings: { ...MANO_A_MANO, maxPlayers: 3 } });
      await vi.advanceTimersByTimeAsync(50);
      a.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
      c.conn.handle({ type: 'joinRoom', roomId: salaDe(lobby) });
      await vi.advanceTimersByTimeAsync(50);
      b.conn.handle({ type: 'startGame' });
      await ate(() => fim(a, 'gameOver'));
      const fimDaPartida = a.eventos.find((e) => e.t === 'gameOver');
      // só serve a partida em que o Caio ganhou a primeira mão, os outros dois zeraram nela e a Ana recebeu a pergunta
      const caiu = (j: Jogador) => a.eventos.some((e) => e.t === 'bust' && e.seat === j.visoes[0].mySeat);
      if (!fimDaPartida || fimDaPartida.t !== 'gameOver' || quantos(a, 'handEnd') !== 1 || !fim(a, 'ofertaItem') || !caiu(a) || !caiu(b)) continue;
      expect(fimDaPartida.ranking).toHaveLength(3);
      expect(fimDaPartida.ranking.map((r) => r.place).sort()).toEqual([1, 2, 3]);
      return;
    }
  }, 90_000);
});

/** A sala que existe no lobby (os testes abrem uma só). */
function salaDe(lobby: Lobby): string {
  const salas = (lobby as unknown as { rooms: Map<string, unknown> }).rooms;
  return [...salas.keys()][0];
}

/** A mesma sala, por dentro (o que o servidor sabe de cada assento). */
function salaAberta(lobby: Lobby): Room {
  return lobby.rooms.get(salaDe(lobby))!;
}
