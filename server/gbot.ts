import { randomUUID } from 'node:crypto';

/**
 * Cliente da API do GBOT — o bot do Discord que guarda as contas e a economia dos **padocoins**.
 *
 * A API é interna (não é exposta à internet), então **o cliente do jogo nunca fala com ela**: quem
 * fala é este servidor, que é quem alcança a rede interna. O jogo manda usuário e senha para o
 * nosso gateway HTTP (`/auth/*` em server/index.ts), o gateway repassa para cá, e o JWT que volta
 * é o que identifica o jogador na conexão do jogo.
 *
 * Duas identidades diferentes andam por aqui, e confundi-las é o erro clássico:
 *
 *   - **conta da API** (`accounts.id`, a claim `sub`): quem faz login. É a identidade do jogador.
 *   - **id do Discord** (`discord_id`): indexa a **economia**. Só existe se a conta tiver vínculo.
 *
 * Toda rota que mexe em dinheiro exige um Bearer. Para essas, usamos o token do **serviço**
 * (GBOT_USER/GBOT_PASS), não o do jogador: o jogador pode ter saído, e uma compra não deveria
 * depender da validade do token dele. Para as rotas que agem sobre a própria conta
 * (`/accounts/link`, `/accounts/unlink`) vai o token **do jogador**, que é o que diz qual conta é.
 */

export interface GbotAccount {
  id: number;
  username: string;
  discord_id: string | null;
  created_at?: string;
  linked_at?: string | null;
}

export interface GbotLogin {
  token: string;
  token_type: string;
  expires_in: number;
  account: GbotAccount;
}

/** Usuário da economia (indexado pelo id do Discord). */
export interface GbotUser {
  user_id: string;
  username: string;
  nickname: string | null;
  balance: number;
  /** Conta Riot vinculada — dado pessoal, não repassamos adiante. */
  puuid?: string | null;
}

export interface GbotMove {
  ok: boolean;
  user_id: string;
  before: number;
  after: number;
}

/**
 * A API embrulha alguns objetos numa chave (`{"user": {…}}`, `{"account": {…}}`) e outros não
 * (`/login`, `/users`). A documentação mostra a forma solta, o servidor responde embrulhada — e ler
 * o campo errado não dá erro nenhum: vem `undefined`, atravessa o código e aparece como
 * "saldo indisponível" três telas depois. Por isso desembrulhar é tolerante nas duas direções.
 */
function unwrap<T>(body: unknown, key: string): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && key in (body as object)) {
    const inner = (body as Record<string, unknown>)[key];
    if (inner && typeof inner === 'object') return inner as T;
  }
  return body as T;
}

/** Número que veio da rede, ou null quando não é número — `undefined` silencioso é o inimigo. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Erro da API, com o status HTTP e a mensagem que ela mandou (em português). */
export class GbotError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GbotError';
  }
}

export interface GbotOptions {
  /** Base da API, ex. `https://gbot.interno`. */
  base: string;
  /** Conta de serviço, para as rotas que movem dinheiro. */
  user?: string;
  pass?: string;
  /** Trocável nos testes. */
  fetch?: typeof globalThis.fetch;
  /** Tempo máximo de uma chamada (ms). */
  timeoutMs?: number;
}

/** Quanto antes do `exp` o token do serviço é renovado. */
const RENEW_MARGIN_MS = 60_000;

export class Gbot {
  private readonly base: string;
  private readonly http: typeof globalThis.fetch;
  private service: { token: string; until: number } | null = null;
  private serviceInFlight: Promise<string> | null = null;

  constructor(private readonly opts: GbotOptions) {
    this.base = opts.base.replace(/\/+$/, '');
    this.http = opts.fetch ?? globalThis.fetch;
  }

