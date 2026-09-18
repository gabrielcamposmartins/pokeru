import type { BondEvent, BondStats } from './bond';
import type { AvatarInfo, PlayerCosmetics } from './styles';

/**
 * Contas do servidor hospedado.
 *
 * O `shared/` só descreve **o que** a sala e o lobby precisam de uma conta; quem guarda de fato é
 * o servidor (`server/accounts.ts`, em arquivo JSON). Sem serviço de contas — o modo offline, por
 * exemplo — a mesa é livre: as fichas são de brinquedo e o vínculo fica salvo só no cliente.
 */

/** O que o cliente vê da própria conta. */
export interface AccountInfo {
  id: string;
  /**
   * Chave de volta: chega na criação da conta e o cliente guarda para entrar de novo como ele
   * mesmo. Só vai para o dono da conta, nunca para os outros jogadores.
   */
  token?: string;
  name: string;
  /** Fichas guardadas (fora da mesa). */
  money: number;
  /** Fichas na mesa em que está sentado agora. */
  inPlay: number;
  /** Vínculo por personagem (id do personagem → ficha). */
  bond: Record<string, BondStats>;
  stats: { hands: number; wins: number; matches: number };
  /** Quando a conta foi criada (ISO). */
  since: string;
}

/** Credenciais que o cliente manda no `hello` para voltar à mesma conta. */
export interface AccountCreds {
  id: string;
  token: string;
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
  /** Pontos de vínculo com o personagem que a conta está usando. */
  bond(accountId: string, character: string, ev: BondEvent): void;
  /** Contadores gerais da conta. */
  note(accountId: string, what: 'hand' | 'win' | 'match'): void;
}

/** A banca mais o login — é o que o lobby recebe do servidor. */
export interface AccountService extends TableBank {
  /**
   * Entra na conta de `creds` (ou cria uma nova quando não houver/não bater). Devolve null quando
   * o servidor não aceita criar mais contas — aí o jogador só entra em mesas livres.
   */
  login(creds: AccountCreds | undefined, profile: AccountProfile): AccountInfo | null;
  /** Foto atual da conta, sem o token. */
  info(accountId: string): AccountInfo | null;
  /** Avisado quando algo da conta muda (o lobby manda a foto nova ao cliente). */
  onChange?: (accountId: string) => void;
}
