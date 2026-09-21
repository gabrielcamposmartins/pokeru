import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, hasSavedSession, loadSession, memoryKeys, saveSession, vaultAvailable, type KeyStore } from './vault';

/** localStorage de mentira: o cofre só precisa de get/set/remove. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

let storage: ReturnType<typeof fakeStorage>;
let keys: KeyStore;
const vault = () => ({ keys, storage });
const blob = () => storage.map.get('pokeru-session');

beforeEach(() => {
  storage = fakeStorage();
  keys = memoryKeys();
});

describe('cofre da sessão', () => {
  it('guarda e devolve usuário e token', async () => {
    expect(vaultAvailable(vault())).toBe(true);
    expect(await saveSession({ user: 'marina', token: 'jwt.abc.123' }, vault())).toBe(true);

    const saved = await loadSession(vault());
    expect(saved?.user).toBe('marina');
    expect(saved?.token).toBe('jwt.abc.123');
    expect(Date.parse(saved?.savedAt ?? '')).toBeGreaterThan(0);
  });

  it('nada fica em texto puro no armazenamento', async () => {
    await saveSession({ user: 'marina', token: 'jwt.abc.123' }, vault());
    const raw = blob() ?? '';
    expect(raw).not.toContain('marina');
    expect(raw).not.toContain('jwt.abc.123');
    // o que sobra é envelope: versão, iv e o texto cifrado
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['data', 'iv', 'v']);
  });

  it('a senha não tem como ser guardada', async () => {
    // mesmo quem chamar errado (forçando o tipo) não consegue gravar senha
    await saveSession({ user: 'marina', token: 't', password: 'senha-secreta' } as never, vault());
    expect(blob() ?? '').not.toContain('senha-secreta');

    const saved = (await loadSession(vault())) as Record<string, unknown> | null;
    expect(saved && Object.keys(saved).sort()).toEqual(['savedAt', 'token', 'user']);
  });

  it('texto cifrado mexido não decifra (AES-GCM é autenticado)', async () => {
    await saveSession({ user: 'marina', token: 'jwt' }, vault());
    const envelope = JSON.parse(blob()!) as { data: string };
    // troca um caractere do meio do texto cifrado
    const i = Math.floor(envelope.data.length / 2);
    envelope.data = `${envelope.data.slice(0, i)}${envelope.data[i] === 'A' ? 'B' : 'A'}${envelope.data.slice(i + 1)}`;
    storage.map.set('pokeru-session', JSON.stringify(envelope));

    expect(await loadSession(vault())).toBeNull();
  });

  it('sem a chave (outro perfil, dados limpos) a sessão é esquecida', async () => {
    await saveSession({ user: 'marina', token: 'jwt' }, vault());
    keys = memoryKeys(); // chave perdida, texto cifrado ainda lá
    expect(await loadSession(vault())).toBeNull();
  });

  it('esquecer apaga o texto cifrado e a chave', async () => {
    await saveSession({ user: 'marina', token: 'jwt' }, vault());
    expect(hasSavedSession(vault())).toBe(true);

    await clearSession(vault());
    expect(hasSavedSession(vault())).toBe(false);
    expect(blob()).toBeUndefined();
    expect(await keys.get()).toBeNull();
    expect(await loadSession(vault())).toBeNull();
  });

  it('sessão velha devolve só o usuário — o token já teria expirado do outro lado', async () => {
    await saveSession({ user: 'marina', token: 'jwt' }, vault());
    // reescreve o carimbo para 90 dias atrás, cifrando de novo com a mesma chave
    const old = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const envelope = JSON.parse(blob()!) as { iv: string };
    const iv = Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0));
    const key = (await keys.get())!;
    const data = new TextEncoder().encode(JSON.stringify({ user: 'marina', token: 'jwt', savedAt: old }));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
    storage.map.set('pokeru-session', JSON.stringify({ v: 1, iv: envelope.iv, data: btoa(String.fromCharCode(...cipher)) }));

    const saved = await loadSession({ ...vault(), maxAgeDays: 60 });
    expect(saved?.user).toBe('marina');
    expect(saved?.token).toBeUndefined();
  });

  it('sem usuário não grava nada', async () => {
    expect(await saveSession({ user: '' }, vault())).toBe(false);
    expect(blob()).toBeUndefined();
  });

  it('sem armazenamento o cofre se declara indisponível e não escreve', async () => {
    const broken = { keys, storage: undefined as never };
    expect(vaultAvailable(broken)).toBe(false);
    expect(await saveSession({ user: 'marina', token: 'jwt' }, broken)).toBe(false);
    expect(await loadSession(broken)).toBeNull();
  });

  it('lixo no armazenamento não quebra a leitura', async () => {
    storage.map.set('pokeru-session', 'não é json');
    expect(await loadSession(vault())).toBeNull();
    storage.map.set('pokeru-session', JSON.stringify({ v: 2, iv: 'x', data: 'y' }));
    expect(await loadSession(vault())).toBeNull();
  });
});
