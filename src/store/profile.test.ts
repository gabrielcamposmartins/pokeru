import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, ENDERECOS_ANTIGOS_DO_OFICIAL, SERVER_URL, migrarContasDoOficial, useProfile } from './profile';

describe('endereço do servidor', () => {
  it('é o servidor oficial, e o jogador não escolhe', () => {
    // o domínio com TLS, atrás do nginx da VM
    expect(DEFAULT_SERVER_URL).toBe('wss://pokeru.padoru.org');
    expect(SERVER_URL).toBe(DEFAULT_SERVER_URL);
    // não existe mais campo de endereço nas configurações: o que se escolhe é a sala
    expect('serverUrl' in useProfile.getState().settings).toBe(false);
  });

  it('o gateway de contas é o mesmo endereço, no https correspondente', async () => {
    const { gatewayFor, insecureGateway } = await import('./auth');
    expect(gatewayFor(SERVER_URL)).toBe('https://pokeru.padoru.org');
    // a senha não vai mais em claro
    expect(insecureGateway(gatewayFor(SERVER_URL))).toBe(false);
    expect(gatewayFor('ws://localhost:3001')).toBe('http://localhost:3001');
  });

  it('o saldo guardado é por servidor, chaveado pelo endereço em uso', () => {
    useProfile.getState().setAccount(SERVER_URL, { id: 'a1', token: 't1', money: 1234 });
    expect(useProfile.getState().accounts[SERVER_URL]?.money).toBe(1234);
  });
});

describe('conta guardada no endereço antigo do oficial', () => {
  const [ipAntigo] = ENDERECOS_ANTIGOS_DO_OFICIAL;
  const conta = { id: 'a1', token: 'chave-de-volta', money: 500, until: '2099-01-01T00:00:00Z' };

  it('vem para o endereço novo, e o antigo sai do perfil', () => {
    const migradas = migrarContasDoOficial({ [ipAntigo]: conta });
    expect(migradas).toEqual({ [DEFAULT_SERVER_URL]: conta });
  });

  it('não pisa numa conta que já existe no endereço novo', () => {
    const nova = { id: 'a2', token: 'nova', money: 10 };
    const migradas = migrarContasDoOficial({ [ipAntigo]: conta, [DEFAULT_SERVER_URL]: nova });
    expect(migradas).toEqual({ [DEFAULT_SERVER_URL]: nova });
  });

  it('não mexe em contas de outros servidores', () => {
    const local = { id: 'l1', token: 'local', money: 1 };
    const migradas = migrarContasDoOficial({ 'ws://localhost:3001': local, [ipAntigo]: conta });
    expect(migradas['ws://localhost:3001']).toBe(local);
    expect(migradas[DEFAULT_SERVER_URL]).toBe(conta);
  });

  it('não age quando o app aponta para outro servidor', () => {
    const contas = { [ipAntigo]: conta };
    expect(migrarContasDoOficial(contas, 'ws://localhost:3001')).toBe(contas);
  });

  it('prefere a conta com chave de volta quando os dois endereços antigos existem', () => {
    const [ws, wss] = ENDERECOS_ANTIGOS_DO_OFICIAL;
    const semChave = { id: 'a1', token: '', money: 0 };
    expect(migrarContasDoOficial({ [ws]: semChave, [wss]: conta })[DEFAULT_SERVER_URL]).toBe(conta);
  });
});
