import { describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync, createHmac } from 'node:crypto';
import { JwtError, JwtVerifier, peekClaims, type Claims } from './jwt';

/**
 * A validação do JWT é a porta de entrada do jogo: quem passa por ela é o jogador que o servidor
 * vai acreditar ser. Os testes daqui são, na maior parte, tentativas de entrar sem chave.
 */

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
  return { privateKey, jwk };
}

const par = keypair();
const outro = keypair();

/** Assina um token RS256 como o GBOT assinaria. */
function sign(claims: Partial<Claims>, opts: { kid?: string; alg?: string; key?: typeof par.privateKey } = {}) {
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' };
  const body: Record<string, unknown> = {
    sub: '3',
    username: 'servico-loja',
    iss: 'gbot',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'abc',
    ...claims,
  };
  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const s = createSign('RSA-SHA256');
  s.update(head);
  return `${head}.${s.sign(opts.key ?? par.privateKey, 'base64url')}`;
}

/** Um JWKS servido de mentira; `calls` conta quantas vezes foi buscado. */
function jwks(keys: { kid: string; jwk: { n: string; e: string } }[]) {
  const state = { calls: 0 };
  const fetchMock = (async () => {
    state.calls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ keys: keys.map((k) => ({ kty: 'RSA', use: 'sig', alg: 'RS256', kid: k.kid, n: k.jwk.n, e: k.jwk.e })) }),
    } as Response;
  }) as unknown as typeof fetch;
  return { state, fetchMock };
}

const verifier = (over: Partial<ConstructorParameters<typeof JwtVerifier>[0]> = {}, keys = [{ kid: 'k1', jwk: par.jwk }]) => {
  const { state, fetchMock } = jwks(keys);
  return { state, v: new JwtVerifier({ jwksUrl: 'https://gbot.test/.well-known/jwks.json', issuer: 'gbot', fetch: fetchMock, ...over }) };
};

