import { Room, makeId, sanitizeSettings, type ClientHandle } from './room';
import type { AccountService } from './accounts';
import type { BotDifficulty, ClientMsg, RoomSummary, ServerMsg } from './protocol';
import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  DEFAULT_WIN_FX,
  sanitizeAvatar,
  sanitizeCosmetics,
  sanitizeName,
  type AvatarInfo,
  type PlayerCosmetics,
} from './styles';

/**
 * Lobby: gerencia conexões e salas. É independente de transporte —
 * o servidor Node conecta WebSockets aqui e o modo offline conecta direto no navegador.
 *
 * Com um serviço de contas (`accounts`), o servidor guarda saldo e vínculo de cada jogador: o
 * `hello` entra na conta, as mesas a dinheiro cobram o buy-in e o cliente recebe a foto da conta
 * sempre que ela muda. Sem contas, tudo funciona como antes (fichas de brinquedo).
 */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  private conns = new Set<Connection>();
  private listTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly serverName = 'Pokeru',
    readonly accounts: AccountService | null = null,
  ) {
    if (accounts) accounts.onChange = (id) => this.accountChanged(id);
  }

  /** Manda a foto nova da conta para quem está logado nela. */
  private accountChanged(accountId: string): void {
    const account = this.accounts?.info(accountId);
    if (!account) return;
    for (const c of this.conns) if (c.accountId === accountId) c.send({ type: 'account', account });
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
  cosmetics: PlayerCosmetics = { back: BACK_PRESETS[0], character: CHARACTER_PRESETS[0], winFx: DEFAULT_WIN_FX };
  room: Room | null = null;
  greeted = false;
  private lastChat = 0;
  private closed = false;

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
    this.cosmetics = sanitizeCosmetics(msg.cosmetics);
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
        this.setProfile(msg);
        this.greeted = true;
        this.send({ type: 'welcome', playerId: this.id, serverName: this.lobby.serverName });
        // servidor com contas: entra (ou cria) a conta e manda saldo e vínculo
        const accounts = this.lobby.accounts;
        if (accounts) {
          const account = accounts.login(msg.account, { name: this.name, avatar: this.avatar, cosmetics: this.cosmetics });
          // sem conta (servidor cheio), o jogador segue só nas mesas livres
          if (account) {
            this.accountId = account.id;
            this.send({ type: 'account', account });
          }
        }
        this.send({ type: 'rooms', rooms: this.lobby.list() });
        break;
      }
      case 'updateProfile': {
        this.setProfile(msg);
        this.room?.updateProfile(this);
        break;
      }
      case 'listRooms':
        this.send({ type: 'rooms', rooms: this.lobby.list() });
        break;
      case 'createRoom': {
        if (this.room) this.leave();
        const room = this.lobby.createRoom(this, msg.settings);
        const err = room.join(this, msg.settings?.password);
        if (err) {
          this.error(err);
          return;
        }
        this.room = room;
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
        const err = room.join(this, typeof msg.password === 'string' ? msg.password : undefined);
        if (err) {
          this.error(err);
          return;
        }
        this.room = room;
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
