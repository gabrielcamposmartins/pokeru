import { create } from 'zustand';
import { clearSession, hasSavedSession, loadSession, saveSession } from '../auth/vault';

/**
 * Login do jogador.
 *
 * O serviço que emite o JWT está sendo construído à parte, então `signIn` ainda não tem com quem
 * falar: a tela existe, o "lembrar-me" funciona e o caminho do token está montado — quando o
 * serviço subir, é preencher `AUTH_URL` e a resposta dele passa a alimentar `token`.
 *
 * **A senha não é guardada em lugar nenhum** (veja src/auth/vault.ts). Ela é usada para pedir o
 * token e descartada; o "lembrar-me" guarda o usuário e, quando existir, o token.
 */

/** Endereço do serviço de login. Vazio = ainda não existe (a tela avisa). */
export const AUTH_URL = import.meta.env?.VITE_AUTH_URL ?? '';

export type AuthStatus = 'anon' | 'restoring' | 'signing' | 'logged' | 'offline';

export interface AuthState {
  status: AuthStatus;
  /** Usuário logado (ou o lembrado, para o campo vir preenchido). */
  user: string | null;
  /** Token da sessão — é o que vai identificar o jogador na conexão. */
  token: string | null;
  remember: boolean;
  error: string | null;
  /** O serviço de login já existe? */
  serviceReady: boolean;
  setRemember(on: boolean): void;
  /** Lê a sessão guardada (chamado ao abrir o app). */
  restore(): Promise<void>;
  /** Entra: pede o token ao serviço e guarda a sessão se "lembrar" estiver marcado. */
  signIn(user: string, password: string): Promise<boolean>;
  /** Segue sem conta (o jogo offline e as mesas livres continuam valendo). */
  continueOffline(): void;
  /** Sai: esquece a sessão guardada. */
  signOut(): Promise<void>;
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: 'anon',
  user: null,
  token: null,
  remember: hasSavedSession(),
  error: null,
  serviceReady: !!AUTH_URL,

  setRemember: (remember) => {
    set({ remember });
    // desmarcar esquece na hora: ninguém espera "lembrar" desligado e dados guardados
    if (!remember) void clearSession();
  },

  async restore() {
    set({ status: 'restoring' });
    const saved = await loadSession();
    if (!saved) {
      set({ status: 'anon', remember: false });
      return;
    }
    // com token, a sessão volta logada; só com o usuário, o campo vem preenchido
    set({
      status: saved.token ? 'logged' : 'anon',
      user: saved.user,
      token: saved.token ?? null,
      remember: true,
    });
  },

  async signIn(user, password) {
    const name = user.trim();
    if (!name || !password) {
      set({ error: 'Preencha usuário e senha.' });
      return false;
    }
    set({ status: 'signing', error: null });

    if (!AUTH_URL) {
      // sem serviço: a tela funciona, o "lembrar" guarda o usuário e o jogo segue sem conta
      if (get().remember) await saveSession({ user: name });
      set({
        status: 'anon',
        user: name,
        token: null,
        error: 'O login ainda está sendo construído — por enquanto dá para jogar sem conta.',
      });
      return false;
    }

    try {
      const res = await fetch(`${AUTH_URL.replace(/\/$/, '')}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: name, password }),
      });
      if (!res.ok) {
        set({ status: 'anon', error: res.status === 401 ? 'Usuário ou senha incorretos.' : `O serviço respondeu ${res.status}.` });
        return false;
      }
      const data = (await res.json()) as { token?: string };
      if (!data.token) {
        set({ status: 'anon', error: 'O serviço não devolveu um token.' });
        return false;
      }
      // guarda usuário e token; a senha morre aqui
      if (get().remember) await saveSession({ user: name, token: data.token });
      set({ status: 'logged', user: name, token: data.token, error: null });
      return true;
    } catch (err) {
      set({ status: 'anon', error: err instanceof Error ? `Não foi possível falar com o serviço: ${err.message}` : 'Falha ao entrar.' });
      return false;
    }
  },

  continueOffline: () => set({ status: 'offline', error: null }),

  async signOut() {
    await clearSession();
    set({ status: 'anon', user: null, token: null, remember: false, error: null });
  },
}));
