import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';

/**
 * Verificação do JWT que o GBOT emite.
 *
 * Só o GBOT assina; nós **validamos** com a chave pública do JWKS e não guardamos segredo nenhum —
 * por isso um servidor de jogo comprometido não consegue emitir token de ninguém.
 *
 * O que é checado, e por quê:
 *
 *   - **`alg` fixo em RS256.** A biblioteca nunca escolhe pelo header do token: é assim que se
 *     aceita `alg: none`, ou um HMAC assinado com a própria chave pública (que é… pública).
 *   - **assinatura** contra a chave do JWKS escolhida pelo `kid` do header.
 *   - **`exp`**, com 60s de tolerância de relógio.
 *   - **`iss`** igual ao configurado (`gbot`).
 *   - **`aud`**, se e somente se a instância definir uma.
 *
 * O JWKS fica em memória e é rebuscado quando aparece um `kid` desconhecido — é assim que a
 * rotação de chave funciona sem derrubar ninguém. Não se baixa o JWKS a cada requisição.
 */

export interface Claims {
  /** Id da **conta** da API (`accounts.id`), como string. Não é o id do Discord. */
  sub: string;
  username?: string;
  /** Id do Discord vinculado — **ausente** quando a conta não tem vínculo. */
  discord_id?: string;
  nickname?: string;
  admin?: boolean;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp: number;
  jti?: string;
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

export interface JwtOptions {
  /** URL do JWKS, ex. `https://gbot.interno/.well-known/jwks.json`. */
  jwksUrl: string;
  /** Emissor esperado. */
  issuer?: string;
  /** Audiência esperada — só quando a instância do GBOT define uma. */
  audience?: string;
  /** Tolerância de relógio, em segundos (o máximo recomendado é 60). */
  leeway?: number;
  fetch?: typeof globalThis.fetch;
  /** Intervalo mínimo entre buscas do JWKS, para um `kid` errado não virar enxurrada. */
  minRefetchMs?: number;
}

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

const b64urlToBuf = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function decodeJson<T>(part: string, what: string): T {
  try {
    return JSON.parse(b64urlToBuf(part).toString('utf8')) as T;
  } catch {
    throw new JwtError(`${what} do token não é JSON`);
  }
}

export class JwtVerifier {
  private keys = new Map<string, KeyObject>();
  private lastFetch = 0;
  private inFlight: Promise<void> | null = null;
  private readonly http: typeof globalThis.fetch;

  constructor(private readonly opts: JwtOptions) {
    this.http = opts.fetch ?? globalThis.fetch;
  }

  /** Busca o JWKS e guarda as chaves por `kid`. Uma busca por vez, com intervalo mínimo. */
  private async refresh(force: boolean): Promise<void> {
    const min = this.opts.minRefetchMs ?? 10_000;
    if (!force && this.keys.size && Date.now() - this.lastFetch < min) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      const res = await this.http(this.opts.jwksUrl);
      if (!res.ok) throw new JwtError(`JWKS respondeu ${res.status}`);
      const body = (await res.json()) as { keys?: Jwk[] };
      const found = new Map<string, KeyObject>();
      for (const jwk of body.keys ?? []) {
        // só RSA para assinatura serve aqui
        if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
        if (jwk.use && jwk.use !== 'sig') continue;
        if (jwk.alg && jwk.alg !== 'RS256') continue;
        try {
          found.set(jwk.kid ?? '', createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
        } catch {
          // chave que o Node não aceita: ignora as outras continuam valendo
        }
      }
      if (!found.size) throw new JwtError('JWKS sem chave RSA de assinatura');
      this.keys = found;
      this.lastFetch = Date.now();
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async keyFor(kid: string): Promise<KeyObject> {
    await this.refresh(false);
    const known = this.keys.get(kid) ?? (this.keys.size === 1 && !kid ? [...this.keys.values()][0] : undefined);
    if (known) return known;
    // kid desconhecido: é o que acontece quando o GBOT roda a chave
    const min = this.opts.minRefetchMs ?? 10_000;
    if (Date.now() - this.lastFetch >= min) await this.refresh(true);
    const fresh = this.keys.get(kid);
    if (!fresh) throw new JwtError('token assinado por uma chave desconhecida');
    return fresh;
  }

  /** Valida o token e devolve as claims. Lança `JwtError` com o motivo. */
  async verify(token: string): Promise<Claims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new JwtError('token malformado');
    const [rawHeader, rawPayload, rawSig] = parts;

    const header = decodeJson<{ alg?: string; kid?: string; typ?: string }>(rawHeader, 'cabeçalho');
    // lista fixa: nunca o que o próprio token pede
    if (header.alg !== 'RS256') throw new JwtError(`algoritmo ${header.alg ?? 'ausente'} não é aceito (só RS256)`);

    const key = await this.keyFor(header.kid ?? '');
    const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${rawHeader}.${rawPayload}`), key, b64urlToBuf(rawSig));
    if (!ok) throw new JwtError('assinatura inválida');

    const claims = decodeJson<Claims>(rawPayload, 'conteúdo');
    const now = Math.floor(Date.now() / 1000);
    const leeway = Math.min(60, Math.max(0, this.opts.leeway ?? 60));

    if (typeof claims.exp !== 'number' || claims.exp + leeway < now) throw new JwtError('token expirado');
    if (typeof claims.iat === 'number' && claims.iat - leeway > now) throw new JwtError('token emitido no futuro');
    if (this.opts.issuer && claims.iss !== this.opts.issuer) throw new JwtError(`emissor inesperado: ${claims.iss ?? 'ausente'}`);
    if (this.opts.audience) {
      const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
      if (!aud.includes(this.opts.audience)) throw new JwtError('audiência inesperada');
    }
    if (typeof claims.sub !== 'string' || !claims.sub) throw new JwtError('token sem sub');

    return claims;
  }
}

/** Lê as claims **sem validar** — só para log e diagnóstico. Nunca para decidir nada. */
export function peekClaims(token: string): Partial<Claims> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return decodeJson<Claims>(parts[1], 'conteúdo');
  } catch {
    return null;
  }
}
