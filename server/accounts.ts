import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  EMPTY_STATS,
  sanitizeStats,
  sanitizeTitle,
  type PlayerStats,
  type StatEvent,
} from '../shared/achievements';
import { EMPTY_BOND, addBond, type BondEvent, type BondStats } from '../shared/bond';
import { findItem, isFree, priceOf, type Currency } from '../shared/catalog';
import type { AccountCreds, AccountInfo, AccountProfile, AccountService, AuthIdentity, DiscordLink } from '../shared/accounts';
import { sanitizeName } from '../shared/styles';
import { GbotError, type Gbot } from './gbot';
import { JsonStore } from './store';

/** Uma conta como fica guardada no arquivo. */
interface Stored {
  id: string;
  /** Hash da chave de volta (a chave em si só o cliente tem). */
  token: string;
  /** Quando a chave de volta expira (ISO). Ausente = não expira (contas sem login antigas). */
  tokenUntil?: string;
  /** `sub` do JWT: a identidade no serviço de contas. Ausente na conta sem login. */
  sub?: string;
  /** Usuário no serviço de contas. */
  user?: string;
  /** Discord vinculado, como visto na última entrada. */
  discord?: DiscordLink;
  name: string;
  /** Personagem, verso e efeito da última vez que entrou (o cliente manda no hello). */
  character: string;
  money: number;
  /** Itens comprados (chaves do catálogo). O que já vem com o jogo não entra aqui. */
  owned: string[];
  bond: Record<string, BondStats>;
  stats: PlayerStats;
  /** Titulo de conquista escolhido (null/ausente = nenhum). */
  title?: string | null;
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
  /**
   * Cliente do bot do Discord: de onde vem o saldo de **padocoins** e por onde saem as compras
   * nessa moeda. Sem ele, o jogo funciona só com fichas.
   */
  gbot?: Gbot | null;
}

