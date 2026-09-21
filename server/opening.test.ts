import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lobby } from '../shared/lobby';
import { DEFAULT_SETTINGS, type ServerMsg } from '../shared/protocol';
import { BACK_PRESETS, CHARACTER_PRESETS, DEFAULT_WIN_FX } from '../shared/styles';
import { Accounts } from './accounts';

/**
 * A abertura da partida — a tela que o jogador lê como "preparando a mesa".
 *
 * O que ela promete é que a espera é real: nenhuma carta é repartida antes de todos confirmarem.
 * E que ela não pode prender ninguém: se alguém travar no carregamento, a mesa começa sozinha no
 * tempo limite. As duas coisas estão aqui.
 */

const dirs: string[] = [];
function newFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-abertura-'));
  dirs.push(dir);
  return join(dir, 'accounts.json');
}

const cosmetics = { back: BACK_PRESETS[1], character: CHARACTER_PRESETS[0], winFx: DEFAULT_WIN_FX };

function player(lobby: Lobby, name: string) {
  const got: ServerMsg[] = [];
  const conn = lobby.connect((m) => void got.push(m));
  conn.handle({ type: 'hello', name, avatar: { color: '#fff', icon: '♠' }, cosmetics });
  const last = <T extends ServerMsg['type']>(type: T) => [...got].reverse().find((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined;
  const events = () => got.filter((m) => m.type === 'event').map((m) => (m as { ev: { t: string } }).ev.t);
  return { conn, got, last, events };
}

/** A mesa já repartiu a primeira mão? */
const comecou = (p: ReturnType<typeof player>) => p.events().includes('handStart');

const mesa = { ...DEFAULT_SETTINGS, maxPlayers: 4, listed: true };

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('abertura da partida', () => {
  it('a mesa espera as confirmações antes de repartir', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const a = player(lobby, 'Gabi');
    a.conn.handle({ type: 'createRoom', settings: mesa });
    const sala = a.last('room')!.room.id;
    const b = player(lobby, 'Marina');
    b.conn.handle({ type: 'joinRoom', roomId: sala });
    await vi.advanceTimersByTimeAsync(20);

    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(50);

    // a abertura foi ao ar com os dois, nenhum pronto — e sem carta na mesa
    const abertura = a.last('opening')!.opening;
    expect(abertura.players.map((p) => p.name)).toEqual(['Gabi', 'Marina']);
    expect(abertura.players.every((p) => !p.ready)).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(comecou(a)).toBe(false);

    // um confirma: o outro vê, e a mesa continua esperando
    a.conn.handle({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(20);
    expect(b.last('opening')!.opening.players.find((p) => p.name === 'Gabi')!.ready).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(comecou(a)).toBe(false);

    // o segundo confirma: agora sim
    b.conn.handle({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(comecou(a)).toBe(true);
    expect(comecou(b)).toBe(true);
    // e a abertura saiu de cena (lista vazia = acabou)
    expect(a.last('opening')!.opening.players).toEqual([]);
    acc.close();
  });

  it('quem travou no carregamento não prende a mesa', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const a = player(lobby, 'Gabi');
    a.conn.handle({ type: 'createRoom', settings: mesa });
    const b = player(lobby, 'Marina');
    b.conn.handle({ type: 'joinRoom', roomId: a.last('room')!.room.id });
    await vi.advanceTimersByTimeAsync(20);

    a.conn.handle({ type: 'startGame' });
    a.conn.handle({ type: 'ready' });
    // Marina nunca confirma
    await vi.advanceTimersByTimeAsync(11_000);
    expect(comecou(a)).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(comecou(a)).toBe(true);
    acc.close();
  });

  it('bot entra pronto, e uma mesa só de bots não espera ninguém', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const a = player(lobby, 'Gabi');
    a.conn.handle({ type: 'createRoom', settings: mesa });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    await vi.advanceTimersByTimeAsync(20);

    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(50);
    const abertura = a.last('opening')!.opening;
    expect(abertura.players.find((p) => p.isBot)!.ready).toBe(true);
    // o bot não tem conta: nível 0, e a tela mostra "BOT" em vez de um número inventado
    expect(abertura.players.find((p) => p.isBot)!.level).toBe(0);

    // só falta o humano
    a.conn.handle({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(comecou(a)).toBe(true);
    acc.close();
  });

  it('o card mostra o que o jogador escolheu: título, nível, personagem e as cartas', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const a = player(lobby, 'Gabi');
    const id = a.last('account')!.account.id;
    // uma mão jogada libera o primeiro título
    acc.note(id, 'hands');
    a.conn.handle({ type: 'setTitle', title: 'Novato da Mesa' });
    a.conn.handle({ type: 'createRoom', settings: mesa });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    await vi.advanceTimersByTimeAsync(20);
    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(50);

    const eu = a.last('opening')!.opening.players.find((p) => !p.isBot)!;
    expect(eu.title).toBe('Novato da Mesa');
    expect(eu.level).toBeGreaterThanOrEqual(1);
    expect(eu.character.id).toBe('marina');
    expect(eu.face.id).toBeTruthy();
    expect(eu.back.id).toBeTruthy();
    acc.close();
  });

  it('offline não tem abertura: a partida contra bots começa na hora', async () => {
    // sem contas é o modo offline (o mesmo Lobby rodando no navegador): não há conta para mostrar
    const lobby = new Lobby('Modo Offline', null);
    const a = player(lobby, 'Gabi');
    a.conn.handle({ type: 'createRoom', settings: mesa });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(1_500);

    expect(a.last('opening')).toBeUndefined();
    expect(comecou(a)).toBe(true);
  });
});