describe('validação do JWT do GBOT', () => {
  it('aceita um token bem assinado e devolve as claims', async () => {
    const { v } = verifier();
    const claims = await v.verify(sign({ discord_id: '343954786300854276', nickname: 'Mogleo', admin: false }));
    expect(claims.sub).toBe('3');
    expect(claims.discord_id).toBe('343954786300854276');
    expect(claims.username).toBe('servico-loja');
  });

  it('conta sem Discord vinculado é um estado válido: discord_id ausente', async () => {
    const { v } = verifier();
    const claims = await v.verify(sign({}));
    expect(claims.discord_id).toBeUndefined();
  });

  it('recusa alg: none — o clássico', async () => {
    const { v } = verifier();
    const header = b64url(JSON.stringify({ alg: 'none', kid: 'k1' }));
    const body = b64url(JSON.stringify({ sub: '3', iss: 'gbot', exp: Math.floor(Date.now() / 1000) + 60 }));
    await expect(v.verify(`${header}.${body}.`)).rejects.toThrow(JwtError);
  });

  it('recusa HMAC assinado com a chave pública', async () => {
    const { v } = verifier();
    const header = b64url(JSON.stringify({ alg: 'HS256', kid: 'k1' }));
    const body = b64url(JSON.stringify({ sub: '3', iss: 'gbot', exp: Math.floor(Date.now() / 1000) + 60 }));
    const mac = createHmac('sha256', par.jwk.n).update(`${header}.${body}`).digest('base64url');
    await expect(v.verify(`${header}.${body}.${mac}`)).rejects.toThrow(/RS256/);
  });

  it('recusa assinatura de outra chave', async () => {
    const { v } = verifier();
    await expect(v.verify(sign({}, { key: outro.privateKey }))).rejects.toThrow(/assinatura inválida/);
  });

  it('recusa conteúdo trocado depois de assinado', async () => {
    const { v } = verifier();
    const token = sign({ sub: '3' });
    const [h, , s] = token.split('.');
    const forjado = b64url(JSON.stringify({ sub: '999', iss: 'gbot', exp: Math.floor(Date.now() / 1000) + 60 }));
    await expect(v.verify(`${h}.${forjado}.${s}`)).rejects.toThrow(/assinatura inválida/);
  });

  it('recusa token expirado, mas perdoa 60s de relógio', async () => {
    const { v } = verifier();
    const agora = Math.floor(Date.now() / 1000);
    await expect(v.verify(sign({ exp: agora - 3600 }))).rejects.toThrow(/expirado/);
    // 30s no passado ainda passa: relógios não batem exatamente
    await expect(v.verify(sign({ exp: agora - 30 }))).resolves.toMatchObject({ sub: '3' });
  });

  it('recusa emissor diferente do configurado', async () => {
    const { v } = verifier();
    await expect(v.verify(sign({ iss: 'outro-bot' }))).rejects.toThrow(/emissor/);
  });

  it('cobra a audiência só quando há uma configurada', async () => {
    const semAud = verifier();
    await expect(semAud.v.verify(sign({}))).resolves.toBeTruthy();

    const comAud = verifier({ audience: 'pokeru' });
    await expect(comAud.v.verify(sign({}))).rejects.toThrow(/audiência/);
    await expect(comAud.v.verify(sign({ aud: 'pokeru' }))).resolves.toBeTruthy();
    await expect(comAud.v.verify(sign({ aud: ['outro', 'pokeru'] }))).resolves.toBeTruthy();
  });

  it('recusa token sem sub', async () => {
    const { v } = verifier();
    await expect(v.verify(sign({ sub: undefined as never }))).rejects.toThrow(/sub/);
  });

  it('recusa lixo no lugar do token', async () => {
    const { v } = verifier();
    for (const ruim of ['', 'abc', 'a.b', 'a.b.c.d', 'não.é.token']) {
      await expect(v.verify(ruim), ruim).rejects.toThrow(JwtError);
    }
  });

  it('guarda o JWKS em memória: não busca a cada token', async () => {
    const { v, state } = verifier();
    await v.verify(sign({}));
    await v.verify(sign({}));
    await v.verify(sign({}));
    expect(state.calls).toBe(1);
  });

  it('busca de novo quando aparece um kid desconhecido (rotação de chave)', async () => {
    vi.useFakeTimers();
    try {
      // o JWKS começa só com k1 e, depois, passa a ter k2 também
      let servidas = [{ kid: 'k1', jwk: par.jwk }];
      let calls = 0;
      const fetchMock = (async () => {
        calls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: servidas.map((k) => ({ kty: 'RSA', kid: k.kid, n: k.jwk.n, e: k.jwk.e })) }),
        } as Response;
      }) as unknown as typeof fetch;
      const v = new JwtVerifier({ jwksUrl: 'https://gbot.test/jwks', issuer: 'gbot', fetch: fetchMock, minRefetchMs: 1000 });

      await v.verify(sign({}));
      expect(calls).toBe(1);

      servidas = [{ kid: 'k1', jwk: par.jwk }, { kid: 'k2', jwk: outro.jwk }];
      // sem esperar o intervalo mínimo, o kid novo não é buscado
      await expect(v.verify(sign({}, { kid: 'k2', key: outro.privateKey }))).rejects.toThrow(/chave desconhecida/);
      vi.advanceTimersByTime(2000);
      await expect(v.verify(sign({}, { kid: 'k2', key: outro.privateKey }))).resolves.toMatchObject({ sub: '3' });
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('JWKS fora do ar não deixa ninguém entrar', async () => {
    const fetchMock = (async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const v = new JwtVerifier({ jwksUrl: 'https://gbot.test/jwks', fetch: fetchMock });
    await expect(v.verify(sign({}))).rejects.toThrow(/502/);
  });
});

describe('peekClaims', () => {
  it('lê as claims sem validar (só para log)', () => {
    expect(peekClaims(sign({ sub: '7' }))?.sub).toBe('7');
    expect(peekClaims('não-é-token')).toBeNull();
  });
});