/** O token é aleatório e longo: um SHA-256 basta (não é senha digitada por gente). */
const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Compara sem dar pista pelo tempo de resposta. */
function sameToken(token: string, stored: string): boolean {
  const a = Buffer.from(hash(token));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Quanto tempo um saldo de padocoin lido do GBOT vale antes de ser buscado de novo. */
const PADO_TTL_MS = 60_000;

/**
 * Quanto tempo a sessão guardada no aparelho continua valendo.
 *
 * O JWT do serviço de contas expira em uma hora e não existe refresh, então ele não serve para
 * "continuar logado" — sem esta chave, o jogador digitaria a senha a cada hora. Duas semanas é o
 * combinado: longo o bastante para não incomodar, curto o bastante para um aparelho perdido não
 * virar acesso permanente.
 */
const SESSION_DAYS = 14;

const emDias = (dias: number): string => new Date(Date.now() + dias * 86_400_000).toISOString();

/**
 * Contas do servidor hospedado: saldo, vínculo, itens e números de cada jogador, em JSON.
 *
 * **O servidor é o dono de tudo isso.** O cliente pede — comprar, sentar, escolher personagem — e
 * aqui se confere saldo e posse antes de mexer em qualquer coisa. Um cliente modificado não ganha
 * fichas nem itens; no máximo desenha uma vitrine errada para si mesmo.
 *
 * Duas formas de identidade:
 *
 *   - **com login** (`loginAuth`): a chave é o `sub` do JWT do GBOT. A conta segue a pessoa de um
 *     computador para outro, e é a que pode ter Discord vinculado (e padocoins).
 *   - **sem login** (`login`): o servidor sorteia um token na primeira vez e o cliente o guarda.
 *     Serve para jogar na hora; o que se compra fica preso àquele aparelho.
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
  /** Saldo de padocoins visto por último, por conta (não é guardado em disco: o dono é o GBOT). */
  private pado = new Map<string, { value: number; at: number }>();

  constructor(private readonly opts: AccountsOptions = {}) {
    this.store = new JsonStore<File>(opts.file ?? './data/accounts.json', { version: 1, accounts: {} });
    // contas antigas (de antes da loja) não tinham lista de itens
    for (const acc of Object.values(this.store.get().accounts)) acc.owned ??= [];
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

  private bySub(sub: string): Stored | undefined {
    return Object.values(this.store.get().accounts).find((a) => a.sub === sub);
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

  /** Molde de uma conta nova (com ou sem login). */
  private create(name: string, character: string, extra: Partial<Stored>): Stored | null {
    const max = Math.round(this.opts.maxAccounts ?? 1000);
    if (max > 0 && this.count >= max) {
      console.warn(`[conta] teto de ${max} contas atingido: ${name} entra sem conta (só mesas livres)`);
      return null;
    }
    const acc: Stored = {
      id: 'a-' + randomBytes(8).toString('hex'),
      token: '',
      name,
      character,
      money: Math.max(0, Math.round(this.opts.startingMoney ?? 10_000)),
      owned: [],
      bond: {},
      stats: { ...EMPTY_STATS },
      title: null,
      since: new Date().toISOString(),
      seen: new Date().toISOString(),
      ...extra,
    };
    this.store.get().accounts[acc.id] = acc;
    this.store.touch();
    return acc;
  }

  /**
   * Entra pela chave de volta guardada no aparelho.
   *
   * Vale para os dois tipos de conta: a sem login (identidade só daquele aparelho) e a com login,
   * cujo JWT já expirou — é isto que faz a sessão durar duas semanas em vez de uma hora. A conta
   * com login volta com o vínculo do Discord e tudo mais que é dela; o que ela **não** recupera é
   * o token do serviço de contas, então vincular ou desvincular o Discord pede a senha de novo.
   */
  login(creds: AccountCreds | undefined, profile: AccountProfile): AccountInfo | null {
    const name = sanitizeName(profile.name);
    const known = this.byId(creds?.id);
    if (known && creds && known.token && sameToken(creds.token, known.token)) {
      if (known.tokenUntil && Date.parse(known.tokenUntil) < Date.now()) {
        console.log(`[conta] sessão de ${known.name} (${known.id}) expirou`);
        return known.sub ? null : this.novaSemLogin(name, profile);
      }
      known.name = name;
      known.character = profile.cosmetics.character.id;
      known.seen = new Date().toISOString();
      this.store.touch();
      if (known.sub) console.log(`[conta] ${known.user ?? known.name} voltou pela sessão guardada`);
      return this.snapshot(known);
    }
    // conta com login nunca é criada por aqui: quem cria é o `loginAuth`, com a identidade do serviço
    if (creds && this.byId(creds.id)?.sub) return null;
    return this.novaSemLogin(name, profile);
  }

  /** Conta nova sem login: o servidor sorteia a chave de volta e o cliente a guarda. */
  private novaSemLogin(name: string, profile: AccountProfile): AccountInfo | null {
    const token = randomBytes(24).toString('base64url');
    const until = emDias(SESSION_DAYS);
    const acc = this.create(name, profile.cosmetics.character.id, { token: hash(token), tokenUntil: until });
    if (!acc) return null;
    console.log(`[conta] nova sem login: ${acc.name} (${acc.id})`);
    // o token só vai nesta resposta: é o que o cliente guarda
    return { ...this.snapshot(acc), token, tokenUntil: until };
  }

  async loginAuth(identity: AuthIdentity, profile: AccountProfile): Promise<AccountInfo | null> {
    const name = sanitizeName(profile.name);
    let acc = this.bySub(identity.sub);
    if (!acc) {
      const nova = this.create(name, profile.cosmetics.character.id, { sub: identity.sub, user: identity.username });
      if (!nova) return null;
      acc = nova;
      console.log(`[conta] nova com login: ${identity.username} (${acc.id})`);
    }
    acc.name = name;
    acc.user = identity.username;
    acc.character = profile.cosmetics.character.id;
    acc.seen = new Date().toISOString();
    // o vínculo nunca vem do cliente: ou das claims, ou perguntando ao serviço
    const link = await this.resolveDiscord(identity, acc);
    if (link !== undefined) {
      acc.discord = link ?? undefined;
      if (!acc.discord) this.pado.delete(acc.id);
    }
    this.store.touch();
    // o saldo de padocoins mora no GBOT; busca agora para a barra abrir com o número certo
    await this.refreshPado(acc.id);
    // chave de volta nova a cada entrada com senha: é o que estica a sessão para duas semanas
    const token = randomBytes(24).toString('base64url');
    acc.token = hash(token);
    acc.tokenUntil = emDias(SESSION_DAYS);
    this.store.touch();
    return { ...this.snapshot(acc), token, tokenUntil: acc.tokenUntil };
  }

  /**
   * Qual é o Discord desta conta: `DiscordLink` quando há vínculo, `null` quando o serviço diz que
   * não há, e `undefined` quando **não deu para saber** — e aí o que está guardado continua.
   *
   * A distinção entre `null` e `undefined` é o coração do problema que apareceu no primeiro teste
   * com gente de verdade: o JWT é assinado no login e não há refresh, então quem vincula o Discord
   * *depois* de entrar fica com um token sem a claim `discord_id`. Tratar essa ausência como "não
   * tem vínculo" apagava, na entrada seguinte, um vínculo que existia — e os padocoins
   * desapareciam junto.
   */
  private async resolveDiscord(identity: AuthIdentity, acc: Stored): Promise<DiscordLink | null | undefined> {
    // a claim é a resposta mais rápida e vem assinada: quando existe, manda
    if (identity.discordId) {
      return { id: identity.discordId, username: identity.username, nickname: identity.nickname ?? null };
    }
    const gbot = this.opts.gbot;
    // sem como perguntar: mantém o que houver (só zera quem já não tinha nada)
    if (!identity.token || !gbot) return acc.discord ? undefined : null;
    try {
      const me = await gbot.me(identity.token);
      return me.discord_id ? { id: me.discord_id, username: me.username, nickname: acc.discord?.nickname ?? null } : null;
    } catch (err) {
      console.warn('[discord] não deu para confirmar o vínculo:', err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  info(accountId: string): AccountInfo | null {
    const acc = this.byId(accountId);
    return acc ? this.snapshot(acc) : null;
  }

  owned(accountId: string): readonly string[] {
    return this.byId(accountId)?.owned ?? [];
  }

  private snapshot(acc: Stored): AccountInfo {
    const pado = acc.discord ? (this.pado.get(acc.id)?.value ?? null) : null;
    return {
      id: acc.id,
      name: acc.name,
      user: acc.user,
      money: acc.money,
      inPlay: this.inPlayOf?.(acc.id) ?? 0,
      pado,
      discord: acc.discord ? { ...acc.discord } : null,
      owned: [...acc.owned],
      bond: { ...acc.bond },
      stats: sanitizeStats(acc.stats),
      title: sanitizeTitle(acc.title, sanitizeStats(acc.stats)),
      since: acc.since,
    };
  }

  // -------------------------------------------------------------- padocoins

  /**
   * Relê o saldo de padocoins no GBOT (silencioso: sem Discord ou sem GBOT, não há o que ler).
   *
   * A leitura também é de onde vem o **nome no Discord**: o vínculo é confirmado pela API de
   * contas, que só sabe o nome da conta do jogo (`gabs`), enquanto a economia sabe o do Discord
   * (`gabss2` / `Mogab`) — que é o nome que a pessoa reconhece.
   */
  async refreshPado(accountId: string, force = false): Promise<number | null> {
    const acc = this.byId(accountId);
    const gbot = this.opts.gbot;
    if (!acc?.discord || !gbot) return null;
    const seen = this.pado.get(accountId);
    if (!force && seen && Date.now() - seen.at < PADO_TTL_MS) return seen.value;
    try {
      // pelo id primeiro; pelo nome como rede, para um id que a economia não indexa
      const user = (await gbot.user(acc.discord.id)) ?? (acc.discord.username ? await gbot.userByName(acc.discord.username) : null);
      if (!user) {
        // Discord vinculado mas sem linha na economia: ainda não tem padocoin nenhum
        console.log(`[padocoin] ${acc.name}: ${acc.discord.id} não tem conta na economia do bot (saldo 0)`);
        this.pado.set(accountId, { value: 0, at: Date.now() });
        return 0;
      }
      this.pado.set(accountId, { value: user.balance, at: Date.now() });
      // o nome de verdade é o do Discord, e vem daqui
      const nome = user.username || acc.discord.username;
      if (nome !== acc.discord.username || (user.nickname ?? null) !== acc.discord.nickname) {
        acc.discord = { ...acc.discord, username: nome, nickname: user.nickname ?? null };
        this.store.touch();
      }
      return user.balance;
    } catch (err) {
      console.warn(`[padocoin] não deu para ler o saldo de ${acc.discord.id}:`, err instanceof Error ? err.message : err);
      return seen?.value ?? null;
    }
  }

  /**
   * Registra (ou apaga) o Discord vinculado da conta com aquele `sub`.
   *
   * Chamado pelo gateway quando o GBOT confirma um vínculo. O JWT do jogador só ganha a claim
   * `discord_id` no próximo login, então é esta anotação que faz os padocoins aparecerem na hora.
   */
  async setDiscordBySub(sub: string, link: DiscordLink | null): Promise<AccountInfo | null> {
    const acc = this.bySub(sub);
    if (!acc) return null;
    acc.discord = link ?? undefined;
    this.pado.delete(acc.id);
    this.store.flush();
    if (link) await this.refreshPado(acc.id, true);
    this.changed(acc.id);
    console.log(link ? `[discord] ${acc.name} vinculou ${link.id}` : `[discord] ${acc.name} desvinculou`);
    return this.snapshot(acc);
  }

  /** Relê o saldo de padocoins e avisa o cliente se o número mudou. */
  async refresh(accountId: string): Promise<void> {
    const before = this.pado.get(accountId)?.value;
    const now = await this.refreshPado(accountId, true);
    if (now !== before) this.changed(accountId);
  }

  // -------------------------------------------------------------------- loja

  async buy(accountId: string, key: string, currency: Currency): Promise<string | null> {
    const acc = this.byId(accountId);
    if (!acc) return 'conta não encontrada';
    const item = findItem(key);
    if (!item) return 'esse item não existe';
    if (isFree(key)) return 'esse item já vem com o jogo';
    if (acc.owned.includes(key)) return 'você já tem esse item';
    const price = priceOf(key, currency);
    if (!price) return 'esse item não está à venda';

    if (currency === 'chips') {
      if (acc.money < price) return `faltam ${price - acc.money} fichas`;
      acc.money -= price;
      acc.owned.push(key);
      // item pago é para não se perder numa queda: grava na hora
      this.store.flush();
      this.changed(acc.id);
      console.log(`[loja] ${acc.name} comprou ${item.name} por ${price} fichas`);
      return null;
    }

    // padocoins: o dono do saldo é o GBOT, então a cobrança é uma chamada de rede
    if (!acc.discord) return 'vincule o Discord para pagar com padocoins';
    const gbot = this.opts.gbot;
    if (!gbot?.canMoveMoney) return 'este servidor não está ligado ao serviço de padocoins';
    try {
      // a chave de idempotência é fixa por conta+item: se a chamada repetir, não cobra duas vezes
      const move = await gbot.debit(acc.discord.id, price, `pokeru: ${item.name}`, `pokeru:${acc.id}:${key}`);
      this.pado.set(acc.id, { value: move.after, at: Date.now() });
    } catch (err) {
      if (err instanceof GbotError) {
        if (err.status === 409) return 'padocoins insuficientes';
        if (err.status === 404) return 'seu Discord não tem conta na economia do bot';
        return err.message;
      }
      return 'não foi possível falar com o serviço de padocoins';
    }
    // pagou: o item é dele, e isso vai para o disco antes de qualquer outra coisa
    acc.owned.push(key);
    this.store.flush();
    this.changed(acc.id);
    console.log(`[loja] ${acc.name} comprou ${item.name} por ${price} padocoins`);
    return null;
  }

  // ---------------------------------------------------------------- banca

  /**
   * Cobra o buy-in na moeda da mesa.
   *
   * Em padocoin o dinheiro está no bot do Discord: a cobrança é uma chamada de rede, e a chave de
   * idempotência vem da sala — a mesma chave não cobra duas vezes, então uma tentativa que deu
   * timeout pode ser repetida sem medo.
   */
  async chargeIn(accountId: string, amount: number, currency: Currency, key: string): Promise<number> {
    if (currency === 'chips') return this.charge(accountId, amount);
    const acc = this.byId(accountId);
    const gbot = this.opts.gbot;
    const want = Math.max(0, Math.round(amount));
    if (!acc?.discord || !gbot?.canMoveMoney || !want) return 0;
    try {
      const move = await gbot.debit(acc.discord.id, want, `pokeru: buy-in de mesa`, key);
      this.pado.set(acc.id, { value: move.after, at: Date.now() });
      this.changed(acc.id);
      console.log(`[padocoin] ${acc.name} pagou ${want} de buy-in (saldo ${move.after})`);
      return want;
    } catch (err) {
      const motivo = err instanceof GbotError ? `${err.status} ${err.message}` : String(err);
      console.warn(`[padocoin] buy-in de ${want} recusado para ${acc.name}: ${motivo}`);
      return 0;
    }
  }

  /** Devolve o que sobrou da mesa, na moeda dela. */
  async creditIn(accountId: string, amount: number, currency: Currency, key: string): Promise<void> {
    if (currency === 'chips') return this.credit(accountId, amount);
    const acc = this.byId(accountId);
    const gbot = this.opts.gbot;
    const got = Math.max(0, Math.round(amount));
    if (!acc?.discord || !gbot?.canMoveMoney || !got) return;
    try {
      const move = await gbot.credit(acc.discord.id, got, 'pokeru: saída de mesa', key);
      this.pado.set(acc.id, { value: move.after, at: Date.now() });
      this.changed(acc.id);
      console.log(`[padocoin] ${acc.name} levou ${got} da mesa (saldo ${move.after})`);
    } catch (err) {
      // o jogador ganhou e a devolução falhou: isto não pode passar em silêncio
      const motivo = err instanceof GbotError ? `${err.status} ${err.message}` : String(err);
      console.error(`[padocoin] FALHA ao devolver ${got} para ${acc.name} (${acc.discord.id}), chave ${key}: ${motivo}`);
    }
  }

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

  note(accountId: string, what: StatEvent): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    acc.stats = sanitizeStats(acc.stats);
    acc.stats[what]++;
    // um titulo pode ter deixado de valer (ou o contador acabou de liberar outro)
    acc.title = sanitizeTitle(acc.title, acc.stats);
    this.changed(acc.id);
  }

  /** Equipa um titulo. Recusa o que as conquistas da conta nao sustentam. */
  setTitle(accountId: string, title: string | null): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    acc.title = sanitizeTitle(title, sanitizeStats(acc.stats));
    this.changed(acc.id);
  }

  /** Só para teste: envelhece a chave de volta, para não haver teste que espere duas semanas. */
  expireSessionForTests(accountId: string): void {
    const acc = this.byId(accountId);
    if (acc) acc.tokenUntil = new Date(Date.now() - 1000).toISOString();
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
  list(): { id: string; name: string; user?: string; money: number; inPlay: number; items: number; seen: string }[] {
    return Object.values(this.store.get().accounts)
      .map((a) => ({ id: a.id, name: a.name, user: a.user, money: a.money, inPlay: this.inPlayOf?.(a.id) ?? 0, items: a.owned.length, seen: a.seen }))
      .sort((a, b) => b.money + b.inPlay - (a.money + a.inPlay));
  }
}
