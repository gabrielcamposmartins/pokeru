import type { BondEvent, BondStats } from './bond';
import type { Currency } from './catalog';
import type { AvatarInfo, PlayerCosmetics } from './styles';

/**
 * Contas do servidor hospedado.
 *
 * O `shared/` só descreve **o que** a sala e o lobby precisam de uma conta; quem guarda de fato é
 * o servidor (`server/accounts.ts`, em arquivo JSON). Sem serviço de contas — o modo offline, por
 * exemplo — a mesa é livre: as fichas são de brinquedo e o vínculo fica salvo só no cliente.
 *
 * Há dois jeitos de entrar:
 *
 *   - **com login** (`loginAuth`): o jogador entrou no serviço de contas do GBOT e o servidor
 *     recebeu um JWT já validado. A conta é a mesma em qualquer computador, e é essa que pode
 *     ter Discord vinculado (e portanto padocoins).
 *   - **sem conta** (`login`): identidade só deste aparelho, por um token que o servidor sorteia.
 *     Serve para jogar na hora, sem cadastro; as compras ficam presas a esse aparelho.
 */

/** O Discord vinculado à conta — é o que dá acesso aos padocoins. */
export interface DiscordLink {
  id: string;
  /** Nome no Discord (não é o usuário da conta do jogo). */
  username: string;
  nickname: string | null;
}

/** O que o cliente vê da própria conta. */
export interface AccountInfo {
  id: string;
  /**
   * Chave de volta desta conta: o cliente guarda e manda no `hello` para entrar de novo como ele
   * mesmo. Só vai para o dono da conta, nunca para os outros jogadores.
   *
   * Vale para os dois tipos de conta. Na conta **com login** ela é o que faz a sessão durar:
   * o JWT do serviço de contas expira em uma hora e não tem refresh, então sem isso o jogador
   * digitaria a senha a cada hora. Esta chave é nossa, dura duas semanas e é revogável — e, ao
   * contrário de guardar a senha, um vazamento dela não abre a conta do serviço.
   */
  token?: string;
  /** Quando a chave de volta expira (ISO). */
  tokenUntil?: string;
  name: string;
  /** Usuário no serviço de contas (ausente numa conta sem login). */
  user?: string;
  /** Fichas guardadas (fora da mesa). */
  money: number;
  /** Fichas na mesa em que está sentado agora. */
  inPlay: number;
  /**
   * Padocoins — a moeda da economia do bot do Discord. `null` quando a conta não tem Discord
   * vinculado, que é um estado normal: aí a segunda moeda simplesmente não aparece no jogo.
   */
  pado: number | null;
  discord: DiscordLink | null;
  /** Itens comprados (chaves do catálogo). O que já vem com o jogo não entra na lista. */
  owned: string[];
  /** Vínculo por personagem (id do personagem → ficha). */
  bond: Record<string, BondStats>;
  stats: { hands: number; wins: number; matches: number };
  /** Quando a conta foi criada (ISO). */
  since: string;
}

/** Credenciais que o cliente manda no `hello` para voltar à mesma conta sem login. */
export interface AccountCreds {
  id: string;
  token: string;
}

/**
 * Identidade vinda do serviço de contas: as claims de um JWT **já validado** pelo servidor.
 * `sub` é o id da conta no serviço — nunca o id do Discord.
 */
export interface AuthIdentity {
  sub: string;
  username: string;
  /**
   * Id do Discord **segundo as claims**. Ausente quando a conta não tem vínculo — mas também
   * quando o token foi emitido *antes* do vínculo, porque ele é assinado no login e não há
   * refresh. Por isso a ausência aqui não quer dizer "não há vínculo": quem confirma é o serviço
   * (veja `token`).
   */
  discordId?: string;
  nickname?: string;
  /**
   * O JWT como veio, para o servidor poder perguntar ao serviço de contas qual é o vínculo de
   * verdade. Sem ele, o que estiver guardado continua valendo.
   */
  token?: string;
}

/** O perfil que viaja no `hello` (nome e cosméticos ficam salvos na conta). */
export interface AccountProfile {
  name: string;
  avatar: AvatarInfo;
  cosmetics: PlayerCosmetics;
}

/** A banca da mesa: o que a sala usa para cobrar o buy-in, pagar a saída e pontuar o vínculo. */
export interface TableBank {
  /** Fichas guardadas da conta. */
  money(accountId: string): number;
  /** Cobra até `amount` e devolve quanto saiu (0 = não deu). */
  charge(accountId: string, amount: number): number;
  /** Devolve fichas à conta (saída da mesa, fim de partida). */
  credit(accountId: string, amount: number): void;
  /**
   * Cobra o buy-in numa moeda qualquer. Em padocoin o dinheiro está no bot do Discord, então é
   * ida à rede — daí ser assíncrono. `key` é a chave de idempotência: a mesma chave não cobra
   * duas vezes, o que deixa uma tentativa que deu timeout ser repetida em segurança.
   */
  chargeIn?(accountId: string, amount: number, currency: Currency, key: string): Promise<number>;
  /** Devolve numa moeda qualquer (a saída da mesa). */
  creditIn?(accountId: string, amount: number, currency: Currency, key: string): Promise<void>;
  /** Pontos de vínculo com o personagem que a conta está usando. */
  bond(accountId: string, character: string, ev: BondEvent): void;
  /** Contadores gerais da conta. */
  note(accountId: string, what: 'hand' | 'win' | 'match'): void;
}

/** A banca mais o login e a loja — é o que o lobby recebe do servidor. */
export interface AccountService extends TableBank {
  /**
   * Entra na conta de `creds` (ou cria uma nova quando não houver/não bater). Devolve null quando
   * o servidor não aceita criar mais contas — aí o jogador só entra em mesas livres.
   */
  login(creds: AccountCreds | undefined, profile: AccountProfile): AccountInfo | null;
  /**
   * Entra com uma identidade do serviço de contas (JWT já validado). É assíncrono porque busca o
   * saldo de padocoins quando há Discord vinculado.
   */
  loginAuth(identity: AuthIdentity, profile: AccountProfile): Promise<AccountInfo | null>;
  /** Foto atual da conta, sem o token. */
  info(accountId: string): AccountInfo | null;
  /** O que a conta tem (chaves do catálogo; o que é grátis não está aqui). */
  owned(accountId: string): readonly string[];
  /**
   * Compra um item do catálogo. Devolve a mensagem de erro, ou null quando a compra saiu.
   * Quem valida preço, saldo e posse é aqui — o cliente só desenha a vitrine.
   */
  buy(accountId: string, key: string, currency: Currency): Promise<string | null>;
  /**
   * Relê o que vive fora do servidor (o saldo de padocoins, que é do bot do Discord) e avisa se
   * mudou. Opcional: um serviço que não fala com ninguém de fora não precisa disso.
   */
  refresh?(accountId: string): Promise<void>;
  /** Avisado quando algo da conta muda (o lobby manda a foto nova ao cliente). */
  onChange?: (accountId: string) => void;
}
