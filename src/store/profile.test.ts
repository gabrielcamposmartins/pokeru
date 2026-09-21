import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, SERVER_URL, useProfile } from './profile';

describe('endereço do servidor', () => {
  it('é o servidor oficial, e o jogador não escolhe', () => {
    expect(DEFAULT_SERVER_URL).toBe('ws://35.209.186.9:3001');
    expect(SERVER_URL).toBe(DEFAULT_SERVER_URL);
    // não existe mais campo de endereço nas configurações: o que se escolhe é a sala
    expect('serverUrl' in useProfile.getState().settings).toBe(false);
  });

  it('o saldo guardado é por servidor, chaveado pelo endereço em uso', () => {
    useProfile.getState().setAccount(SERVER_URL, { id: 'a1', token: 't1', money: 1234 });
    expect(useProfile.getState().accounts[SERVER_URL]?.money).toBe(1234);
  });
});
