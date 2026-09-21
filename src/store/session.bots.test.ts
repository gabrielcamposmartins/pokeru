import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_CONNECT_MS, net, useSession } from './session';
import { useTable } from './table';
import { connectLocal, type Transport, type TransportHandlers } from '../net/transport';
import type { ServerMsg } from '../../shared/protocol';

/**
 * Partida contra bots: quem manda é o servidor. Só quando ele não dá conta é que a mesma partida
 * roda no computador do jogador — e o jogador é avisado.
 *
 * Nos testes, `net.ws` é trocado por transportes de mentira: um deles é o Lobby de verdade rodando
 * aqui (é o que faz as vezes do servidor), os outros encenam as falhas.
 */

const OPTS = {
  bots: 2,
  difficulty: 'easy' as const,
  mode: 'cash' as const,
  variant: 'holdem' as const,
  rounds: 8,
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  turnTime: 5,
  pace: 0.4,
};

const realWs = net.ws;

/** Transporte que nunca diz nada (serve para o servidor que aceita a conexão e trava). */
function mudo(): Transport {
  return { send() {}, close() {} };
}

/** Servidor de mentira: responde ao que o cliente manda com as mensagens de `reply`. */
function fakeServer(reply: (msg: { type: string }, say: (m: ServerMsg) => void) => void) {
  return (_url: string, h: TransportHandlers): Transport => {
    let closed = false;
    const say = (m: ServerMsg) => queueMicrotask(() => !closed && h.onMessage(m));
    queueMicrotask(() => h.onOpen?.());
    return {
      send(m) {
        if (!closed) reply(m as { type: string }, say);
      },
      close() {
        closed = true;
      },
    };
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  useSession.getState().disconnect();
  vi.useRealTimers();
  net.ws = realWs;
});

describe('partida contra bots', () => {
  it('roda no servidor: a mesa vem de lá e a sessão fica online', async () => {
    // o "servidor" é o mesmo Lobby do servidor de verdade, rodando neste processo
    net.ws = (_url, h) => connectLocal(h);
    useSession.getState().startBots(OPTS);
    await vi.advanceTimersByTimeAsync(3000);

    const s = useSession.getState();
    expect(s.mode).toBe('online');
    expect(s.status).toBe('connected');
    expect(s.offline).toBe(false);
    // a sala nasceu, os bots sentaram e a mão começou — tudo pedido pelo cliente, decidido lá
    expect(s.room?.members).toHaveLength(OPTS.bots + 1);
    expect(useTable.getState().display?.handNo).toBeGreaterThan(0);
    // e a espera acabou: o menu sai da frente
    expect(s.botsPending).toBe(false);
  });

  it('a mesa contra bots não aparece na lista pública', async () => {
    net.ws = (_url, h) => connectLocal(h);
    useSession.getState().startBots(OPTS);
    await vi.advanceTimersByTimeAsync(3000);

    expect(useSession.getState().room).toBeTruthy();
    expect(useSession.getState().room!.settings.listed).toBe(false);
  });

  it('servidor fora do ar: a partida segue no computador do jogador', async () => {
    net.ws = (_url, h) => {
      queueMicrotask(() => h.onClose?.('Não foi possível conectar ao servidor'));
      return mudo();
    };
    useSession.getState().startBots(OPTS);
    await vi.advanceTimersByTimeAsync(3000);

    const s = useSession.getState();
    expect(s.mode).toBe('local');
    expect(s.offline).toBe(true);
    expect(useTable.getState().display?.handNo).toBeGreaterThan(0);
    // e o jogador foi avisado do que aconteceu
    expect(s.toasts.some((t) => t.text.includes('seguiu no seu computador'))).toBe(true);
  });

  it('servidor calado: passado o tempo de espera, a partida começa local', async () => {
    net.ws = (_url, h) => {
      queueMicrotask(() => h.onOpen?.());
      return mudo();
    };
    useSession.getState().startBots(OPTS);

    // antes do prazo, ainda está esperando o servidor (e o menu segue na frente)
    await vi.advanceTimersByTimeAsync(BOT_CONNECT_MS - 100);
    expect(useSession.getState().mode).toBe('online');
    expect(useSession.getState().botsPending).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(useSession.getState().mode).toBe('local');
    expect(useSession.getState().offline).toBe(true);
    expect(useSession.getState().botsPending).toBe(false);
    expect(useTable.getState().display?.handNo).toBeGreaterThan(0);
  });

  it('servidor que recusa a mesa também cai para local', async () => {
    net.ws = fakeServer((msg, say) => {
      if (msg.type === 'hello') say({ type: 'welcome', playerId: 'p1', serverName: 'Teste' });
      if (msg.type === 'createRoom') say({ type: 'error', message: 'Servidor cheio' });
    });
    useSession.getState().startBots(OPTS);
    await vi.advanceTimersByTimeAsync(3000);

    const s = useSession.getState();
    expect(s.mode).toBe('local');
    expect(s.offline).toBe(true);
    expect(s.toasts.some((t) => t.text.includes('Servidor cheio'))).toBe(true);
    expect(useTable.getState().display?.handNo).toBeGreaterThan(0);
  });

  it('queda depois da mesa começar não vira partida local (a partida acabou ali)', async () => {
    let drop: (() => void) | null = null;
    net.ws = (_url, h) => {
      const t = connectLocal(h);
      drop = () => h.onClose?.('Conexão perdida');
      return t;
    };
    useSession.getState().startBots(OPTS);
    await vi.advanceTimersByTimeAsync(3000);
    expect(useSession.getState().mode).toBe('online');

    drop!();
    await vi.advanceTimersByTimeAsync(100);
    const s = useSession.getState();
    expect(s.mode).toBe('none');
    expect(s.connError).toBe('Conexão perdida');
    expect(s.offline).toBe(false);
  });
});
