import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  EMPTY_STATS,
  playerLevel,
  sanitizeStats,
  xpOf,
  sanitizeTitle,
  type PlayerStats,
  type StatEvent,
} from '../shared/achievements';
import {
  EMPTY_BOND,
  HEARTS,
  addBond,
  bondCap,
  giftFits,
  giftPoints,
  giftRarityFor,
  payGift,
  questHearts,
  heartsOf,
  type BondEvent,
  type BondStats,
} from '../shared/bond';
import { findItem, freeIdOf, isFree, isSold, ownsItem, priceOf, type Currency } from '../shared/catalog';
import { draw, findRoulette, giftOfKey, isCountable, refundOf, ticketPrice } from '../shared/roulette';
import { PARTIDAS_LEMBRADAS, ultimasPartidas, type ResumoDaPartida } from '../shared/personality';
import { MAX_REQUESTS, isFriendCode, makeFriendCode, normalizeFriendCode, podeMaisAmigos } from '../shared/friends';
import type { SpinResult } from '../shared/accounts';
import type { AccountCreds, AccountInfo, AccountProfile, AccountService, Aparencia, AuthIdentity, DiscordLink, FriendRow } from '../shared/accounts';
import { BACK_PRESETS, DEFAULT_AURAS, DEFAULT_FRAME, FACE_PRESETS, sanitizeName } from '../shared/styles';
import { GbotError, type Gbot } from './gbot';
import { JsonStore } from './store';

/** Nome da moeda nos logs. */
const moeda = (c: Currency): string => (c === 'pado' ? 'padocoins' : 'fichas');

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
  /** Presentes em estoque, por id (contáveis, ao contrário de `owned`). */
  gifts?: Record<string, number>;
  /**
   * Piso dos corações de vínculo, por personagem: o que já foi aberto por uma regra antiga não se
   * perde por causa de uma regra nova (veja `abertosDe`).
   */
  bondUnlocked?: Record<string, number>;
  /**
   * O vínculo já está na regra de agora (pontos só de presente, missão abre o coração)? Ausente =
   * conta de antes: os corações que ela tinha viram piso na primeira vez que o servidor sobe.
   */
  bondV2?: boolean;
  /** Como estava vestida da última vez (o card do perfil de quem está offline sai daqui). */
  aparencia?: Omit<Aparencia, 'character'>;
  /** Como jogou as últimas partidas (shared/personality.ts). */
  play?: ResumoDaPartida[];
  /** Código de amigo (seis caracteres estáveis). Ausente nas contas de antes das amizades. */
  code?: string;
  /** Amigos, por id de conta. */
  friends?: string[];
  /** Pedidos recebidos, por id de conta. */
  reqIn?: string[];
  /** Pedidos enviados, por id de conta. */
  reqOut?: string[];
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
   * este valor na próxima cobrança.
   *
   * **0 desliga, e é o padrão do servidor oficial**: quem zera volta jogando a mesa do recomeço
   * (Contra Bots no Fácil, que senta de graça quem não tem o buy-in). Com a cortesia ligada,
   * quebrar não custa nada — o saldo se refaz sozinho na próxima mesa, qualquer que seja ela.
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
  /**
   * De onde vem o número aleatório das roletas, em [0, 1).
   *
   * O padrão é `crypto`: prêmio previsível é prêmio fraudável. Existe como opção para o **teste**
   * poder fixar o resultado — um sorteio que não se consegue conferir também não se consegue
   * confiar.
   */
  rnd?: () => number;
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
/**
 * O personagem que a conta guarda: o que o cliente diz estar usando, **se for dela**.
 *
 * Era gravado cru, do jeito que chegava no `hello`. Na mesa isso não passava (a trava corta), mas
 * a conta ficava dizendo que a pessoa joga com um personagem que ela não tem — e é daí que a lista
 * de amigos e o resto leem.
 */
