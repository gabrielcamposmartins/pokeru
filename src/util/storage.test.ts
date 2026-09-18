import { beforeEach, describe, expect, it } from 'vitest';
import { migrateStorageKey } from './storage';

/** localStorage de mentira (o teste roda em Node). */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = store;
  return data;
}

describe('troca de nome (PokerSoul → Pokeru)', () => {
  beforeEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('traz o que estava salvo com o nome antigo', () => {
    const data = fakeStorage({ 'pokersoul-profile': '{"state":{"name":"Gabi"}}' });
    migrateStorageKey('pokersoul-profile', 'pokeru-profile');
    expect(data.get('pokeru-profile')).toBe('{"state":{"name":"Gabi"}}');
    // o antigo fica onde está: voltar para a versão anterior continua funcionando
    expect(data.get('pokersoul-profile')).toBeTruthy();
  });

  it('não escreve por cima do que já existe com o nome novo', () => {
    const data = fakeStorage({ 'pokersoul-bond': 'antigo', 'pokeru-bond': 'novo' });
    migrateStorageKey('pokersoul-bond', 'pokeru-bond');
    expect(data.get('pokeru-bond')).toBe('novo');
  });

  it('sem nada antigo (ou sem localStorage), não faz nada e não quebra', () => {
    const data = fakeStorage();
    migrateStorageKey('pokersoul-profile', 'pokeru-profile');
    expect(data.size).toBe(0);
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => migrateStorageKey('pokersoul-profile', 'pokeru-profile')).not.toThrow();
  });
});
