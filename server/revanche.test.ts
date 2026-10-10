import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lobby, type Connection } from '../shared/lobby';
import { DEFAULT_SETTINGS, type ServerMsg, type TableView } from '../shared/protocol';
import { Accounts } from './accounts';

/**
 * "Jogar de novo" numa partida contra bots a dinheiro.
 *
 * O botão reabria a mesa com a pilha cheia sem cobrar o buy-in outra vez — uma partida de graça a
 * cada clique, com prêmio de fim de partida no final. Estes testes amarram a cobrança.
 */

const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function contas(dinheiro: number): Accounts {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-'));
  dirs.push(dir);
  return new Accounts({ file: join(dir, 'accounts.json'), startingMoney: dinheiro, faucet: 0 });
}

/** Um jogador que confirma a abertura e vai de all-in em toda vez (a partida acaba depressa). */
function jogador(lobby: Lobby) {
  const j = { conn: null as unknown as Connection, id: '', eventos: [] as string[], erros: [] as string[] };
  j.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'account') j.id = m.account.id;
    if (m.type === 'error') j.erros.push(m.message);
    if (m.type === 'opening') setTimeout(() => j.conn.handle({ type: 'ready' }), 5);
    if (m.type !== 'event') return;
    j.eventos.push(m.ev.t);
    const v: TableView = m.view;
    if (m.ev.t === 'turn' && v.legal && v.toAct === v.mySeat) setTimeout(() => j.conn.handle({ type: 'action', action: { type: 'allin' } }), 5);
  });
  j.conn.handle({ type: 'hello', name: 'Ana', avatar: {}, cosmetics: {} });
  return j;
}

async function ate(cond: () => boolean, maxMs = 2_000_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) await vi.advanceTimersByTimeAsync(250);
}

const fins = (j: { eventos: string[] }) => j.eventos.filter((e) => e === 'gameOver').length;

describe('jogar de novo contra bots', () => {
  it('cobra o buy-in outra vez', async () => {
    vi.useFakeTimers();
    const acc = contas(10_000);
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby);
    await vi.advanceTimersByTimeAsync(50);
    a.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(50);
    expect(acc.money(a.id)).toBe(9000);
    await ate(() => fins(a) === 1);
    await vi.advanceTimersByTimeAsync(3000);
    const depoisDaPrimeira = acc.money(a.id);

    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(50);
    expect(acc.money(a.id)).toBe(depoisDaPrimeira - 1000);
    expect(a.erros).toEqual([]);
    // e a revanche é uma partida de verdade, que termina
    await ate(() => fins(a) === 2);
    expect(fins(a)).toBe(2);
  }, 60_000);

  it('sem saldo para o buy-in (fora do recomeço), a revanche não começa e ninguém paga', async () => {
    vi.useFakeTimers();
    const acc = contas(2000);
    const lobby = new Lobby('teste', acc);
    const a = jogador(lobby);
    await vi.advanceTimersByTimeAsync(50);
    // uma Custom a dinheiro com um bot: a mesa do recomeço é só a de RECOMECO_CUSTOM
    a.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, mode: 'sitgo', maxPlayers: 2, buyIn: 2000, startingStack: 2000, currency: 'chips', pace: 0.4, turnTime: 5 },
    });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(50);
    expect(acc.money(a.id)).toBe(0);
    await ate(() => fins(a) === 1);
    await vi.advanceTimersByTimeAsync(3000);
    const saldo = acc.money(a.id);
    if (saldo >= 2000) return; // ganhou o bastante para pagar: o caso não se aplica nesta rodada
    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(200);
    expect(a.erros.at(-1)).toMatch(/Saldo insuficiente/);
    expect(acc.money(a.id)).toBe(saldo);
  }, 60_000);
});
