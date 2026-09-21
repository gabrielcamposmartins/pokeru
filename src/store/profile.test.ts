import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, SERVER_URL, useProfile } from './profile';

describe('endereço do servidor', () => {
  it('é o servidor oficial, por wss, e o jogador não escolhe', () => {
    // wss porque a senha do login e o token da sessão passam por este endereço
    expect(DEFAULT_SERVER_URL).toBe('wss://35.209.186.9:3001');
    expect(SERVER_URL).toBe(DEFAULT_SERVER_URL);
    // não existe mais campo de endereço nas configurações: o que se escolhe é a sala
    expect('serverUrl' in useProfile.getState().settings).toBe(false);
  });

  it('o gateway de contas é o mesmo endereço em https', async () => {
    const { gatewayFor } = await import('./auth');
    expect(gatewayFor(SERVER_URL)).toBe('https://35.209.186.9:3001');
  });

  it('o saldo guardado é por servidor, chaveado pelo endereço em uso', () => {
    useProfile.getState().setAccount(SERVER_URL, { id: 'a1', token: 't1', money: 1234 });
    expect(useProfile.getState().accounts[SERVER_URL]?.money).toBe(1234);
  });
});
