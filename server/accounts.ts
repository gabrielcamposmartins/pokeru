import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { EMPTY_BOND, addBond, type BondEvent, type BondStats } from '../shared/bond';
import type { AccountCreds, AccountInfo, AccountProfile, AccountService } from '../shared/accounts';
import { sanitizeName } from '../shared/styles';
import { JsonStore } from './store';

/** Uma conta como fica guardada no arquivo. */
interface Stored {
  id: string;
  /** Hash do token (o token em si só o cliente tem). */
  token: string;
  name: string;
  /** Personagem, verso e efeito da última vez que entrou (o cliente manda no hello). */
  character: string;
  money: number;
  bond: Record<string, BondStats>;
  stats: { hands: number; wins: number; matches: number };
  since: string;
  seen: string;
}

interface File {
  version: 1;
  accounts: Record<string, Stored>;
}

export interface AccountsOptions {
  /** Saldo de uma conta nova. */
  startingMoney?: number;
  /**
   * Recarga de cortesia: quando a conta chega a zero (sem fichas em mesa), o saldo volta para
   * este valor na próxima cobrança. 0 desliga — aí quem perde tudo precisa de um presente do
   * administrador (`POKERU_GIFT`, veja o README).
   */
  faucet?: number;
  /** Teto de contas guardadas: passando disso, o servidor não cria mais (só mesas livres). */
  maxAccounts?: number;
  file?: string;
}

