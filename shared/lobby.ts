import { Room, makeId, sanitizeSettings, type ClientHandle } from './room';
import type { AccountInfo, AccountProfile, AccountService, AuthIdentity } from './accounts';
import { playerLevel } from './achievements';
import { MAX_PARTY, podeMaisNoGrupo, type CartaoJogador, type FriendInfo, type PartyInfo, type PartyKind, type PerfilPublico } from './friends';
import type { FriendRow } from './accounts';
import { clampCosmetics } from './catalog';
import {
  BOT_MATCH,
  DIFFICULTIES,
  botMatchSettings,
  botTier,
  queueSettings,
  tierUnlocked,
  type BotDifficulty,
  type ClientMsg,
  type Currency,
  type RoomSettings,
  type RoomSummary,
  type ServerMsg,
} from './protocol';
import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  DEFAULT_AURAS,
  DEFAULT_FRAME,
  DEFAULT_WIN_FX,
  sanitizeAvatar,
  sanitizeCosmetics,
  sanitizeName,
  findCharacter,
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
/**
 * Um grupo: gente que vai jogar junto.
 *
 * Vive **em memória**, e de propósito: grupo é do momento, não é clã. Um reinício do servidor
 * desfaz os grupos e ninguém perde nada — as amizades, que são o que a pessoa construiu, estão em
 * disco.
 */
interface Party {
  id: string;
  /** Conta do líder: quem convida e quem manda o grupo jogar. */
  leader: string;
  /** Contas no grupo, o líder incluso. */
  members: string[];
  /** Contas convidadas e ainda sem resposta. */
  convidados: Set<string>;
}

export class Lobby {
  readonly rooms = new Map<string, Room>();
  private conns = new Set<Connection>();
  private listTimer: ReturnType<typeof setTimeout> | null = null;
  /** Grupos abertos, por id. */
  private parties = new Map<string, Party>();

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

  /** Pessoas sentadas nas mesas da fila rápida, nas duas moedas (bot não conta). */
  filaJogadores(): number {
    let n = 0;
    for (const r of this.rooms.values()) {
      if (!r.settings.queue || r.status === 'finished') continue;
      const s = r.summary();
      n += s.players - s.bots;
    }
    return n;
  }

  roomsChanged(): void {
    if (this.listTimer) return;
    this.listTimer = setTimeout(() => {
      this.listTimer = null;
      const rooms = this.list();
      // a contagem da fila vai junto: é a mesma mudança (alguém sentou ou levantou) que muda a lista
      const fila = { type: 'fila' as const, jogadores: this.filaJogadores() };
      for (const c of this.conns) {
        if (!c.greeted || c.room) continue;
        c.send({ type: 'rooms', rooms });
        c.send(fila);
      }
    }, 250);
  }

  get connectionCount(): number {
    return this.conns.size;
  }

  // ------------------------------------------------------------------ amizades

  /** As conexões de uma conta (a mesma conta pode estar aberta em dois lugares). */
  private connsOf(accountId: string): Connection[] {
    return [...this.conns].filter((c) => c.accountId === accountId && c.greeted);
  }

  /** A conta está conectada agora? É daqui que sai a bolinha verde. */
  online(accountId: string): boolean {
    return this.connsOf(accountId).length > 0;
  }

  /**
   * A ficha de um amigo: o que é da conta (nome, nível, código) mais o que é do momento.
   *
   * O estado online **não** é guardado em disco: ele é uma conexão aberta, e ler de outro lugar
   * seria inventar — um servidor que caiu deixaria todo mundo verde para sempre.
   */
  private friendInfo(row: FriendRow): FriendInfo {
    const conns = this.connsOf(row.id);
    return { ...row, online: conns.length > 0, playing: conns.some((c) => !!c.room) };
  }

  /** A lista de amigos de uma conta, pronta para o cliente. */
  friendsFor(accountId: string): { friends: FriendInfo[]; incoming: FriendInfo[]; outgoing: FriendInfo[] } {
    const raw = this.accounts?.friends(accountId) ?? { friends: [], incoming: [], outgoing: [] };
    const conv = (rows: FriendRow[]) => rows.map((r) => this.friendInfo(r));
    /*
     * Online primeiro, e depois por nome.
     *
     * A lista serve para achar **com quem jogar agora**; quem está offline pode ficar embaixo.
     * Ordenar só por nome deixaria a pessoa procurando a bolinha verde numa lista de cinquenta.
     */
    const ordem = (a: FriendInfo, b: FriendInfo) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pt-BR');
    return { friends: conv(raw.friends).sort(ordem), incoming: conv(raw.incoming), outgoing: conv(raw.outgoing) };
  }

