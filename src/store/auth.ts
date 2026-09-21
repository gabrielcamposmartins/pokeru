import { create } from 'zustand';
import { clearSession, hasSavedSession, loadSession, saveSession } from '../auth/vault';
import { SERVER_URL } from './profile';

/**
 * Login do jogador.
 *
 * A conta é do **serviço do GBOT** (o bot do Discord), mas o jogo não fala com ele diretamente: a
 * API é interna. Quem fala é o servidor Pokeru, no gateway `/auth/*` — e é ele também que valida
 * o JWT quando o jogo conecta. Daí o endereço daqui sair do endereço do servidor.
 *
 * O que fica guardado neste computador: **usuário e token**. A senha nunca — ela serve para pedir
 * o token e é descartada (veja src/auth/vault.ts).
 *
 * Não existe refresh token: o JWT vale uma hora. Quando expira, é entrar de novo. Por isso a
 * sessão restaurada pode voltar como "o usuário está lembrado, mas precisa entrar".
 */

/** `ws://host:3001` → `http://host:3001`: o gateway mora no mesmo servidor das mesas. */
export function gatewayFor(serverUrl: string): string {
  return serverUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/+$/, '');
}

/** Endereço do serviço de contas. `VITE_AUTH_URL` sobrepõe (útil para desenvolver). */
export const AUTH_URL: string = import.meta.env?.VITE_AUTH_URL || gatewayFor(SERVER_URL);

export type AuthStatus = 'anon' | 'restoring' | 'signing' | 'logged' | 'offline';

/** As claims que o jogo usa da sessão (lidas do JWT só para mostrar). */
export interface SessionClaims {
  sub: string;
  username?: string;
  discord_id?: string;
  nickname?: string;
  exp?: number;
}

/** Lê o conteúdo do JWT **sem validar** — quem valida é o servidor. Aqui é só para a tela. */
export function readClaims(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json))) as SessionClaims;
  } catch {
    try {
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as SessionClaims;
    } catch {
      return null;
    }
  }
}

/** O token já venceu? (sem folga: quem decide de verdade é o servidor) */
function expired(token: string): boolean {
  const exp = readClaims(token)?.exp;
  return typeof exp === 'number' && exp * 1000 <= Date.now();
}

export interface AuthState {
  status: AuthStatus;
  /** Usuário logado (ou o lembrado, para o campo vir preenchido). */
  user: string | null;
  /** Token da sessão — é o que identifica o jogador na conexão com o servidor. */
  token: string | null;
  /** Id do Discord vinculado, segundo a sessão (null = sem vínculo). */
  discord: string | null;
  remember: boolean;
  error: string | null;
  /** O serviço de contas está no ar? (descoberto no `/health` do servidor) */
  serviceReady: boolean;
  /** Uma chamada ao serviço está em curso (vincular Discord, cadastrar…). */
  busy: boolean;
  setRemember(on: boolean): void;
  /** Lê a sessão guardada e pergunta ao servidor se há serviço de contas (chamado ao abrir). */
  restore(): Promise<void>;
  /** Entra: pede o token ao serviço e guarda a sessão se "lembrar" estiver marcado. */
  signIn(user: string, password: string): Promise<boolean>;
  /** Cria a conta e já entra. */
  register(user: string, password: string): Promise<boolean>;
  /** Segue sem conta (o jogo offline e as mesas livres continuam valendo). */
  continueOffline(): void;
  /** Sai: esquece a sessão guardada. */
  signOut(): Promise<void>;
  /** Pede ao bot o código de vínculo, que chega na DM daquele Discord. */
  discordCode(discordId: string): Promise<string | null>;
  /** Conclui o vínculo com o código da DM. */
  discordLink(code: string): Promise<string | null>;
  discordUnlink(): Promise<string | null>;
}

const api = (path: string) => `${AUTH_URL}/auth${path}`;

/** Chamada ao gateway. Devolve o corpo, ou lança com a mensagem que o serviço mandou. */
async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(api(path), {
    ...rest,
    headers: {
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* resposta que não é JSON */
  }
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error || `o serviço respondeu ${res.status}`);
  return body as T;
}

