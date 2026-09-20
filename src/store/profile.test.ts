import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, useProfile } from './profile';

describe('endereço do servidor', () => {
  it('o app já vem apontando para o servidor oficial', () => {
    expect(DEFAULT_SERVER_URL).toBe('ws://35.209.186.9:3001');
    // é o que o perfil usa quando o jogador nunca trocou nada
    expect(useProfile.getState().settings.serverUrl).toBe(DEFAULT_SERVER_URL);
  });

  it('o endereço escolhido pelo jogador manda no padrão', () => {
    useProfile.getState().updateSettings({ serverUrl: 'ws://192.168.0.10:3001' });
    expect(useProfile.getState().settings.serverUrl).toBe('ws://192.168.0.10:3001');
    useProfile.getState().updateSettings({ serverUrl: DEFAULT_SERVER_URL });
  });
});
