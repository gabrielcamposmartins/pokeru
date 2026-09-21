import { Room, makeId, sanitizeSettings, type ClientHandle } from './room';
import type { AccountInfo, AccountProfile, AccountService, AuthIdentity } from './accounts';
import { playerLevel } from './achievements';
import { clampCosmetics } from './catalog';
import { queueSettings, type BotDifficulty, type ClientMsg, type Currency, type RoomSummary, type ServerMsg } from './protocol';
import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  DEFAULT_WIN_FX,
  sanitizeAvatar,
  sanitizeCosmetics,
  sanitizeName,
  type AvatarInfo,
  type PlayerCosmetics,
  FACE_PRESETS,
  CHIP_PRESETS,
  TABLE_PRESETS,
} from './styles';

/**
 * Lobby: gerencia conexões e salas. É independente de transporte —
 * o servidor Node conecta WebSockets aqui e o modo offline conecta direto no navegador.
 *
 * Com um serviço de contas (`accounts`), o servidor guarda saldo, itens e vínculo de cada jogador:
 * o `hello` entra na conta, as mesas a dinheiro cobram o buy-in e o cliente recebe a foto da conta
 * sempre que ela muda. Sem contas, tudo funciona como antes (fichas de brinquedo).
 *
 * Com um validador (`auth`), o `hello` pode trazer o **JWT** do serviço de contas: o servidor o
 * valida por conta própria e é daí que sai a identidade do jogador. Sem validador — o modo offline,
 * por exemplo — só existe a identidade por token deste aparelho.
 */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  private conns = new Set<Connection>();
  private listTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly serverName = 'Pokeru',
    readonly accounts: AccountService | null = null,
    /**
     * Valida o JWT do serviço de contas e devolve a identidade (null = token não vale). Só o
     * servidor Node tem isso: a validação usa criptografia do Node (veja server/jwt.ts).
     */
    readonly auth: ((jwt: string) => Promise<AuthIdentity | null>) | null = null,
  ) {
    if (accounts) accounts.onChange = (id) => this.accountChanged(id);
  }

  /** Manda a foto nova da conta para quem está logado nela. */
  private accountChanged(accountId: string): void {
    const account = this.accounts?.info(accountId);
    if (!account) return;
    for (const c of this.conns) {
      if (c.accountId !== accountId) continue;
      c.send({ type: 'account', account });
      // subiu de nível (ou o título deixou de valer) no meio da partida: a mesa precisa saber
      if (c.applyAccount(account)) c.room?.updateProfile(c);
    }
  }

  connect(send: (m: ServerMsg) => void): Connection {
    const c = new Connection(this, send);
    this.conns.add(c);
    return c;
  }

  /** @internal */
  drop(c: Connection): void {
    this.conns.delete(c);
  }

  /** As salas da lista pública (as partidas contra bots ficam de fora). */
  list(): RoomSummary[] {
    return [...this.rooms.values()].filter((r) => r.settings.listed).map((r) => r.summary());
  }

  /**
   * As mesas da fila que aceitam mais um, na ordem em que a fila deve tentar: primeiro as que têm
   * **mais gente**, para juntar jogadores em vez de espalhá-los por mesas vazias.
   *
   * Uma mesa cheia de bots ainda conta: o `Room.join` tira um bot para dar lugar. Cheia de gente,
   * não — e aí a fila tenta a próxima, ou abre uma nova.
   */
  queueRooms(currency: Currency): Room[] {
    return [...this.rooms.values()]
      .filter((r) => r.settings.queue && r.settings.currency === currency && r.status !== 'finished' && !r.settings.password)
      .filter((r) => {
        const s = r.summary();
        return s.players < s.maxPlayers || s.bots > 0;
      })
      .sort((a, b) => b.summary().players - b.summary().bots - (a.summary().players - a.summary().bots));
  }

  createRoom(host: Connection, settings: unknown): Room {
    let id = makeId(5);
    while (this.rooms.has(id)) id = makeId(5);
    const room = new Room(id, sanitizeSettings(settings as never), host);
    room.bank = this.accounts;
    room.onChange = () => this.roomsChanged();
    room.onEmpty = () => {
      this.rooms.delete(id);
      this.roomsChanged();
    };
    this.rooms.set(id, room);
    this.roomsChanged();
    return room;
  }

  roomsChanged(): void {
    if (this.listTimer) return;
    this.listTimer = setTimeout(() => {
      this.listTimer = null;
      const rooms = this.list();
      for (const c of this.conns) if (c.greeted && !c.room) c.send({ type: 'rooms', rooms });
    }, 250);
  }

  get connectionCount(): number {
    return this.conns.size;
  }
}

const DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'hard'];

export class Connection implements ClientHandle {
  readonly id = 'p-' + makeId(10);
  /** Conta do servidor hospedado (undefined quando o servidor não guarda contas). */
  accountId?: string;
  name = 'Jogador';
  avatar: AvatarInfo = { color: '#7c5cff', icon: '♠' };
  /** Cosméticos que a mesa usa: já cortados para o que a conta possui. */
  cosmetics: PlayerCosmetics = {
    face: FACE_PRESETS[0],
    back: BACK_PRESETS[0],
    chip: CHIP_PRESETS[0],
    table: TABLE_PRESETS[0],
    character: CHARACTER_PRESETS[0],
    winFx: DEFAULT_WIN_FX,
  };
  /** Titulo de conquista da conta (null sem conta ou sem titulo escolhido). */
  title: string | null = null;
  /** Nível do jogador, dos contadores da conta. 0 = sem conta. */
  level = 0;
  /** O que o cliente pediu, antes do corte — é o que volta a valer quando ele compra o item. */
  private wanted: PlayerCosmetics = this.cosmetics;
  /** Itens da conta (chaves do catálogo). Vazio = só o que é grátis. */
  private owns: readonly string[] = [];
  room: Room | null = null;
  greeted = false;
  /** Já recebeu um `hello` (a validação do token pode ainda estar em curso). */
  private greeting = false;
  /** Uma entrada na fila por vez: dois cliques não devem virar duas mesas. */
  private queueing = false;
  private lastChat = 0;
  private closed = false;
  private buying = false;

  constructor(
    private lobby: Lobby,
    private sink: (m: ServerMsg) => void,
  ) {}

  send(m: ServerMsg): void {
    if (!this.closed) this.sink(m);
  }

  private error(message: string | null): void {
    if (message) this.send({ type: 'error', message });
  }

  private setProfile(msg: { name: unknown; avatar: unknown; cosmetics: unknown }): void {
    this.name = sanitizeName(msg.name);
    this.avatar = sanitizeAvatar(msg.avatar);
    this.wanted = sanitizeCosmetics(msg.cosmetics);
    this.applyOwned(this.owns);
  }

  /**
   * Guarda o que a conta possui e corta os cosméticos de acordo.
   *
   * É aqui que "server authoritative" deixa de ser promessa: o que o cliente pediu fica em
   * `wanted`, mas quem vai para a mesa é o resultado do corte. Cliente modificado, `hello` forjado
   * à mão, item vendido e depois removido — em todos os casos a mesa mostra o que a pessoa tem.
   *
   * Num lobby **sem serviço de contas** não há corte: é o modo offline, onde o jogador joga
   * sozinho contra bots na própria máquina. Não existe posse para conferir nem ninguém para
   * proteger, e cortar ali só tiraria da pessoa o que ela já tem no perfil.
   */
  /**
   * O que da conta vai para a mesa: título e nível. Devolve true quando mudou algo — é o que
   * decide se vale reavisar a sala.
   */
  applyAccount(account: AccountInfo): boolean {
    const title = account.title;
    const level = playerLevel(account.stats);
    if (title === this.title && level === this.level) return false;
    this.title = title;
    this.level = level;
    return true;
  }

  private applyOwned(owned: readonly string[]): void {
    this.owns = owned;
    this.cosmetics = this.lobby.accounts ? clampCosmetics(this.wanted, owned) : this.wanted;
  }

  private profile(): AccountProfile {
    return { name: this.name, avatar: this.avatar, cosmetics: this.cosmetics };
  }

