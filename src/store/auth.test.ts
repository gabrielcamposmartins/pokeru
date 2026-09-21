import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A loja de login fala com o **gateway do servidor Pokeru** (`/auth/*`), que repassa para a API
 * interna do bot. O que interessa testar aqui: o que é guardado (usuário e token, nunca a senha),
 * o que a tela mostra, e o vínculo do Discord.
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

const { useAuth, AUTH_URL, gatewayFor, readClaims } = await import('./auth');

/** Um JWT de mentira (não é assinado: aqui ninguém valida — quem valida é o servidor). */
function fakeJwt(claims: Record<string, unknown>, segundos = 3600): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ exp: Math.floor(Date.now() / 1000) + segundos, ...claims })}.assinatura`;
}

/** Servidor de mentira: guarda as chamadas e responde o que o teste mandar. */
function server(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];
  const fetchMock = (async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(AUTH_URL, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url: path,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
      auth: headers.Authorization ?? null,
    });
    const r = routes[path];
    if (!r) return { ok: false, status: 404, text: async () => JSON.stringify({ error: 'rota desconhecida' }) } as Response;
    const status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.body ?? {}), json: async () => r.body ?? {} } as Response;
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const reset = () => useAuth.setState({ status: 'anon', user: null, token: null, discord: null, remember: false, error: null, serviceReady: false, busy: false });

beforeEach(() => {
  vault.saved = null;
  vault.calls = [];
  vi.unstubAllGlobals();
  reset();
});

describe('endereço do serviço de contas', () => {
  it('é o mesmo servidor das mesas, em http', () => {
    expect(gatewayFor('ws://35.209.186.9:3001')).toBe('http://35.209.186.9:3001');
    expect(gatewayFor('wss://poker.exemplo.com/')).toBe('https://poker.exemplo.com');
  });
});

describe('ler o token', () => {
  it('tira as claims do JWT sem validar (é só para a tela)', () => {
    const token = fakeJwt({ sub: '3', username: 'gabi', discord_id: '123' });
    expect(readClaims(token)).toMatchObject({ sub: '3', username: 'gabi', discord_id: '123' });
    expect(readClaims('não-é-token')).toBeNull();
  });
});

describe('entrar', () => {
  it('cobra usuário e senha antes de chamar o serviço', async () => {
    const calls = server({});
    expect(await useAuth.getState().signIn('', '')).toBe(false);
    expect(useAuth.getState().error).toBe('Preencha usuário e senha.');
    expect(calls).toEqual([]);
  });

  it('troca a senha por um token e guarda usuário + token', async () => {
    const token = fakeJwt({ sub: '3', username: 'gabi' });
    const calls = server({ '/auth/login': { body: { token, user: 'gabi', discord: null } } });

    useAuth.getState().setRemember(true);
    expect(await useAuth.getState().signIn(' gabi ', 'senha123')).toBe(true);

    expect(calls[0]).toMatchObject({ url: '/auth/login', method: 'POST', body: { user: 'gabi', password: 'senha123' } });
    expect(useAuth.getState()).toMatchObject({ status: 'logged', user: 'gabi', token, error: null });
    // no cofre: usuário e token. A senha ficou só no pedido.
    expect(vault.saved).toEqual({ user: 'gabi', token });
  });

  it('sem "lembrar", nada vai para o cofre', async () => {
    server({ '/auth/login': { body: { token: fakeJwt({ sub: '3' }), user: 'gabi', discord: null } } });
    await useAuth.getState().signIn('gabi', 'senha123');
    expect(vault.calls).toEqual([]);
  });

  it('mostra a mensagem que o serviço mandou', async () => {
    server({ '/auth/login': { status: 401, body: { error: 'usuario ou senha invalidos' } } });
    useAuth.getState().setRemember(true);

    expect(await useAuth.getState().signIn('gabi', 'errada')).toBe(false);
    expect(useAuth.getState()).toMatchObject({ status: 'anon', error: 'usuario ou senha invalidos' });
    expect(vault.saved).toBeNull();
  });

  it('servidor fora do ar não derruba a tela', async () => {
    vi.stubGlobal('fetch', (async () => {
      throw new Error('Failed to fetch');
    }) as unknown as typeof fetch);

    expect(await useAuth.getState().signIn('gabi', 'senha123')).toBe(false);
    expect(useAuth.getState().status).toBe('anon');
    expect(useAuth.getState().error).toMatch(/não foi possível falar com o servidor/);
  });

  it('o Discord vinculado vem na resposta do login', async () => {
    const token = fakeJwt({ sub: '3', username: 'gabi', discord_id: '343954786300854276' });
    server({ '/auth/login': { body: { token, user: 'gabi', discord: '343954786300854276' } } });

    await useAuth.getState().signIn('gabi', 'senha123');
    expect(useAuth.getState().discord).toBe('343954786300854276');
  });
});

describe('criar conta', () => {
  it('cobra senha de 8 caracteres antes de chamar o serviço', async () => {
    const calls = server({});
    expect(await useAuth.getState().register('gabi', 'curta')).toBe(false);
    expect(useAuth.getState().error).toMatch(/8 caracteres/);
    expect(calls).toEqual([]);
  });

  it('cria e já entra', async () => {
    const token = fakeJwt({ sub: '9', username: 'nova' });
    const calls = server({ '/auth/register': { status: 201, body: { token, user: 'nova', discord: null } } });

    expect(await useAuth.getState().register('nova', 'senha-boa-123')).toBe(true);
    expect(calls[0].url).toBe('/auth/register');
    expect(useAuth.getState()).toMatchObject({ status: 'logged', user: 'nova', token });
  });

  it('usuário tomado é 409 com a mensagem do serviço', async () => {
    server({ '/auth/register': { status: 409, body: { error: 'usuario ja existe' } } });
    expect(await useAuth.getState().register('gabi', 'senha-boa-123')).toBe(false);
    expect(useAuth.getState().error).toBe('usuario ja existe');
  });
});

describe('restaurar a sessão', () => {
  it('token válido volta logado, com o Discord das claims', async () => {
    const token = fakeJwt({ sub: '3', username: 'gabi', discord_id: '123' });
    vault.saved = { user: 'gabi', token };
    server({ '/health': { body: { auth: 'gbot' } } });

    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: 'logged', user: 'gabi', token, discord: '123', remember: true, serviceReady: true });
  });

  it('token vencido: o usuário fica lembrado, mas precisa entrar de novo (não há refresh)', async () => {
    vault.saved = { user: 'gabi', token: fakeJwt({ sub: '3' }, -60) };
    server({ '/health': { body: { auth: 'gbot' } } });

    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', user: 'gabi', token: null, remember: true });
  });

  it('servidor sem serviço de contas: a tela avisa em vez de insistir', async () => {
    server({ '/health': { body: { auth: 'off' } } });
    await useAuth.getState().restore();
    expect(useAuth.getState().serviceReady).toBe(false);
  });

  it('sem sessão guardada, "lembrar" volta desmarcado', async () => {
    server({ '/health': { body: { auth: 'gbot' } } });
    useAuth.setState({ remember: true });
    await useAuth.getState().restore();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', remember: false });
  });
});

describe('sair e jogar sem conta', () => {
  it('jogar sem conta libera a tela sem inventar login', () => {
    useAuth.getState().continueOffline();
    expect(useAuth.getState()).toMatchObject({ status: 'offline', user: null, token: null });
  });

  it('sair esquece a sessão guardada', async () => {
    vault.saved = { user: 'gabi', token: fakeJwt({ sub: '3' }) };
    server({ '/health': { body: { auth: 'gbot' } } });
    await useAuth.getState().restore();

    await useAuth.getState().signOut();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', user: null, token: null, discord: null, remember: false });
    expect(vault.saved).toBeNull();
  });

  it('desmarcar "lembrar" esquece na hora', async () => {
    server({ '/auth/login': { body: { token: fakeJwt({ sub: '3' }), user: 'gabi', discord: null } } });
    useAuth.getState().setRemember(true);
    await useAuth.getState().signIn('gabi', 'senha123');
    expect(vault.saved).not.toBeNull();

    useAuth.getState().setRemember(false);
    expect(vault.saved).toBeNull();
  });
});

describe('vincular o Discord', () => {
  it('pede o código com a sessão do jogador', async () => {
    const token = fakeJwt({ sub: '3', username: 'gabi' });
    useAuth.setState({ status: 'logged', user: 'gabi', token });
    const calls = server({ '/auth/discord/code': { body: { ok: true } } });

    expect(await useAuth.getState().discordCode('343954786300854276')).toBeNull();
    expect(calls[0]).toMatchObject({ url: '/auth/discord/code', method: 'POST', body: { discordId: '343954786300854276' }, auth: `Bearer ${token}` });
  });

  it('conclui o vínculo e passa a mostrar o Discord', async () => {
    useAuth.setState({ status: 'logged', user: 'gabi', token: fakeJwt({ sub: '3' }) });
    server({ '/auth/discord/link': { body: { ok: true, discord: '343954786300854276', pado: 2785 } } });

    expect(await useAuth.getState().discordLink('aB3xZ')).toBeNull();
    expect(useAuth.getState().discord).toBe('343954786300854276');
  });

  it('código errado devolve o motivo, sem vincular', async () => {
    useAuth.setState({ status: 'logged', user: 'gabi', token: fakeJwt({ sub: '3' }) });
    server({ '/auth/discord/link': { status: 400, body: { error: 'codigo invalido ou expirado' } } });

    expect(await useAuth.getState().discordLink('xxxxx')).toBe('codigo invalido ou expirado');
    expect(useAuth.getState().discord).toBeNull();
  });

  it('desvincular limpa o vínculo', async () => {
    useAuth.setState({ status: 'logged', user: 'gabi', token: fakeJwt({ sub: '3' }), discord: '123' });
    server({ '/auth/discord/unlink': { body: { ok: true } } });

    expect(await useAuth.getState().discordUnlink()).toBeNull();
    expect(useAuth.getState().discord).toBeNull();
  });

  it('sem sessão não dá para vincular nada', async () => {
    expect(await useAuth.getState().discordCode('123')).toMatch(/entre na sua conta/);
    expect(await useAuth.getState().discordLink('aB3xZ')).toMatch(/entre na sua conta/);
  });
});

describe('caminho sem TLS', () => {
  it('http para outro host é sem TLS: a senha atravessa a rede em claro', async () => {
    const { insecureGateway } = await import('./auth');
    expect(insecureGateway('http://35.209.186.9:3001')).toBe(true);
    expect(insecureGateway('http://poker.exemplo.com')).toBe(true);
  });

  it('localhost não conta: o tráfego não sai da máquina', async () => {
    const { insecureGateway } = await import('./auth');
    expect(insecureGateway('http://localhost:3001')).toBe(false);
    expect(insecureGateway('http://127.0.0.1:3001')).toBe(false);
  });

  it('https nunca é sem TLS', async () => {
    const { insecureGateway } = await import('./auth');
    expect(insecureGateway('https://35.209.186.9:3001')).toBe(false);
  });
});
