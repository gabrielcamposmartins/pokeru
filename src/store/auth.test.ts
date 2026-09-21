import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O cofre é trocado por um de mentira: aqui o que interessa é *o que* a loja manda guardar
 * (usuário e token, nunca a senha) e o estado que ela mostra na tela.
 */
const vault = vi.hoisted(() => ({
  saved: null as { user: string; token?: string } | null,
  calls: [] as unknown[],
}));

vi.mock('../auth/vault', () => ({
  saveSession: vi.fn(async (s: { user: string; token?: string }) => {
    vault.calls.push(s);
    vault.saved = s;
    return true;
  }),
  loadSession: vi.fn(async () => (vault.saved ? { ...vault.saved, savedAt: new Date().toISOString() } : null)),
  clearSession: vi.fn(async () => void (vault.saved = null)),
  hasSavedSession: vi.fn(() => !!vault.saved),
}));

const { useAuth } = await import('./auth');

const fresh = () => useAuth.setState({ status: 'anon', user: null, token: null, remember: false, error: null });

beforeEach(() => {
  vault.saved = null;
  vault.calls = [];
  vi.unstubAllGlobals();
  fresh();
});

describe('loja de login', () => {
  it('cobra usuário e senha antes de tentar entrar', async () => {
    expect(await useAuth.getState().signIn('', '')).toBe(false);
    expect(useAuth.getState().error).toBe('Preencha usuário e senha.');
    expect(vault.calls).toEqual([]);
  });

  it('sem serviço de login, avisa e guarda só o usuário quando pediram para lembrar', async () => {
    useAuth.getState().setRemember(true);
    expect(await useAuth.getState().signIn(' marina ', 'senha123')).toBe(false);

    const s = useAuth.getState();
    expect(s.user).toBe('marina'); // espaços aparados
    expect(s.token).toBeNull();
    expect(s.error).toContain('sendo construído');
    // o que foi para o cofre: o usuário, e nada de senha
    expect(vault.calls).toEqual([{ user: 'marina' }]);
  });

  it('sem "lembrar", nada vai para o cofre', async () => {
    await useAuth.getState().signIn('marina', 'senha123');
    expect(vault.calls).toEqual([]);
  });

  it('desmarcar "lembrar" esquece na hora', async () => {
    useAuth.getState().setRemember(true);
    await useAuth.getState().signIn('marina', 'senha123');
    expect(vault.saved).not.toBeNull();

    useAuth.getState().setRemember(false);
    expect(useAuth.getState().remember).toBe(false);
    expect(vault.saved).toBeNull();
  });

  it('restaura a sessão: com token volta logada, só com usuário deixa o campo preenchido', async () => {
    vault.saved = { user: 'marina', token: 'jwt.1' };
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: 'logged', user: 'marina', token: 'jwt.1', remember: true });

    fresh();
    vault.saved = { user: 'marina' };
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', user: 'marina', token: null, remember: true });
  });

  it('sem sessão guardada, "lembrar" volta desmarcado', async () => {
    useAuth.setState({ remember: true });
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', remember: false });
  });

  it('jogar sem conta libera a tela sem inventar login', () => {
    useAuth.getState().continueOffline();
    expect(useAuth.getState()).toMatchObject({ status: 'offline', user: null, token: null, error: null });
  });

  it('sair esquece a sessão guardada', async () => {
    vault.saved = { user: 'marina', token: 'jwt.1' };
    await useAuth.getState().restore();

    await useAuth.getState().signOut();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', user: null, token: null, remember: false });
    expect(vault.saved).toBeNull();
  });
});

describe('loja de login com o serviço no ar', () => {
  /** Troca o módulo por um com AUTH_URL preenchido (o valor é lido na importação). */
  async function withService(fetchMock: typeof fetch) {
    vi.resetModules();
    vi.stubEnv('VITE_AUTH_URL', 'https://contas.pokeru.test/');
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('./auth');
    return mod.useAuth;
  }

  it('troca a senha por um token e guarda usuário + token', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const store = await withService((async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return { ok: true, status: 200, json: async () => ({ token: 'jwt.novo' }) } as Response;
    }) as unknown as typeof fetch);

    store.getState().setRemember(true);
    expect(await store.getState().signIn('marina', 'senha123')).toBe(true);

    expect(calls[0].url).toBe('https://contas.pokeru.test/login');
    expect(calls[0].body).toEqual({ user: 'marina', password: 'senha123' });
    expect(store.getState()).toMatchObject({ status: 'logged', user: 'marina', token: 'jwt.novo', error: null });
    // no cofre: usuário e token. A senha ficou só no pedido.
    expect(vault.saved).toEqual({ user: 'marina', token: 'jwt.novo' });
  });

  it('senha errada é 401 com recado claro, e nada é guardado', async () => {
    const store = await withService((async () => ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch);
    store.getState().setRemember(true);

    expect(await store.getState().signIn('marina', 'errada')).toBe(false);
    expect(store.getState()).toMatchObject({ status: 'anon', error: 'Usuário ou senha incorretos.' });
    expect(vault.saved).toBeNull();
  });

  it('serviço fora do ar não derruba a tela', async () => {
    const store = await withService((async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch);

    expect(await store.getState().signIn('marina', 'senha123')).toBe(false);
    expect(store.getState().status).toBe('anon');
    expect(store.getState().error).toContain('ECONNREFUSED');
  });

  it('resposta sem token não vira sessão logada', async () => {
    const store = await withService((async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response) as unknown as typeof fetch);

    expect(await store.getState().signIn('marina', 'senha123')).toBe(false);
    expect(store.getState()).toMatchObject({ status: 'anon', error: 'O serviço não devolveu um token.' });
  });
});
