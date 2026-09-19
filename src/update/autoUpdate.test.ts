import { beforeEach, describe, expect, it } from 'vitest';
import { isDesktopApp, runAutoUpdate, useUpdate } from './autoUpdate';

/**
 * No navegador (e nos testes, que rodam em Node) não há app desktop: a atualização automática
 * precisa sair de fininho, sem erro na tela e sem mexer em nada.
 */
describe('atualização automática', () => {
  beforeEach(() => {
    useUpdate.setState({ stage: 'idle', version: null, notes: null, progress: null, error: null });
  });

  it('fora do app desktop, não tenta atualizar', async () => {
    expect(await isDesktopApp()).toBe(false);
    expect(await runAutoUpdate()).toBe(false);
    expect(useUpdate.getState().stage).toBe('idle');
    expect(useUpdate.getState().error).toBeNull();
  });

  it('não começa duas vezes (uma checagem por abertura)', async () => {
    useUpdate.getState().set({ stage: 'downloading', version: '9.9.9' });
    expect(await runAutoUpdate()).toBe(false);
    // o estado em andamento fica como estava
    expect(useUpdate.getState().stage).toBe('downloading');
    expect(useUpdate.getState().version).toBe('9.9.9');
  });

  it('o aviso de erro é descartável', () => {
    useUpdate.getState().set({ stage: 'error', error: 'sem internet' });
    useUpdate.getState().dismiss();
    expect(useUpdate.getState().stage).toBe('idle');
    expect(useUpdate.getState().error).toBeNull();
  });
});