const why = (err: unknown): string =>
  err instanceof Error ? (err.message === 'Failed to fetch' ? 'não foi possível falar com o servidor' : err.message) : 'algo deu errado';

interface LoginReply {
  token: string;
  user: string;
  discord: string | null;
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: 'anon',
  user: null,
  token: null,
  discord: null,
  remember: hasSavedSession(),
  error: null,
  serviceReady: false,
  busy: false,

  setRemember: (remember) => {
    set({ remember });
    // desmarcar esquece na hora: ninguém espera "lembrar" desligado e dados guardados
    if (!remember) void clearSession();
  },

  async restore() {
    set({ status: 'restoring' });
    // o servidor diz se tem serviço de contas; sem ele, a tela avisa em vez de insistir
    const health = fetch(`${AUTH_URL}/health`)
      .then((r) => (r.ok ? (r.json() as Promise<{ auth?: string }>) : null))
      .then((h) => set({ serviceReady: h?.auth === 'gbot' }))
      .catch(() => set({ serviceReady: false }));

    const saved = await loadSession();
    await health;
    if (!saved) {
      set({ status: 'anon', remember: false });
      return;
    }
    // token vencido: o usuário fica lembrado, mas precisa entrar de novo (não há refresh)
    if (!saved.token || expired(saved.token)) {
      set({ status: 'anon', user: saved.user, token: null, discord: null, remember: true });
      return;
    }
    const claims = readClaims(saved.token);
    set({ status: 'logged', user: saved.user, token: saved.token, discord: claims?.discord_id ?? null, remember: true, error: null });
  },

  async signIn(user, password) {
    return enter(set, get, '/login', user, password);
  },

  async register(user, password) {
    return enter(set, get, '/register', user, password);
  },

  continueOffline: () => set({ status: 'offline', error: null }),

  async signOut() {
    await clearSession();
    set({ status: 'anon', user: null, token: null, discord: null, remember: false, error: null });
  },

  async discordCode(discordId) {
    const token = get().token;
    if (!token) return 'entre na sua conta primeiro';
    set({ busy: true });
    try {
      await call('/discord/code', { method: 'POST', token, body: JSON.stringify({ discordId }) });
      return null;
    } catch (err) {
      return why(err);
    } finally {
      set({ busy: false });
    }
  },

  async discordLink(code) {
    const token = get().token;
    if (!token) return 'entre na sua conta primeiro';
    set({ busy: true });
    try {
      const r = await call<{ discord: string }>('/discord/link', { method: 'POST', token, body: JSON.stringify({ code }) });
      set({ discord: r.discord });
      return null;
    } catch (err) {
      return why(err);
    } finally {
      set({ busy: false });
    }
  },

  async discordUnlink() {
    const token = get().token;
    if (!token) return 'entre na sua conta primeiro';
    set({ busy: true });
    try {
      await call('/discord/unlink', { method: 'POST', token });
      set({ discord: null });
      return null;
    } catch (err) {
      return why(err);
    } finally {
      set({ busy: false });
    }
  },
}));

/** Entrar e cadastrar são a mesma coisa com rotas diferentes: o serviço devolve o token nos dois. */
async function enter(
  set: (p: Partial<AuthState>) => void,
  get: () => AuthState,
  path: '/login' | '/register',
  user: string,
  password: string,
): Promise<boolean> {
  const name = user.trim();
  if (!name || !password) {
    set({ error: 'Preencha usuário e senha.' });
    return false;
  }
  if (path === '/register' && password.length < 8) {
    set({ error: 'A senha precisa de pelo menos 8 caracteres.' });
    return false;
  }
  set({ status: 'signing', error: null });
  try {
    const r = await call<LoginReply>(path, { method: 'POST', body: JSON.stringify({ user: name, password }) });
    // guarda usuário e token; a senha morre aqui
    if (get().remember) await saveSession({ user: r.user, token: r.token });
    set({ status: 'logged', user: r.user, token: r.token, discord: r.discord ?? readClaims(r.token)?.discord_id ?? null, error: null, serviceReady: true });
    return true;
  } catch (err) {
    set({ status: 'anon', error: why(err) });
    return false;
  }
}
