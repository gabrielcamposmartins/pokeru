import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_CONNECT_MS, net, useSession } from './session';
import { useTable } from './table';
import { connectLocal, type Transport, type TransportHandlers } from '../net/transport';
import { DEFAULT_SETTINGS, type ServerMsg } from '../../shared/protocol';

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

    // antes do prazo, ainda está esperando o servidor (e o menu segue na frente). O modo só vira
    // 'online' quando a sala nasce: estar conectado, por si, é só estar no lobby.
    await vi.advanceTimersByTimeAsync(BOT_CONNECT_MS - 100);
    expect(useSession.getState().botsPending).toBe(true);
    expect(useSession.getState().mode).toBe('none');

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

/**
 * A conta no menu — o sintoma que apareceu no teste com gente de verdade.
 *
 * O jogador vinculava o Discord, o servidor lia os 4.989 padocoins e a tela continuava dizendo
 * "saldo indisponível": a conta só existe enquanto há conexão, e o jogo conectava **apenas** ao
 * abrir Salas. No menu, nas Configurações e na loja não havia conexão nenhuma — e portanto nem
 * fichas, nem padocoins, nem itens.
 */
describe('conexão do lobby', () => {
  it('conectar não põe o jogador "em jogo": o menu continua sendo o menu', async () => {
    net.ws = (_url, h) => connectLocal(h);
    useSession.getState().connectOnline();
    await vi.advanceTimersByTimeAsync(200);

    const s = useSession.getState();
    expect(s.status).toBe('connected');
    // é isto que deixa o App mostrar o menu, e não a tela de Salas
    expect(s.mode).toBe('none');
    expect(s.room).toBeNull();
  });

  it('a conta chega sem passar por sala nenhuma', async () => {
    net.ws = (_url, h) => connectLocal(h);
    useSession.getState().connectOnline();
    await vi.advanceTimersByTimeAsync(200);

    // o Lobby local não tem serviço de contas, então aqui a conta é nula de propósito;
    // o que importa é que o caminho existe e o `hello` já foi trocado
    expect(useSession.getState().playerId).toBeTruthy();
    expect(useSession.getState().serverName).toBeTruthy();
  });

  it('entrar numa sala é o que muda o modo; sair volta ao menu com a conexão de pé', async () => {
    net.ws = (_url, h) => connectLocal(h);
    useSession.getState().connectOnline();
    await vi.advanceTimersByTimeAsync(200);

    useSession.getState().send({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, name: 'Mesa' } });
    await vi.advanceTimersByTimeAsync(200);
    expect(useSession.getState().mode).toBe('online');
    expect(useSession.getState().room).toBeTruthy();

    useSession.getState().leaveRoom();
    await vi.advanceTimersByTimeAsync(200);
    expect(useSession.getState().mode).toBe('none');
    expect(useSession.getState().room).toBeNull();
    // e segue conectado: a conta não desaparece do menu ao sair da sala
    expect(useSession.getState().status).toBe('connected');
  });

  it('a partida offline continua sendo local, mesmo recebendo `room`', async () => {
    useSession.getState().startLocal(OPTS);
    await vi.advanceTimersByTimeAsync(2000);
    // é por este modo que sair da partida fecha a sala e para os bots
    expect(useSession.getState().mode).toBe('local');
    expect(useSession.getState().room).toBeTruthy();
  });
});