  /** Manda a lista de amigos para todas as conexões de uma conta. */
  sendFriends(accountId: string): void {
    if (!this.accounts) return;
    const l = this.friendsFor(accountId);
    for (const c of this.connsOf(accountId)) c.send({ type: 'friends', ...l });
  }

  /** Reavisa os amigos de alguém: a bolinha dele mudou de cor para eles. */
  private avisaAmigos(accountId: string, entrou: boolean, name: string): void {
    const raw = this.accounts?.friends(accountId);
    if (!raw) return;
    for (const amigo of raw.friends) {
      if (entrou) for (const c of this.connsOf(amigo.id)) c.send({ type: 'friendOnline', id: accountId, name });
      this.sendFriends(amigo.id);
    }
  }

  /** @internal Uma conta entrou: avisa quem é amigo dela e manda a lista dela. */
  entrou(accountId: string, name: string): void {
    this.avisaAmigos(accountId, true, name);
    this.sendFriends(accountId);
  }

  /**
   * @internal O perfil de uma conta mudou no meio da sessão (nome, personagem).
   *
   * O grupo mostra nome e personagem de cada um, e a lista de amigos mostra o nome: os dois são
   * reenviados, para ninguém ficar vendo o nome antigo até a pessoa sair e entrar de novo.
   */
  mudouPerfil(accountId: string, nomeMudou: boolean): void {
    const p = this.partyOf(accountId);
    if (p) this.broadcastParty(p);
    if (!nomeMudou) return;
    for (const amigo of this.accounts?.friends(accountId).friends ?? []) this.sendFriends(amigo.id);
  }

  /** @internal Uma conta saiu: os amigos perdem a bolinha verde, e o grupo perde um membro. */
  saiu(accountId: string, name: string): void {
    // outra aba da mesma conta ainda aberta: para os amigos, ele não saiu
    if (this.online(accountId)) return;
    this.avisaAmigos(accountId, false, name);
    this.deixarGrupo(accountId);
  }

  // ------------------------------------------------------------------ grupo

  /** O grupo de uma conta, se ela estiver em algum. */
  partyOf(accountId: string): Party | null {
    for (const p of this.parties.values()) if (p.members.includes(accountId)) return p;
    return null;
  }

  /**
   * O card de uma conta — o mesmo da tela de abertura.
   *
   * Conectada, ele sai da conexão (o que ela está vestindo agora, já cortado para o que a conta
   * tem); offline, de como ela estava vestida da última vez (`aparencia`).
   */
  cartaoDe(accountId: string): CartaoJogador {
    const info = this.accounts?.info(accountId);
    const conn = this.connsOf(accountId)[0];
    const base = { name: info?.name ?? conn?.name ?? 'Jogador', level: info ? playerLevel(info.stats) : (conn?.level ?? 0), title: info?.title ?? conn?.title ?? null };
    if (conn) {
      const c = conn.cosmetics;
      return { ...base, character: c.character, auras: c.auras, frame: c.frame, face: c.face, back: c.back };
    }
    const a = this.accounts?.aparencia?.(accountId);
    return {
      ...base,
      character: findCharacter(a?.character ?? 'marina'),
      auras: a?.auras ?? [...DEFAULT_AURAS],
      frame: a?.frame ?? DEFAULT_FRAME,
      face: a?.face ?? FACE_PRESETS[0],
      back: a?.back ?? BACK_PRESETS[0],
    };
  }

  private partyInfo(p: Party): PartyInfo {
    return {
      id: p.id,
      leader: p.leader,
      members: p.members.map((id) => {
        const cartao = this.cartaoDe(id);
        return {
          id,
          name: cartao.name,
          character: cartao.character.id,
          level: cartao.level,
          leader: id === p.leader,
          online: this.online(id),
          cartao,
        };
      }),
    };
  }