/** O token é aleatório e longo: um SHA-256 basta (não é senha digitada por gente). */
const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Compara sem dar pista pelo tempo de resposta. */
function sameToken(token: string, stored: string): boolean {
  const a = Buffer.from(hash(token));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Contas do servidor hospedado: saldo, vínculo e números de cada jogador, guardados em JSON.
 *
 * Identidade sem senha: ao entrar pela primeira vez o servidor cria a conta e devolve um **token**
 * aleatório; o cliente guarda esse token e o manda no `hello` para voltar como ele mesmo. Não há
 * senha para digitar (e o servidor nunca vê uma).
 */
export class Accounts implements AccountService {
  private store: JsonStore<File>;
  onChange?: (accountId: string) => void;
  /**
   * Quantas fichas a conta tem em mesa agora. Quem sabe disso são as salas, então o servidor
   * liga esta função ao lobby — assim o "em jogo" nunca fica desencontrado do que está na mesa.
   */
  inPlayOf?: (accountId: string) => number;
  private pending = new Set<string>();
  private notify: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: AccountsOptions = {}) {
    this.store = new JsonStore<File>(opts.file ?? './data/accounts.json', { version: 1, accounts: {} });
  }

  get count(): number {
    return Object.keys(this.store.get().accounts).length;
  }

  close(): void {
    if (this.notify) clearTimeout(this.notify);
    this.notify = null;
    this.store.close();
  }

  private byId(id: string | undefined): Stored | undefined {
    return id ? this.store.get().accounts[id] : undefined;
  }

  /**
   * Avisa que a conta mudou — mas no fim do passo atual, não no meio dele: quando a cobrança
   * acontece, o jogador ainda não está sentado (e a devolução acontece antes de o assento sair).
   * Esperar o próximo tique deixa a foto contar a mesma história que a mesa, e junta as mudanças
   * em rajada (os pontos de vínculo de uma mão, por exemplo) num aviso só.
   */
  private changed(id: string): void {
    this.store.touch();
    if (!this.onChange) return;
    this.pending.add(id);
    if (this.notify) return;
    this.notify = setTimeout(() => {
      this.notify = null;
      const ids = [...this.pending];
      this.pending.clear();
      for (const i of ids) this.onChange?.(i);
    }, 30);
    this.notify.unref?.();
  }

  login(creds: AccountCreds | undefined, profile: AccountProfile): AccountInfo | null {
    const name = sanitizeName(profile.name);
    const known = this.byId(creds?.id);
    if (known && creds && sameToken(creds.token, known.token)) {
      known.name = name;
      known.character = profile.cosmetics.character.id;
      known.seen = new Date().toISOString();
      this.store.touch();
      return this.snapshot(known);
    }
    // conta nova (primeira vez, ou token que não bate)
    const max = Math.round(this.opts.maxAccounts ?? 1000);
    if (max > 0 && this.count >= max) {
      console.warn(`[conta] teto de ${max} contas atingido: ${name} entra sem conta (só mesas livres)`);
      return null;
    }
    const token = randomBytes(24).toString('base64url');
    const acc: Stored = {
      id: 'a-' + randomBytes(8).toString('hex'),
      token: hash(token),
      name,
      character: profile.cosmetics.character.id,
      money: Math.max(0, Math.round(this.opts.startingMoney ?? 10_000)),
      bond: {},
      stats: { hands: 0, wins: 0, matches: 0 },
      since: new Date().toISOString(),
      seen: new Date().toISOString(),
    };
    this.store.get().accounts[acc.id] = acc;
    this.store.touch();
    console.log(`[conta] nova: ${acc.name} (${acc.id})`);
    // o token só vai nesta resposta: é o que o cliente guarda
    return { ...this.snapshot(acc), token };
  }

  info(accountId: string): AccountInfo | null {
    const acc = this.byId(accountId);
    return acc ? this.snapshot(acc) : null;
  }

  private snapshot(acc: Stored): AccountInfo {
    return {
      id: acc.id,
      name: acc.name,
      money: acc.money,
      inPlay: this.inPlayOf?.(acc.id) ?? 0,
      bond: { ...acc.bond },
      stats: { ...acc.stats },
      since: acc.since,
    };
  }

  // ---------------------------------------------------------------- banca

  money(accountId: string): number {
    return this.byId(accountId)?.money ?? 0;
  }

  charge(accountId: string, amount: number): number {
    const acc = this.byId(accountId);
    const want = Math.max(0, Math.round(amount));
    if (!acc || !want) return 0;
    // recarga de cortesia: quem zerou (e não tem fichas em mesa) volta a ter com que jogar
    const faucet = Math.round(this.opts.faucet ?? 0);
    if (faucet > 0 && acc.money <= 0 && (this.inPlayOf?.(acc.id) ?? 0) <= 0) {
      acc.money = faucet;
      console.log(`[conta] recarga de cortesia para ${acc.name} (${acc.id}): ${faucet}`);
    }
    if (acc.money < want) return 0;
    acc.money -= want;
    this.changed(acc.id);
    return want;
  }

  credit(accountId: string, amount: number): void {
    const acc = this.byId(accountId);
    const got = Math.max(0, Math.round(amount));
    if (!acc || !got) return;
    acc.money += got;
    this.changed(acc.id);
  }

  bond(accountId: string, character: string, ev: BondEvent): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    const id = character || acc.character || 'marina';
    acc.bond[id] = addBond(acc.bond[id] ?? EMPTY_BOND, ev);
    this.changed(acc.id);
  }

  note(accountId: string, what: 'hand' | 'win' | 'match'): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    if (what === 'hand') acc.stats.hands++;
    else if (what === 'win') acc.stats.wins++;
    else acc.stats.matches++;
    this.changed(acc.id);
  }

  /** Presente do administrador (usado pelo console do servidor). */
  gift(accountId: string, amount: number): boolean {
    const acc = this.byId(accountId);
    if (!acc) return false;
    acc.money += Math.max(0, Math.round(amount));
    this.changed(acc.id);
    console.log(`[conta] presente de ${amount} para ${acc.name} (${acc.id}) — saldo ${acc.money}`);
    return true;
  }

  /** Lista resumida, para o /health e para o console. */
  list(): { id: string; name: string; money: number; inPlay: number; seen: string }[] {
    return Object.values(this.store.get().accounts)
      .map((a) => ({ id: a.id, name: a.name, money: a.money, inPlay: this.inPlayOf?.(a.id) ?? 0, seen: a.seen }))
      .sort((a, b) => b.money + b.inPlay - (a.money + a.inPlay));
  }
}