  /** A conta de serviço está configurada? Sem ela, nada de comprar com padocoins. */
  get canMoveMoney(): boolean {
    return !!(this.opts.user && this.opts.pass);
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.opts.timeoutMs ?? 8000);
    timer.unref?.();
    try {
      const res = await this.http(`${this.base}${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // resposta que não é JSON (proxy no caminho, por exemplo)
      }
      if (!res.ok) {
        const msg = (data as { response?: string } | null)?.response;
        throw new GbotError(res.status, msg || `GBOT respondeu ${res.status}`);
      }
      return data as T;
    } catch (err) {
      if (err instanceof GbotError) throw err;
      // timeout e falha de rede viram 503: é problema nosso/da rede, não do jogador
      const why = err instanceof Error && err.name === 'AbortError' ? 'o serviço de contas não respondeu' : 'não foi possível falar com o serviço de contas';
      throw new GbotError(503, why);
    } finally {
      clearTimeout(timer);
    }
  }

  private bearer(token: string): Record<string, string> {
    // o GBOT é sensível a caixa: exatamente "Bearer <token>"
    return { Authorization: `Bearer ${token}` };
  }

  // ------------------------------------------------------------------ contas

  async createAccount(username: string, password: string): Promise<GbotAccount> {
    return unwrap<GbotAccount>(await this.call('POST', '/accounts', { username, password }), 'account');
  }

  login(username: string, password: string): Promise<GbotLogin> {
    return this.call<GbotLogin>('POST', '/login', { username, password });
  }

  /** A conta de quem está com o token. É por aqui que se confirma um vínculo feito após o login. */
  async me(token: string): Promise<GbotAccount & { balance?: number }> {
    return unwrap(await this.call('GET', '/me', undefined, this.bearer(token)), 'account');
  }

  /** Pede o código de vínculo: o bot manda 5 caracteres na DM daquele Discord. */
  requestLinkCode(discordId: string): Promise<unknown> {
    return this.call('POST', '/auth', { id: discordId });
  }

  /** Conclui o vínculo, como o jogador (o token dele é quem diz qual conta é). */
  async link(playerToken: string, code: string): Promise<GbotAccount> {
    return unwrap<GbotAccount>(await this.call('POST', '/accounts/link', { code }, this.bearer(playerToken)), 'account');
  }

  async unlink(playerToken: string): Promise<GbotAccount> {
    return unwrap<GbotAccount>(await this.call('POST', '/accounts/unlink', undefined, this.bearer(playerToken)), 'account');
  }

  changePassword(playerToken: string, current_password: string, new_password: string): Promise<{ ok: boolean }> {
    return this.call('POST', '/accounts/password', { current_password, new_password }, this.bearer(playerToken));
  }

  // ---------------------------------------------------------------- economia

  /** Token do serviço, renovado com folga antes de expirar. */
  async serviceToken(): Promise<string> {
    if (!this.canMoveMoney) throw new GbotError(503, 'servidor sem conta de serviço no GBOT');
    if (this.service && Date.now() < this.service.until) return this.service.token;
    // uma renovação só, mesmo com várias compras ao mesmo tempo
    this.serviceInFlight ??= this.login(this.opts.user!, this.opts.pass!)
      .then((r) => {
        this.service = { token: r.token, until: Date.now() + Math.max(0, r.expires_in * 1000 - RENEW_MARGIN_MS) };
        return r.token;
      })
      .finally(() => {
        this.serviceInFlight = null;
      });
    return this.serviceInFlight;
  }

  /** Saldo e nome de quem tem aquele Discord (null quando não existe na economia). */
  async user(discordId: string): Promise<GbotUser | null> {
    try {
      const token = this.canMoveMoney ? await this.serviceToken() : null;
      const body = await this.call('GET', `/user/${encodeURIComponent(discordId)}`, undefined, token ? this.bearer(token) : {});
      const user = unwrap<GbotUser>(body, 'user');
      const balance = num(user?.balance);
      // saldo que não é número é resposta que não entendemos: melhor falhar do que mostrar vazio
      if (balance === null) throw new GbotError(502, `o serviço respondeu um saldo que não é número para ${discordId}`);
      // puuid é dado pessoal da Riot e não tem uso aqui: fica de fora
      return { user_id: user.user_id ?? discordId, username: user.username, nickname: user.nickname ?? null, balance };
    } catch (err) {
      if (err instanceof GbotError && err.status === 404) return null;
      throw err;
    }
  }

  /** Mesma leitura, pelo nome no Discord. Serve de rede quando o id não acha ninguém. */
  async userByName(username: string): Promise<GbotUser | null> {
    try {
      const token = this.canMoveMoney ? await this.serviceToken() : null;
      const body = await this.call('GET', `/user/username/${encodeURIComponent(username)}`, undefined, token ? this.bearer(token) : {});
      const user = unwrap<GbotUser>(body, 'user');
      const balance = num(user?.balance);
      if (balance === null) throw new GbotError(502, `o serviço respondeu um saldo que não é número para ${username}`);
      return { user_id: user.user_id, username: user.username, nickname: user.nickname ?? null, balance };
    } catch (err) {
      if (err instanceof GbotError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Tira padocoins de alguém. `key` vai no `Idempotency-Key`: se a chamada der timeout e for
   * repetida, o GBOT devolve a resposta guardada em vez de debitar duas vezes.
   */
  async debit(discordId: string, quantity: number, reason: string, key: string = randomUUID()): Promise<GbotMove> {
    return this.move('debit', discordId, quantity, reason, key);
  }

  async credit(discordId: string, quantity: number, reason: string, key: string = randomUUID()): Promise<GbotMove> {
    return this.move('credit', discordId, quantity, reason, key);
  }

  /**
   * Move padocoins e devolve o saldo depois.
   *
   * Se a resposta não trouxer o saldo num formato que a gente entenda, o valor é relido em
   * `/user/{id}` em vez de virar `undefined` — o movimento já aconteceu, e o que não pode é o jogo
   * passar a mostrar um saldo inventado por causa do formato da resposta.
   */
  private async move(op: 'debit' | 'credit', discordId: string, quantity: number, reason: string, key: string): Promise<GbotMove> {
    const token = await this.serviceToken();
    const body = await this.call('POST', `/economy/${op}`, { id: discordId, quantity, reason }, { ...this.bearer(token), 'Idempotency-Key': key });
    const move = unwrap<GbotMove>(body, 'user');
    const after = num(move?.after);
    if (after !== null) return { ok: true, user_id: move.user_id ?? discordId, before: num(move.before) ?? after + (op === 'debit' ? quantity : -quantity), after };
    console.warn(`[padocoin] ${op} respondeu num formato inesperado; relendo o saldo de ${discordId}`);
    const relido = await this.user(discordId);
    const saldo = relido?.balance ?? 0;
    return { ok: true, user_id: discordId, before: saldo + (op === 'debit' ? quantity : -quantity), after: saldo };
  }
}
