import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { net, useSession } from './session';
import { useAuth } from './auth';
import { SERVER_URL, useProfile } from './profile';
import type { Transport, TransportHandlers } from '../net/transport';
import type { ServerMsg } from '../../shared/protocol';

/**
 * A sessão guardada que o servidor recusa.
 *
 * O JWT vence em uma hora; depois disso quem segura a conta é a chave de volta guardada no
 * aparelho. Quando ela não vale mais, o jogo abria sem conta — sem nível, sem vínculo, sem Discord
 * — e parecia que tudo tinha sumido, quando a conta estava inteira no servidor. Agora o servidor
 * avisa (`sessaoVencida`) e o jogo volta para a tela de login.
 */

const realWs = net.ws;

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

describe('sessão vencida', () => {
  it('volta para a tela de login, esquece a chave velha e desliga', async () => {
    useProfile.getState().setAccount(SERVER_URL, { id: 'a-1', token: 'chave-velha', money: 0, owned: [], pado: null });
    useAuth.setState({ status: 'logged', user: 'gabs', token: null, remember: true, error: null });
    net.ws = fakeServer((msg, say) => {
      if (msg.type === 'hello') {
        say({ type: 'sessaoVencida' });
        say({ type: 'welcome', playerId: 'p1', serverName: 'Teste' });
      }
    });
    useSession.getState().connectOnline();
    await vi.advanceTimersByTimeAsync(200);

    const auth = useAuth.getState();
    expect(auth.status).toBe('anon');
    // o usuário continua preenchido: é só digitar a senha
    expect(auth.user).toBe('gabs');
    expect(auth.error).toMatch(/sessão expirou/);
    expect(useProfile.getState().accounts[SERVER_URL]).toBeUndefined();
    // desligado: ao entrar de novo, a conexão abre com o JWT novo
    expect(useSession.getState().status).toBe('idle');
  });
});