  /**
   * O perfil de um amigo: o card, o histórico e as conquistas.
   *
   * Só de amigo — e o próprio, que é o mesmo perfil visto de fora. Saldo, itens e presentes não
   * vão: o perfil é o que a pessoa mostra, não a carteira dela.
   */
  perfilDe(quem: string, alvo: string): PerfilPublico | string {
    const accounts = this.accounts;
    if (!accounts) return 'perfis precisam de uma conta no servidor';
    if (alvo !== quem && !accounts.friends(quem).friends.some((f) => f.id === alvo)) return 'só dá para ver o perfil de amigos';
    const info = accounts.info(alvo);
    if (!info) return 'conta não encontrada';
    const conns = this.connsOf(alvo);
    return {
      id: alvo,
      code: info.code,
      online: conns.length > 0,
      playing: conns.some((c) => !!c.room),
      cartao: this.cartaoDe(alvo),
      stats: info.stats,
      play: info.play,
    };
  }

  /**
   * Chama um amigo para a sala Custom em que estou.
   *
   * Vale para quem já está sentado na sala (o anfitrião ou não), e o amigo chamado entra sem senha
   * (veja `Room.convidados`). Mesas da fila e contra bots ficam de fora: lá quem senta é o servidor.
   */
  convidarParaSala(from: Connection, alvoId: string): string | null {
    const accounts = this.accounts;
    const room = from.room;
    if (!accounts || !from.accountId) return 'convites precisam de uma conta no servidor';
    if (!room) return 'entre numa sala antes de chamar alguém';
    if (room.settings.queue || room.settings.custom === false) return 'só dá para chamar amigos para uma sala Custom';
    if (room.status === 'finished') return 'essa partida já acabou';
    if (!accounts.friends(from.accountId).friends.some((f) => f.id === alvoId)) return 'chame apenas amigos';
    if (!this.online(alvoId)) return 'esse amigo não está online agora';
    if (this.connsOf(alvoId).some((c) => c.room === room)) return 'esse amigo já está na sala';
    room.convidados.add(alvoId);
    const nome = accounts.info(from.accountId)?.name ?? from.name;
    for (const c of this.connsOf(alvoId)) c.send({ type: 'roomAsk', room: room.id, from: from.accountId, name: nome, sala: room.settings.name });
    return null;
  }

  /**
   * Pede amizade a quem está na mesma sala (na espera ou em plena partida).
   *
   * O código de amigo é o caminho de sempre; aqui ele é lido da conta do outro, porque ninguém
   * dita código no meio de uma mão. Só vale para quem está **na mesma sala**: o id de jogador de
   * alguém de fora não abre nada.
   */
  pedirAmizadeNaMesa(from: Connection, playerId: string): string | null {
    const accounts = this.accounts;
    if (!accounts || !from.accountId) return 'amizades precisam de uma conta no servidor';
    const alvo = from.room?.memberById(playerId);
    if (!alvo || alvo.isBot || !alvo.accountId) return 'esse jogador não tem conta no servidor';
    if (alvo.accountId === from.accountId) return 'essa conta é a sua';
    const code = accounts.info(alvo.accountId)?.code;
    if (!code) return 'esse jogador não tem código de amigo';
    const r = accounts.requestFriend(from.accountId, code);
    if (typeof r === 'string') return r;
    this.sendFriends(from.accountId);
    this.sendFriends(r.to);
    return null;
  }

  private broadcastParty(p: Party): void {
    const info = this.partyInfo(p);
    for (const id of p.members) for (const c of this.connsOf(id)) c.send({ type: 'party', party: info });
  }

  /** Desfaz o grupo e avisa quem estava nele. */
  private fecharGrupo(p: Party): void {
    this.parties.delete(p.id);
    for (const id of p.members) for (const c of this.connsOf(id)) c.send({ type: 'party', party: null });
  }

  /**
   * Convida um amigo para o grupo (criando o grupo, se for o caso).
   *
   * Amizade é requisito: sem isso, o convite seria a porta dos fundos para falar com estranho. E
   * quem não está online não pode ser convidado — um convite que ninguém vai ver só faz o líder
   * esperar por nada.
   */
  convidar(from: Connection, alvoId: string): string | null {
    const accounts = this.accounts;
    if (!accounts || !from.accountId) return 'grupo precisa de uma conta no servidor';
    if (alvoId === from.accountId) return 'você já está no seu grupo';
    if (!accounts.friends(from.accountId).friends.some((f) => f.id === alvoId)) return 'chame apenas amigos';
    if (!this.online(alvoId)) return 'esse amigo não está online agora';
    if (this.partyOf(alvoId)) return 'esse amigo já está num grupo';

    let p = this.partyOf(from.accountId);
    if (p && p.leader !== from.accountId) return 'apenas o líder do grupo convida';
    if (!p) {
      p = { id: 'g-' + makeId(6), leader: from.accountId, members: [from.accountId], convidados: new Set() };
      this.parties.set(p.id, p);
      this.broadcastParty(p);
    }
    if (!podeMaisNoGrupo(p.members.length + p.convidados.size)) return `o grupo cabe ${MAX_PARTY}`;
    p.convidados.add(alvoId);
    const nome = accounts.info(from.accountId)?.name ?? 'Um amigo';
    for (const c of this.connsOf(alvoId)) c.send({ type: 'partyAsk', party: p.id, from: from.accountId, name: nome });
    return null;
  }