function personagemDe(owned: readonly string[] | undefined, id: string): string {
  return ownsItem(owned, 'character', id) ? id : freeIdOf('character');
}

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
    for (const acc of Object.values(this.store.get().accounts)) {
      acc.owned ??= [];
      // de antes dos presentes: estoque vazio e nenhum coração destrancado
      acc.gifts ??= {};
      acc.bondUnlocked ??= {};
      /*
       * O vínculo mudou de regra: jogar deixou de dar pontos, e o coração passou a pedir as duas
       * coisas — a barra cheia (de presentes) e a missão cumprida. Pela regra antiga bastava a
       * missão; quem já tinha corações abertos por ela fica com eles, como piso.
       */
      if (!acc.bondV2) {
        for (const [c, st] of Object.entries(acc.bond)) {
          acc.bondUnlocked[c] = Math.max(acc.bondUnlocked[c] ?? 0, questHearts(st ?? EMPTY_BOND));
        }
        acc.bondV2 = true;
      }
      // de antes da personalidade: quem já jogava começa sem histórico e vai enchendo
      acc.play ??= [];
      // de antes das amizades: cada conta ganha o seu código na primeira vez que o servidor sobe
      acc.friends ??= [];
      acc.reqIn ??= [];
      acc.reqOut ??= [];
      if (!acc.code) acc.code = this.codigoLivre();
    }
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
      gifts: {},
      bondUnlocked: {},
      play: [],
      code: this.codigoLivre(),
      friends: [],
      reqIn: [],
      reqOut: [],
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
      known.character = personagemDe(known.owned, profile.cosmetics.character.id);
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
    const acc = this.create(name, personagemDe([], profile.cosmetics.character.id), { token: hash(token), tokenUntil: until });
    if (!acc) return null;
    console.log(`[conta] nova sem login: ${acc.name} (${acc.id})`);
    // o token só vai nesta resposta: é o que o cliente guarda
    return { ...this.snapshot(acc), token, tokenUntil: until };
  }

  async loginAuth(identity: AuthIdentity, profile: AccountProfile): Promise<AccountInfo | null> {
    const name = sanitizeName(profile.name);
    let acc = this.bySub(identity.sub);
    if (!acc) {
      const nova = this.create(name, personagemDe([], profile.cosmetics.character.id), { sub: identity.sub, user: identity.username });
      if (!nova) return null;
      acc = nova;
      console.log(`[conta] nova com login: ${identity.username} (${acc.id})`);
    }
    acc.name = name;
    acc.user = identity.username;
    acc.character = personagemDe(acc.owned, profile.cosmetics.character.id);
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
      gifts: { ...(acc.gifts ?? {}) },
      // a foto leva os corações **de verdade** (as missões), não o piso guardado
      bondUnlocked: Object.fromEntries(
        [...new Set([...Object.keys(acc.bond), ...Object.keys(acc.bondUnlocked ?? {})])].map((c) => [c, this.abertosDe(acc, c)]),
      ),
      play: ultimasPartidas(acc.play ?? []),
      code: acc.code ?? '',
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

  /**
   * Compra um item da loja.
   *
   * Duas famílias passam por aqui: **presentes**, que são contáveis (comprar de novo aumenta o
   * estoque), e **aparência da interface**, que é posse. O resto do catálogo virou galeria e só sai
   * de roleta — quem recusa é este método, não a tela.
   */
  async buy(accountId: string, key: string, currency: Currency): Promise<string | null> {
    const acc = this.byId(accountId);
    if (!acc) return 'conta não encontrada';
    const item = findItem(key);
    if (!item) return 'esse item não existe';
    if (isFree(key)) return 'esse item já vem com o jogo';
    if (!isSold(item.kind)) return 'esse item não está à venda: ele sai de roleta';
    const contavel = isCountable(key);
    if (!contavel && acc.owned.includes(key)) return 'você já tem esse item';
    const price = priceOf(key, currency);
    if (!price) return 'esse item não está à venda';

    const erro = await this.cobrar(acc, price, currency, item.name, `pokeru:${acc.id}:${key}`);
    if (erro) return erro;

    if (contavel) {
      const id = key.slice('gift:'.length);
      acc.gifts = { ...(acc.gifts ?? {}), [id]: (acc.gifts?.[id] ?? 0) + 1 };
    } else {
      acc.owned.push(key);
    }
    // o que foi pago é para não se perder numa queda: grava na hora
    this.store.flush();
    this.changed(acc.id);
    console.log(`[loja] ${acc.name} comprou ${item.name} por ${price} ${moeda(currency)}`);
    return null;
  }

  /**
   * Tira `price` da moeda pedida. Devolve a mensagem de erro, ou null quando o dinheiro saiu.
   *
   * Está separado porque a compra e o giro de roleta cobram igual: fichas são daqui, padocoins são
   * do GBOT e a cobrança é ida à rede. `idem` é a chave de idempotência do bot — fixa por
   * conta+item numa compra (repetir não cobra duas vezes), única por giro (cada giro é outro).
   */
  private async cobrar(acc: Stored, price: number, currency: Currency, label: string, idem: string): Promise<string | null> {
    if (currency === 'chips') {
      if (acc.money < price) return `faltam ${price - acc.money} fichas`;
      acc.money -= price;
      return null;
    }
    if (!acc.discord) return 'vincule o Discord para pagar com padocoins';
    const gbot = this.opts.gbot;
    if (!gbot?.canMoveMoney) return 'este servidor não está ligado ao serviço de padocoins';
    try {
      const move = await gbot.debit(acc.discord.id, price, `pokeru: ${label}`, idem);
      this.pado.set(acc.id, { value: move.after, at: Date.now() });
    } catch (err) {
      if (err instanceof GbotError) {
        if (err.status === 409) return 'padocoins insuficientes';
        if (err.status === 404) return 'seu Discord não tem conta na economia do bot';
        return err.message;
      }
      return 'não foi possível falar com o serviço de padocoins';
    }
    return null;
  }

  /**
   * Gira uma roleta: cobra o ticket, sorteia e entrega.
   *
   * **O sorteio é aqui, e só aqui.** O cliente pede, anima e mostra o que voltou; ele não escolhe o
   * prêmio nem poderia — nada do que ele manda influencia o resultado. O número aleatório vem de
   * `crypto`, não de `Math.random`, porque prêmio previsível é prêmio fraudável.
   *
   * Prêmio repetido vira fichas (`refundOf`): o ticket nunca sai vazio.
   */
  async spin(accountId: string, roulette: string, currency: Currency): Promise<SpinResult | string> {
    const acc = this.byId(accountId);
    if (!acc) return 'conta não encontrada';
    const r = findRoulette(roulette);
    if (!r) return 'essa roleta não existe';
    const price = ticketPrice(r, currency);

    const idem = `pokeru:${acc.id}:spin:${randomBytes(6).toString('hex')}`;
    const erro = await this.cobrar(acc, price, currency, `ticket da ${r.name}`, idem);
    if (erro) return erro;

    const sorteio = this.opts.rnd ?? (() => randomBytes(4).readUInt32BE(0) / 2 ** 32);
    const prize = draw(r, sorteio());
    const gift = giftOfKey(prize.key);
    let dup = false;
    let refund = 0;
    if (gift) {
      acc.gifts = { ...(acc.gifts ?? {}), [gift.id]: (acc.gifts?.[gift.id] ?? 0) + 1 };
    } else if (acc.owned.includes(prize.key)) {
      dup = true;
      refund = refundOf(prize.key);
      acc.money += refund;
    } else {
      acc.owned.push(prize.key);
    }
    this.store.flush();
    this.changed(acc.id);
    const sobra = dup ? ` (repetido: +${refund} fichas)` : '';
    console.log(`[roleta] ${acc.name} girou a ${r.name} por ${price} ${moeda(currency)} e tirou ${prize.name}${sobra}`);
    return { key: prize.key, dup, refund };
  }

  /**
   * Quantos corações estão abertos para um personagem.
   *
   * Um coração abre quando as duas coisas se encontram: a barra cheia, que só presente enche, e a
   * missão dele cumprida, que só jogar cumpre. O número guardado na conta vale como **piso** — quem
   * abriu corações por uma regra antiga não os perde por uma regra nova.
   */
  private abertosDe(acc: Stored, character: string): number {
    const st = acc.bond[character] ?? EMPTY_BOND;
    return Math.max(acc.bondUnlocked?.[character] ?? 0, Math.min(questHearts(st), heartsOf(st.points)));
  }

  /**
   * Até onde a barra pode subir: o fim do coração seguinte ao da última missão cumprida.
   *
   * A barra enche o coração em andamento e para na borda dele enquanto a missão não fecha — o
   * presente dado não se perde, ele espera.
   */
  private tetoDe(acc: Stored, character: string): number {
    const st = acc.bond[character] ?? EMPTY_BOND;
    return bondCap(Math.max(acc.bondUnlocked?.[character] ?? 0, questHearts(st)));
  }

  /**
   * Dá um presente a um personagem: some do estoque e vira pontos de vínculo.
   *
   * O presente é **o único** que enche a barra; a missão só abre o coração cheio. O que se
   * confere aqui é a altura: cada coração exige um degrau de raridade, e um ramo de sakura
   * oferecido no quinto coração é recusado sem ser consumido.
   *
   * Devolve quantos pontos entraram, ou a mensagem de erro.
   */
  giveGift(accountId: string, character: string, gift: string): number | string {
    const acc = this.byId(accountId);
    if (!acc) return 'conta não encontrada';
    const id = character || acc.character || 'marina';
    if ((acc.gifts?.[gift] ?? 0) < 1) return 'você não tem esse presente';
    const unlocked = this.abertosDe(acc, id);
    if (!giftFits(gift, unlocked)) return `neste coração só vale presente ${giftRarityFor(unlocked)} ou melhor`;
    const stats = acc.bond[id] ?? EMPTY_BOND;
    const cap = this.tetoDe(acc, id);
    if (stats.points >= cap) {
      return unlocked >= HEARTS ? 'esse vínculo já está completo' : 'a barra está cheia: falta cumprir a missão deste coração';
    }

    const pontos = Math.min(giftPoints(id, gift), cap - stats.points);
    acc.gifts = payGift(acc.gifts ?? {}, gift);
    acc.bond[id] = { ...stats, points: stats.points + pontos };
    this.store.flush();
    this.changed(acc.id);
    console.log(`[vínculo] ${acc.name} deu ${gift} a ${id} e ganhou ${pontos} pontos`);
    return pontos;
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

  /**
   * Prêmio em padocoin por terminar a partida (shared/room.ts).
   *
   * Sai do mesmo lugar que a devolução de mesa — a economia do bot —, mas com motivo próprio,
   * para o extrato de quem recebe dizer de onde veio. Quem não tem Discord não recebe e não é
   * avisado: não há o que avisar, padocoin só existe lá.
   *
   * Não espera a rede: a mesa acabou de acabar, e travar o fim da partida numa chamada HTTP
   * deixaria todo mundo olhando a tela de placar. Falha vira log, como na devolução.
   */
  bonus(accountId: string, amount: number, key: string, motivo: string): void {
    const acc = this.byId(accountId);
    const gbot = this.opts.gbot;
    const got = Math.max(0, Math.round(amount));
    if (!acc?.discord || !gbot?.canMoveMoney || !got) return;
    void gbot
      .credit(acc.discord.id, got, `pokeru: ${motivo}`, key)
      .then((move) => {
        this.pado.set(acc.id, { value: move.after, at: Date.now() });
        this.changed(acc.id);
        console.log(`[padocoin] ${acc.name} ganhou ${got} de bônus (${motivo}, saldo ${move.after})`);
      })
      .catch((err) => {
        const razao = err instanceof GbotError ? `${err.status} ${err.message}` : String(err);
        console.error(`[padocoin] FALHA no bônus de ${got} para ${acc.name} (${acc.discord!.id}), chave ${key}: ${razao}`);
      });
  }

  // ---------------------------------------------------------------- amizades

  /**
   * Um código que ninguém tem ainda.
   *
   * Com 887 milhões de combinações a colisão é raríssima, mas "raríssima" com código repetido
   * significaria duas contas que atendem pelo mesmo código — e aí um pedido de amizade vai para a
   * pessoa errada. Tentar de novo custa nada.
   */
  private codigoLivre(): string {
    const usados = new Set(Object.values(this.store.get().accounts).map((a) => a.code));
    for (let i = 0; i < 50; i++) {
      const c = makeFriendCode();
      if (!usados.has(c)) return c;
    }
    return makeFriendCode();
  }

  byCode(code: string): string | null {
    const c = normalizeFriendCode(code);
    if (!isFriendCode(c)) return null;
    return Object.values(this.store.get().accounts).find((a) => a.code === c)?.id ?? null;
  }

  /** A ficha de uma conta como os outros a veem: sem saldo, sem token, sem nada de dentro. */
  private row(acc: Stored): FriendRow {
    const stats = sanitizeStats(acc.stats);
    return {
      id: acc.id,
      code: acc.code ?? '',
      name: acc.name,
      level: playerLevel(stats),
      title: sanitizeTitle(acc.title, stats),
      character: acc.character || 'marina',
    };
  }

  private rows(ids: readonly string[] | undefined): FriendRow[] {
    return (ids ?? []).map((id) => this.byId(id)).filter((a): a is Stored => !!a).map((a) => this.row(a));
  }

  friends(accountId: string): { friends: FriendRow[]; incoming: FriendRow[]; outgoing: FriendRow[] } {
    const acc = this.byId(accountId);
    if (!acc) return { friends: [], incoming: [], outgoing: [] };
    return { friends: this.rows(acc.friends), incoming: this.rows(acc.reqIn), outgoing: this.rows(acc.reqOut) };
  }

  /** Junta os dois como amigos e limpa os pedidos pendentes entre eles. */
  private amizade(a: Stored, b: Stored): void {
    const juntar = (lista: string[] | undefined, id: string) => (lista?.includes(id) ? lista : [...(lista ?? []), id]);
    const tirar = (lista: string[] | undefined, id: string) => (lista ?? []).filter((x) => x !== id);
    a.friends = juntar(a.friends, b.id);
    b.friends = juntar(b.friends, a.id);
    a.reqIn = tirar(a.reqIn, b.id);
    a.reqOut = tirar(a.reqOut, b.id);
    b.reqIn = tirar(b.reqIn, a.id);
    b.reqOut = tirar(b.reqOut, a.id);
  }

  requestFriend(accountId: string, code: string): { to: string; aceito: boolean } | string {
    const acc = this.byId(accountId);
    if (!acc) return 'conta não encontrada';
    const alvoId = this.byCode(code);
    if (!alvoId) return 'nenhuma conta com esse código';
    if (alvoId === acc.id) return 'esse código é o seu';
    const alvo = this.byId(alvoId)!;
    if (acc.friends?.includes(alvoId)) return `você e ${alvo.name} já são amigos`;
    if (!podeMaisAmigos(acc.friends?.length ?? 0)) return 'sua lista de amigos está cheia';
    if (!podeMaisAmigos(alvo.friends?.length ?? 0)) return `a lista de ${alvo.name} está cheia`;

    /*
     * Pedido cruzado vira amizade na hora.
     *
     * Os dois se acharam ao mesmo tempo e trocaram código; exigir que um deles vá na lista
     * aceitar o que acabou de pedir seria burocracia sem nenhuma proteção em troca.
     */
    if (acc.reqIn?.includes(alvoId)) {
      this.amizade(acc, alvo);
      this.store.flush();
      this.changed(acc.id);
      this.changed(alvo.id);
      return { to: alvoId, aceito: true };
    }
    if (acc.reqOut?.includes(alvoId)) return `o pedido para ${alvo.name} já está esperando`;
    if ((alvo.reqIn?.length ?? 0) >= MAX_REQUESTS) return `a caixa de pedidos de ${alvo.name} está cheia`;

    acc.reqOut = [...(acc.reqOut ?? []), alvoId];
    alvo.reqIn = [...(alvo.reqIn ?? []), acc.id];
    this.store.flush();
    this.changed(acc.id);
    this.changed(alvo.id);
    console.log(`[amigos] ${acc.name} pediu amizade a ${alvo.name}`);
    return { to: alvoId, aceito: false };
  }

  acceptFriend(accountId: string, otherId: string): string | null {
    const acc = this.byId(accountId);
    const alvo = this.byId(otherId);
    if (!acc || !alvo) return 'conta não encontrada';
    if (!acc.reqIn?.includes(otherId)) return 'não há pedido dessa pessoa';
    if (!podeMaisAmigos(acc.friends?.length ?? 0)) return 'sua lista de amigos está cheia';
    this.amizade(acc, alvo);
    this.store.flush();
    this.changed(acc.id);
    this.changed(alvo.id);
    console.log(`[amigos] ${acc.name} e ${alvo.name} agora são amigos`);
    return null;
  }

  declineFriend(accountId: string, otherId: string): string | null {
    const acc = this.byId(accountId);
    const alvo = this.byId(otherId);
    if (!acc || !alvo) return 'conta não encontrada';
    // serve para recusar o que chegou e para cancelar o que foi enviado: é a mesma limpeza
    acc.reqIn = (acc.reqIn ?? []).filter((x) => x !== otherId);
    acc.reqOut = (acc.reqOut ?? []).filter((x) => x !== otherId);
    alvo.reqIn = (alvo.reqIn ?? []).filter((x) => x !== accountId);
    alvo.reqOut = (alvo.reqOut ?? []).filter((x) => x !== accountId);
    this.store.flush();
    this.changed(acc.id);
    this.changed(alvo.id);
    return null;
  }

  removeFriend(accountId: string, otherId: string): string | null {
    const acc = this.byId(accountId);
    const alvo = this.byId(otherId);
    if (!acc || !alvo) return 'conta não encontrada';
    // desfaz dos dois lados: amizade de um lado só é uma lista mentindo para alguém
    acc.friends = (acc.friends ?? []).filter((x) => x !== otherId);
    alvo.friends = (alvo.friends ?? []).filter((x) => x !== accountId);
    this.store.flush();
    this.changed(acc.id);
    this.changed(alvo.id);
    return null;
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

  /**
   * Conta um momento de vínculo nas missões do personagem.
   *
   * Jogar não dá pontos — só presente enche a barra. O que a mão ou a partida mexe são os
   * contadores das missões (mãos, vitórias, partidas), e são elas que abrem o coração cheio. É
   * aqui que a regra vale de verdade; o cliente só desenha.
   */
  bond(accountId: string, character: string, ev: BondEvent): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    const id = character || acc.character || 'marina';
    acc.bond[id] = addBond(acc.bond[id] ?? EMPTY_BOND, ev);
    this.changed(acc.id);
  }

  /** Guarda como a conta está vestida — o card de quem está offline sai daqui. */
  vestir(accountId: string, visual: Aparencia): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    const { character, ...resto } = visual;
    const antes = JSON.stringify([acc.character, acc.aparencia]);
    // o personagem guardado é só o que a conta tem (veja personagemDe)
    acc.character = personagemDe(acc.owned, character);
    acc.aparencia = resto;
    if (JSON.stringify([acc.character, acc.aparencia]) !== antes) this.store.touch();
  }

  aparencia(accountId: string): Aparencia | null {
    const acc = this.byId(accountId);
    if (!acc) return null;
    const a = acc.aparencia;
    return {
      character: acc.character,
      auras: a?.auras ?? [...DEFAULT_AURAS],
      frame: a?.frame ?? DEFAULT_FRAME,
      face: a?.face ?? FACE_PRESETS[0],
      back: a?.back ?? BACK_PRESETS[0],
    };
  }

  /**
   * Guarda como a conta jogou uma partida.
   *
   * A lista é uma janela: entra a partida nova, sai a décima primeira. A personalidade tem de
   * poder mudar — quem passou a semana pagando tudo e resolveu apertar o jogo vê o gráfico virar
   * junto, e um histórico eterno faria o contrário, congelaria a pessoa no que ela era.
   */
  play(accountId: string, resumo: ResumoDaPartida): void {
    const acc = this.byId(accountId);
    if (!acc) return;
    acc.play = [...(acc.play ?? []), resumo].slice(-PARTIDAS_LEMBRADAS);
    this.store.flush();
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

  /**
   * Troca o nome da conta no meio da sessão.
   *
   * O nome só era gravado ao entrar, e o grupo e a lista de amigos leem o nome **da conta**: quem
   * mudava de nome no perfil continuava com o antigo para todo mundo até sair e entrar de novo.
   */
  rename(accountId: string, name: string): void {
    const acc = this.byId(accountId);
    const novo = sanitizeName(name);
    if (!acc || acc.name === novo) return;
    acc.name = novo;
    this.store.touch();
    this.changed(acc.id);
  }

  /** Experiência acumulada da conta — o placar mostra o antes e o depois da partida com isto. */
  xp(accountId: string): number {
    const acc = this.byId(accountId);
    return acc ? xpOf(sanitizeStats(acc.stats)) : 0;
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