  /** Fecha a apresentação: manda o `welcome`, a conta (se houver) e a lista de salas. */
  private finishHello(account: ReturnType<AccountService['login']>): void {
    if (this.closed) return;
    this.greeted = true;
    this.send({ type: 'welcome', playerId: this.id, serverName: this.lobby.serverName });
    // sem conta (servidor cheio, ou sem serviço), o jogador segue só nas mesas livres
    if (account) {
      this.accountId = account.id;
      this.applyOwned(account.owned);
      this.applyAccount(account);
      this.send({ type: 'account', account });
    }
    this.send({ type: 'rooms', rooms: this.lobby.list() });
  }

  handle(raw: unknown): void {
    if (this.closed || !raw || typeof raw !== 'object') return;
    const msg = raw as ClientMsg;
    if (typeof msg.type !== 'string') return;
    if (msg.type === 'ping') {
      this.send({ type: 'pong' });
      return;
    }
    if (!this.greeted && msg.type !== 'hello') {
      this.error('Envie "hello" primeiro');
      return;
    }

    switch (msg.type) {
      case 'hello': {
        if (this.greeting) return;
        this.greeting = true;
        this.setProfile(msg);
        const accounts = this.lobby.accounts;
        const jwt = typeof msg.jwt === 'string' ? msg.jwt : '';
        // com login: a identidade sai do JWT, e validá-lo é ida à rede (o JWKS)
        if (jwt && accounts && this.lobby.auth) {
          void this.lobby.auth(jwt).then(
            async (identity) => {
              if (this.closed) return;
              if (!identity) {
                // token velho ou forjado: entra sem conta em vez de ficar de fora do jogo
                this.error('sua sessão expirou — entre de novo para usar sua conta');
                this.finishHello(null);
                return;
              }
              this.finishHello(await accounts.loginAuth(identity, this.profile()));
            },
            (err: unknown) => {
              console.warn('[auth] falha ao validar o token:', err instanceof Error ? err.message : err);
              if (!this.closed) this.finishHello(null);
            },
          );
          return;
        }
        // sem login: identidade por token deste aparelho (ou nenhuma, sem serviço de contas)
        this.finishHello(accounts ? accounts.login(msg.account, this.profile()) : null);
        break;
      }
      case 'updateProfile': {
        this.setProfile(msg);
        this.room?.updateProfile(this);
        break;
      }
      case 'setTitle': {
        const accounts = this.lobby.accounts;
        if (!accounts || !this.accountId) {
          this.error('titulos precisam de uma conta no servidor');
          return;
        }
        accounts.setTitle(this.accountId, typeof msg.title === 'string' ? msg.title : null);
        // o servidor e' quem decide se o titulo vale; o que ele devolver e' o que vai a mesa
        const info = accounts.info(this.accountId);
        if (info) this.applyAccount(info);
        this.room?.updateProfile(this);
        break;
      }
      case 'buy': {
        const accounts = this.lobby.accounts;
        if (!accounts || !this.accountId) {
          this.error('a loja precisa de uma conta no servidor');
          return;
        }
        // uma compra por vez: duas chamadas juntas na mesma conta só dariam erro depois
        if (this.buying) {
          this.error('espere a compra anterior terminar');
          return;
        }
        this.buying = true;
        const item = String(msg.item ?? '');
        const currency = msg.currency === 'pado' ? 'pado' : 'chips';
        void accounts
          .buy(this.accountId, item, currency)
          .then((err) => {
            if (this.closed) return;
            if (err) {
              this.error(err);
              return;
            }
            // o item é dele: os cosméticos voltam a valer, e a mesa vê na hora
            this.applyOwned(accounts.owned(this.accountId!));
            this.send({ type: 'bought', item, currency });
            this.room?.updateProfile(this);
          })
          .catch((err: unknown) => {
            console.error('[loja] erro ao comprar', item, err);
            if (!this.closed) this.error('não foi possível concluir a compra');
          })
          .finally(() => {
            this.buying = false;
          });
        break;
      }
      case 'refreshAccount': {
        const accounts = this.lobby.accounts;
        if (!accounts?.refresh || !this.accountId) return;
        void accounts.refresh(this.accountId).catch(() => {
          /* saldo externo fora do ar: a foto atual continua valendo */
        });
        break;
      }
      case 'listRooms':
        this.send({ type: 'rooms', rooms: this.lobby.list() });
        break;
      case 'createRoom': {
        if (this.room) this.leave();
        const room = this.lobby.createRoom(this, msg.settings);
        void this.sit(room, msg.settings?.password);
        break;
      }
      case 'joinRoom': {
        const room = this.lobby.rooms.get(String(msg.roomId ?? '').toLowerCase());
        if (!room) {
          this.error('Sala não encontrada');
          return;
        }
        if (this.room === room) return;
        if (this.room) this.leave();
        void this.sit(room, typeof msg.password === 'string' ? msg.password : undefined);
        break;
      }
      case 'quickMatch': {
        if (this.queueing) return;
        this.queueing = true;
        void this.quickMatch(msg.currency === 'pado' ? 'pado' : 'chips').finally(() => {
          this.queueing = false;
        });
        break;
      }
      case 'leaveRoom':
        this.leave();
        this.send({ type: 'rooms', rooms: this.lobby.list() });
        break;
      case 'addBot':
        if (!this.room) return;
        this.error(this.room.addBot(this.id, DIFFICULTIES.includes(msg.difficulty) ? msg.difficulty : 'normal'));
        break;
      case 'removeBot':
        if (!this.room) return;
        this.error(this.room.removeBot(this.id, Number(msg.seat)));
        break;
      case 'ready':
        // a tela de abertura acabou de carregar deste lado
        this.room?.ready(this.id);
        break;
      case 'startGame':
        if (!this.room) return;
        if (this.room.status === 'finished') this.error(this.room.reset(this.id));
        this.error(this.room.start(this.id));
        break;
      case 'action':
        if (!this.room) return;
        this.error(this.room.handleAction(this.id, msg.action));
        break;
      case 'skipHand':
        if (!this.room) return;
        this.error(this.room.skipHand(this.id));
        break;
      case 'draw':
        if (!this.room) return;
        this.error(this.room.handleDraw(this.id, msg.discards));
        break;
      case 'chat': {
        const now = Date.now();
        if (!this.room || now - this.lastChat < 600) return;
        this.lastChat = now;
        this.room.chat(this.id, msg.text);
        break;
      }
      case 'emote': {
        const now = Date.now();
        if (!this.room || now - this.lastChat < 600) return;
        this.lastChat = now;
        this.room.emote(this.id, msg.emote);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Senta numa sala. Sentar é assíncrono por causa da mesa de padocoin, que cobra o buy-in no bot
   * antes de ocupar a cadeira.
   */
  private async sit(room: Room, password?: string): Promise<boolean> {
    // mesa normal senta na hora; só a de padocoin passa pela rede antes de ocupar a cadeira
    const err = room.asyncBuyIn ? await room.joinPaid(this, password) : room.join(this, password);
    if (this.closed) {
      // desconectou durante a cobrança: devolve a cadeira em vez de deixar um fantasma sentado
      if (!err) room.leave(this.id);
      return false;
    }
    if (err) {
      this.error(err);
      return false;
    }
    this.room = room;
    return true;
  }

  /**
   * Fila rápida: entra numa mesa da fila que já exista ou abre uma com três bots.
   *
   * O jogador não escolhe nada — é o ponto da fila. A mesa é cash (com rebuy), seis lugares, e os
   * bots vão saindo conforme gente chega (veja `Room.join`).
   */
  private async quickMatch(currency: Currency): Promise<void> {
    if (this.room) this.leave();
    const candidatas = this.lobby.queueRooms(currency);
    for (const room of candidatas) {
      if (await this.sit(room)) return;
      if (this.closed) return;
    }
    // nenhuma servia: abre a própria, com três bots para a mesa já ter jogo
    const room = this.lobby.createRoom(this, queueSettings(currency));
    if (!(await this.sit(room))) return;
    for (let i = 0; i < 3; i++) this.error(room.addBot(this.id, 'normal'));
    this.error(room.start(this.id));
  }

  private leave(): void {
    const r = this.room;
    this.room = null;
    r?.leave(this.id);
  }

  close(): void {
    if (this.closed) return;
    this.leave();
    this.closed = true;
    this.lobby.drop(this);
  }
}