  entrarNoGrupo(accountId: string, partyId: string): string | null {
    const p = this.parties.get(partyId);
    if (!p) return 'esse grupo já se desfez';
    if (!p.convidados.has(accountId)) return 'você não foi chamado para esse grupo';
    if (this.partyOf(accountId)) return 'saia do seu grupo antes';
    if (!podeMaisNoGrupo(p.members.length)) return `o grupo cabe ${MAX_PARTY}`;
    p.convidados.delete(accountId);
    p.members.push(accountId);
    this.broadcastParty(p);
    return null;
  }

  recusarGrupo(accountId: string, partyId: string): void {
    this.parties.get(partyId)?.convidados.delete(accountId);
  }

  /**
   * Sai do grupo. Se quem sai é o líder, o grupo se desfaz.
   *
   * Passar a liderança adiante pareceria mais gentil, mas um grupo que sobrevive a quem o juntou
   * costuma virar uma sala com duas pessoas que nem se chamaram.
   */
  deixarGrupo(accountId: string): void {
    const p = this.partyOf(accountId);
    if (!p) return;
    if (p.leader === accountId) {
      this.fecharGrupo(p);
      return;
    }
    p.members = p.members.filter((x) => x !== accountId);
    for (const c of this.connsOf(accountId)) c.send({ type: 'party', party: null });
    if (p.members.length <= 1) this.fecharGrupo(p);
    else this.broadcastParty(p);
  }

  /**
   * As conexões do grupo que podem sentar agora, o líder primeiro.
   *
   * Quem **já está numa mesa fica de fora**, e isso não é detalhe: na partida normal sair no meio
   * custa as fichas da mesa (veja `perdeAoSair` em shared/room.ts), então arrastar para cá quem
   * está jogando faria o líder torrar o dinheiro de um amigo com um clique. Ele entra na próxima.
   */
  private conexoesDoGrupo(p: Party): Connection[] {
    const fila = [p.leader, ...p.members.filter((id) => id !== p.leader)];
    return fila.map((id) => this.connsOf(id)[0]).filter((c): c is Connection => !!c && !c.room);
  }

  /**
   * O grupo vai jogar junto.
   *
   * - `bots`: a mesa contra bots, com o grupo nas cadeiras e bots no que sobrar.
   * - `queue`: uma mesa da fila, que gente de fora também pode achar — o grupo entra junto.
   * - `custom`: a mesa é criada pela tela Custom, e o grupo é puxado lá (veja `puxarGrupo`).
   *
   * Quem não conseguir pagar o buy-in fica de fora, e a partida começa sem ele: não dá para travar
   * a noite dos outros por causa de um saldo.
   */
  async jogarEmGrupo(leader: Connection, kind: PartyKind, difficulty: BotDifficulty, currency: Currency): Promise<string | null> {
    const p = this.partyOf(leader.accountId ?? '');
    if (!p) return 'você não está num grupo';
    if (p.leader !== leader.accountId) return 'apenas o líder começa a partida';
    if (kind === 'custom') return null;

    const conexoes = this.conexoesDoGrupo(p);
    if (!conexoes.includes(leader)) return 'saia da mesa em que você está antes de começar';
    const conta = leader.accountId ? this.accounts?.info(leader.accountId) : null;
    const settings =
      kind === 'bots'
        ? { ...botMatchSettings(difficulty, currency, !!conta), maxPlayers: Math.max(BOT_MATCH.bots + 1, conexoes.length) }
        : queueSettings(currency);
    const room = this.createRoom(leader, settings);
    let sentados = 0;
    for (const c of conexoes) {
      if (await c.entrarNa(room)) sentados++;
    }
    if (!sentados) {
      room.destroy();
      this.rooms.delete(room.id);
      this.roomsChanged();
      return 'ninguém do grupo conseguiu sentar';
    }
    // bots só no que sobrou: o grupo ocupa as cadeiras primeiro
    if (kind === 'bots') for (let i = sentados; i < BOT_MATCH.bots + 1; i++) room.addBot(leader.id, difficulty);
    room.start(leader.id);
    return null;
  }

