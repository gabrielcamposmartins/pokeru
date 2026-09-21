/**
 * Cofre da sessão — o que o "lembrar-me" guarda neste computador.
 *
 * ── A regra ─────────────────────────────────────────────────────────────────────
 * **A senha não é salva.** Nem cifrada: guardar senha no cliente é obfuscação, porque quem lê o
 * armazenamento do navegador também alcança a chave. O que fica guardado é:
 *
 * - o **usuário**, para o campo já vir preenchido;
 * - o **token** da sessão (JWT/refresh), quando o serviço de login o devolver.
 *
 * Um token é o refém certo: expira, o servidor pode revogar e ele não abre nada além do jogo. Uma
 * senha vazada abre tudo onde a pessoa repetiu a senha.
 *
 * ── Como é guardado ─────────────────────────────────────────────────────────────
 * - **AES-GCM 256** (autenticado: mexer no texto cifrado faz a leitura falhar);
 * - a chave é gerada uma vez por instalação e fica como `CryptoKey` **não exportável** no
 *   IndexedDB — dá para cifrar com ela, não para lê-la, então ela não vai embora num vazamento
 *   de `localStorage`;
 * - sem WebCrypto ou IndexedDB, **nada é salvo** (nunca em texto puro).
 *
 * No app desktop o lugar ainda melhor é o cofre do sistema (Credential Manager no Windows,
 * Keychain no macOS, libsecret no Linux): é trocar o `KeyStore` daqui por ele, sem tocar no resto.
 */

/** O que fica guardado. Repare que não há campo de senha: é de propósito. */
export interface SavedSession {
  user: string;
  /** Token da sessão, quando o serviço de login devolver um. */
  token?: string;
  /** Quando foi guardado (ISO) — serve para descartar sessão velha. */
  savedAt: string;
}

/** Onde a chave de cifra fica. O padrão é o IndexedDB; os testes usam uma em memória. */
export interface KeyStore {
  get(): Promise<CryptoKey | null>;
  set(key: CryptoKey): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'pokeru-vault';
const STORE = 'keys';
const KEY_ID = 'session';
/** O texto cifrado mora no localStorage; sem a chave do IndexedDB ele não diz nada. */
const BLOB_KEY = 'pokeru-session';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Chave no IndexedDB, não exportável: dá para cifrar com ela, não para lê-la. */
export const indexedDbKeys: KeyStore = {
  async get() {
    const found = await tx<CryptoKey | undefined>('readonly', (s) => s.get(KEY_ID) as IDBRequest<CryptoKey | undefined>);
    return found ?? null;
  },
  async set(key) {
    await tx('readwrite', (s) => s.put(key, KEY_ID) as IDBRequest<IDBValidKey>);
  },
  async clear() {
    await tx('readwrite', (s) => s.delete(KEY_ID) as IDBRequest<undefined>);
  },
};

/** Cofre em memória (testes e navegadores sem IndexedDB). */
export function memoryKeys(): KeyStore {
  let key: CryptoKey | null = null;
  return {
    get: async () => key,
    set: async (k) => void (key = k),
    clear: async () => void (key = null),
  };
}

export interface VaultOptions {
  keys?: KeyStore;
  /** Onde o texto cifrado fica (padrão: localStorage). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

function storageOf(opts?: VaultOptions) {
  return opts?.storage ?? globalThis.localStorage;
}

const b64 = {
  to: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  from: (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

async function keyFor(store: KeyStore, create: boolean): Promise<CryptoKey | null> {
  const found = await store.get();
  if (found) return found;
  if (!create) return null;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await store.set(key);
  return key;
}

/** O cofre funciona neste navegador? */
export function vaultAvailable(opts?: VaultOptions): boolean {
  const hasCrypto = typeof crypto !== 'undefined' && !!crypto.subtle;
  const hasKeys = !!opts?.keys || typeof indexedDB !== 'undefined';
  return hasCrypto && hasKeys && !!storageOf(opts);
}

/**
 * Guarda a sessão cifrada. Devolve false quando não há como cifrar — e aí nada é escrito.
 * O que entra aqui é usuário e token; senha não tem como chegar (não existe no tipo).
 */
export async function saveSession(session: Omit<SavedSession, 'savedAt'>, opts?: VaultOptions): Promise<boolean> {
  if (!vaultAvailable(opts) || !session.user) return false;
  try {
    const key = await keyFor(opts?.keys ?? indexedDbKeys, true);
    if (!key) return false;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload: SavedSession = { user: session.user, token: session.token, savedAt: new Date().toISOString() };
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
    storageOf(opts).setItem(BLOB_KEY, JSON.stringify({ v: 1, iv: b64.to(iv), data: b64.to(cipher) }));
    return true;
  } catch {
    return false;
  }
}

/** Lê a sessão guardada (null quando não há, quando não dá para decifrar, ou quando expirou). */
export async function loadSession(opts?: VaultOptions & { maxAgeDays?: number }): Promise<SavedSession | null> {
  if (!vaultAvailable(opts)) return null;
  try {
    const raw = storageOf(opts).getItem(BLOB_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as { v?: number; iv?: string; data?: string };
    if (blob.v !== 1 || !blob.iv || !blob.data) return null;
    const key = await keyFor(opts?.keys ?? indexedDbKeys, false);
    if (!key) return null; // chave perdida (outro perfil, dados limpos): esquece
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.from(blob.iv) }, key, b64.from(blob.data));
    const saved = JSON.parse(new TextDecoder().decode(plain)) as SavedSession;
    if (typeof saved?.user !== 'string' || !saved.user) return null;
    const maxAge = opts?.maxAgeDays ?? 60;
    const age = (Date.now() - Date.parse(saved.savedAt ?? '')) / 86_400_000;
    // sessão velha não vale: o token já teria expirado do outro lado
    if (Number.isFinite(age) && age > maxAge) return { user: saved.user, savedAt: saved.savedAt };
    return saved;
  } catch {
    return null;
  }
}

/** Esquece a sessão (e a chave: o que sobrar no armazenamento não serve para nada). */
export async function clearSession(opts?: VaultOptions): Promise<void> {
  try {
    storageOf(opts)?.removeItem(BLOB_KEY);
    await (opts?.keys ?? indexedDbKeys).clear();
  } catch {
    // sem armazenamento: não havia nada guardado
  }
}

/** Existe algo guardado? (não decifra — serve para o "lembrar" já vir marcado) */
export function hasSavedSession(opts?: VaultOptions): boolean {
  try {
    return !!storageOf(opts)?.getItem(BLOB_KEY);
  } catch {
    return false;
  }
}