  /**
   * O líder criou uma mesa Custom: o grupo vai com ele.
   *
   * É chamado logo depois de a sala nascer, e é o que faz "jogar junto em Custom" não ser um
   * terceiro caminho — a tela Custom continua sendo a mesma de sempre.
   */
  async puxarGrupo(leader: Connection, room: Room): Promise<void> {
    const p = this.partyOf(leader.accountId ?? '');
    if (!p || p.leader !== leader.accountId) return;
    for (const c of this.conexoesDoGrupo(p)) if (c !== leader) await c.entrarNa(room);
  }
}


/** Quanto a fila espera a mão acabar para um bot ceder a cadeira, antes de abrir outra mesa. */
const ESPERA_DA_VAGA = 90_000;

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
    auras: [...DEFAULT_AURAS],
    frame: DEFAULT_FRAME,
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
    // a conta guarda como está vestida: é o card do perfil quando ela estiver offline
    if (this.accountId) {
      const c = this.cosmetics;
      this.lobby.accounts?.vestir?.(this.accountId, { character: c.character.id, auras: c.auras, frame: c.frame, face: c.face, back: c.back });
    }
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
      // Conta que voltou pela chave guardada não passou pelo login com senha, e é o login com senha
      // que lia o saldo de padocoins. O saldo mora no bot e não é guardado em disco de propósito
      // (o dono dele é o bot), então depois de um reinício do servidor ele volta vazio — e com a
      // sessão de duas semanas isso podia durar duas semanas. Lê agora, sem travar a entrada: o
      // número chega logo atrás, noutro `account`.
      if (account.discord && account.pado === null) {
        void this.lobby.accounts?.refresh?.(account.id).catch(() => {
          /* bot fora do ar: a conta segue valendo, só sem o saldo */
        });
      }
      // os amigos ganham a bolinha verde, e ele ganha a lista
      this.lobby.entrou(account.id, account.name);
    }
    this.send({ type: 'rooms', rooms: this.lobby.list() });
    this.send({ type: 'fila', jogadores: this.lobby.filaJogadores() });
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
        const conta = accounts ? accounts.login(msg.account, this.profile()) : null;
        /*
         * A chave guardada é de uma conta com login e não entrou: venceu, ou foi trocada. Antes
         * isto era silencioso — o jogo abria sem conta e parecia que nível, vínculo e Discord
         * tinham sumido. Agora o cliente é avisado e volta para a tela de login.
         */
        if (!conta && msg.account?.id && accounts?.pedeSenha?.(msg.account.id)) {
          this.send({ type: 'sessaoVencida' });
          this.error('sua sessão expirou — entre de novo com a sua senha: a conta está inteira no servidor');
        }
        this.finishHello(conta);
        break;
      }
      case 'updateProfile': {
        const nomeAntes = this.name;
        this.setProfile(msg);
        this.room?.updateProfile(this);
        if (this.accountId) {
          const nomeMudou = this.name !== nomeAntes;
          if (nomeMudou) this.lobby.accounts?.rename?.(this.accountId, this.name);
          this.lobby.mudouPerfil(this.accountId, nomeMudou);
        }
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
      /**
       * Gira uma roleta. A trava `buying` é a mesma da compra: um giro por vez, porque os dois
       * mexem em dinheiro da mesma conta.
       */
      case 'spin': {
        const accounts = this.lobby.accounts;
        if (!accounts || !this.accountId) {
          this.error('a roleta precisa de uma conta no servidor');
          return;
        }
        if (this.buying) {
          this.error('espere o giro anterior terminar');
          return;
        }
        this.buying = true;
        const roulette = String(msg.roulette ?? '');
        const currency = msg.currency === 'pado' ? 'pado' : 'chips';
        void accounts
          .spin(this.accountId, roulette, currency)
          .then((res) => {
            if (this.closed) return;
            if (typeof res === 'string') {
              this.error(res);
              return;
            }
            // o prêmio é dele: os cosméticos voltam a valer, e a mesa vê na hora
            this.applyOwned(accounts.owned(this.accountId!));
            this.send({ type: 'spun', roulette, prize: res.key, dup: res.dup, refund: res.refund });
            this.room?.updateProfile(this);
          })
          .catch((err: unknown) => {
            console.error('[roleta] erro ao girar', roulette, err);
            if (!this.closed) this.error('não foi possível girar a roleta');
          })
          .finally(() => {
            this.buying = false;
          });
        break;
      }
      case 'giveGift': {
        const accounts = this.lobby.accounts;
        if (!accounts || !this.accountId) {
          this.error('dar presente precisa de uma conta no servidor');
          return;
        }
        const character = String(msg.character ?? '');
        const gift = String(msg.gift ?? '');
        const r = accounts.giveGift(this.accountId, character, gift);
        if (typeof r === 'string') {
          this.error(r);
          return;
        }
        this.send({ type: 'gifted', character, gift, points: r });
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
        this.send({ type: 'fila', jogadores: this.lobby.filaJogadores() });
        break;
      case 'createRoom': {
        if (this.room) this.leave();
        const room = this.lobby.createRoom(this, msg.settings);
        // quem cria em grupo leva o grupo: é assim que "jogar junto em Custom" acontece
        void this.sit(room, msg.settings?.password).then((ok) => {
          if (ok) void this.lobby.puxarGrupo(this, room);
        });
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
      case 'botMatch': {
        // a mesma trava da fila: dois cliques não devem virar duas mesas (nem dois buy-ins)
        if (this.queueing) return;
        this.queueing = true;
        void this.botMatch(msg.difficulty, msg.currency).finally(() => {
          this.queueing = false;
        });
        break;
      }
      case 'leaveRoom':
        this.leave();
        this.send({ type: 'rooms', rooms: this.lobby.list() });
        this.send({ type: 'fila', jogadores: this.lobby.filaJogadores() });
        break;

      // ---------------------------------------------------------------- amizades
      case 'friends':
        if (this.accountId) this.lobby.sendFriends(this.accountId);
        break;
      case 'friendAdd': {
        const accounts = this.lobby.accounts;
        if (!accounts || !this.accountId) {
          this.error('amizades precisam de uma conta no servidor');
          return;
        }
        const r = accounts.requestFriend(this.accountId, String(msg.code ?? ''));
        if (typeof r === 'string') {
          this.error(r);
          return;
        }
        // as duas listas mudaram: a dele e a de quem recebeu
        this.lobby.sendFriends(this.accountId);
        this.lobby.sendFriends(r.to);
        break;
      }
      case 'friendAccept':
      case 'friendDecline':
      case 'friendRemove': {
        const accounts = this.lobby.accounts;
        if (!accounts || !this.accountId) {
          this.error('amizades precisam de uma conta no servidor');
          return;
        }
        const outro = String(msg.id ?? '');
        const err =
          msg.type === 'friendAccept'
            ? accounts.acceptFriend(this.accountId, outro)
            : msg.type === 'friendDecline'
              ? accounts.declineFriend(this.accountId, outro)
              : accounts.removeFriend(this.accountId, outro);
        if (err) {
          this.error(err);
          return;
        }
        this.lobby.sendFriends(this.accountId);
        this.lobby.sendFriends(outro);
        break;
      }

      // ---------------------------------------------------------------- grupo
      case 'partyInvite':
        this.error(this.lobby.convidar(this, String(msg.id ?? '')));
        break;
      case 'roomInvite':
        this.error(this.lobby.convidarParaSala(this, String(msg.id ?? '')));
        break;
      case 'friendAddPlayer':
        this.error(this.lobby.pedirAmizadeNaMesa(this, String(msg.playerId ?? '')));
        break;
      case 'profileOf': {
        if (!this.accountId) return;
        const r = this.lobby.perfilDe(this.accountId, String(msg.id ?? ''));
        if (typeof r === 'string') this.error(r);
        else this.send({ type: 'perfil', perfil: r });
        break;
      }
      case 'partyAccept':
        if (this.accountId) this.error(this.lobby.entrarNoGrupo(this.accountId, String(msg.party ?? '')));
        break;
      case 'partyDecline':
        if (this.accountId) this.lobby.recusarGrupo(this.accountId, String(msg.party ?? ''));
        break;
      case 'partyLeave':
        if (this.accountId) this.lobby.deixarGrupo(this.accountId);
        break;
      case 'partyStart': {
        if (this.queueing) return;
        this.queueing = true;
        const kind: PartyKind = msg.kind === 'queue' ? 'queue' : msg.kind === 'custom' ? 'custom' : 'bots';
        const dif: BotDifficulty = DIFFICULTIES.includes(msg.difficulty as BotDifficulty) ? (msg.difficulty as BotDifficulty) : 'easy';
        const moeda: Currency = msg.currency === 'pado' ? 'pado' : 'chips';
        void this.lobby
          .jogarEmGrupo(this, kind, dif, moeda)
          .then((err) => this.error(err))
          .finally(() => {
            this.queueing = false;
          });
        break;
      }
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
  /** @internal O lobby senta o grupo inteiro por aqui (veja `jogarEmGrupo`). */
  async entrarNa(room: Room): Promise<boolean> {
    if (this.room === room) return true;
    if (this.room) this.leave();
    return this.sit(room);
  }

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
      /*
       * Mesa lotada no meio de uma mão: um bot levanta quando ela acabar, e a cadeira é desta pessoa.
       *
       * O bot só saía na hora se não estivesse jogando a mão — e no meio da mão todos estão. Era
       * assim que o quarto amigo de um grupo caía numa mesa separada: a dos outros três estava
       * lotada de bots em plena mão. Agora ele espera a mão acabar (até ESPERA_DA_VAGA) e senta.
       */
      if (room.cederCadeiraDeBot()) {
        await room.esperaVaga(ESPERA_DA_VAGA);
        if (this.closed) return;
      }
      if (await this.sit(room)) return;
      if (this.closed) return;
    }
    // nenhuma servia: abre a própria, com três bots para a mesa já ter jogo
    const room = await this.abrirEsentar(queueSettings(currency));
    if (!room) return;
    for (let i = 0; i < 3; i++) this.error(room.addBot(this.id, 'normal'));
    this.error(room.start(this.id));
  }

  /**
   * Abre uma mesa e senta nela; se a cadeira não sair, a mesa não fica.
   *
   * `createRoom` acontece antes da cobrança, então uma entrada recusada — saldo curto, mesa
   * cheia — deixava uma sala vazia para sempre no lobby, ocupando a lista e o id. Aqui ela é
   * desfeita no mesmo caminho em que nasceu.
   */
  private async abrirEsentar(settings: RoomSettings): Promise<Room | null> {
    const room = this.lobby.createRoom(this, settings);
    if (await this.sit(room)) return room;
    room.destroy();
    this.lobby.rooms.delete(room.id);
    this.lobby.roomsChanged();
    return null;
  }

  /**
   * A partida contra bots: uma mesa só, sempre a mesma, montada **aqui**.
   *
   * O cliente manda duas coisas — o degrau e a moeda — e o resto é do servidor: três oponentes,
   * Hold'em, dez rodadas, vinte e cinco segundos (veja BOT_MATCH). Antes era o cliente que
   * montava a sala e sentava os bots; assim ele podia pedir dez mil fichas no nível 1, e a trava
   * dos degraus não valeria nada.
   *
   * Sem conta no servidor não há trava nem cobrança: ali é treino, e não há o que proteger.
   */
  private async botMatch(d: unknown, c: unknown): Promise<void> {
    const difficulty: BotDifficulty = DIFFICULTIES.includes(d as BotDifficulty) ? (d as BotDifficulty) : 'easy';
    const conta = this.accountId ? this.lobby.accounts?.info(this.accountId) : null;
    const tier = botTier(difficulty);
    if (conta && !tierUnlocked(difficulty, playerLevel(conta.stats))) {
      this.error(`O degrau ${tier.label} abre no nível ${tier.level}`);
      return;
    }
    // padocoin mora no Discord: sem vínculo, a mesa é de fichas
    const currency: Currency = c === 'pado' && conta?.discord ? 'pado' : 'chips';
    if (this.room) this.leave();
    const room = await this.abrirEsentar(botMatchSettings(difficulty, currency, !!conta));
    if (!room) return;
    for (let i = 0; i < BOT_MATCH.bots; i++) this.error(room.addBot(this.id, difficulty));
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
    const conta = this.accountId;
    const nome = this.name;
    this.lobby.drop(this);
    // a ordem importa: só depois de sair da lista é que "estar online" pode ser respondido
    if (conta) this.lobby.saiu(conta, nome);
  }
}
