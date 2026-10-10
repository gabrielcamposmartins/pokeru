/**
 * Pausa — as regras comuns ao poker e aos minijogos.
 *
 * Nos minijogos a pausa é de quem joga: um botão, e o relógio do nível para. Na mesa de poker ela é
 * de todos: alguém pede, **todos** os jogadores sentados precisam aceitar, e a mesa para no fim da
 * mão em andamento (veja `Room.pausa` em shared/room.ts).
 *
 * Nos dois, a pausa tem prazo: depois de `PAUSA_MAX_MS` sem jogar, o jogo recomeça mesmo pausado.
 * No minijogo a partida volta ao nível 1 (o recorde fica guardado); na mesa a partida é encerrada e
 * cada um recebe de volta as fichas que tinha na mesa. Uma pausa sem fim seria uma mesa presa — e,
 * numa mesa a dinheiro, fichas presas com ela.
 */

/** Quanto tempo sem jogar, pausado, até o jogo recomeçar: duas horas. */
export const PAUSA_MAX_MS = 2 * 60 * 60 * 1000;

/** Quanto tempo uma votação de pausa fica aberta na mesa antes de cair. */
export const PAUSA_VOTO_MS = 30_000;

/** Depois de uma votação recusada ou vencida, quanto quem pediu espera para pedir de novo. */
export const PAUSA_ESPERA_MS = 60_000;

/** O estado da pausa de uma mesa, como vai ao cliente (dentro de `RoomInfo`). */
export interface PausaInfo {
  /**
   * - `votando`: alguém pediu e a mesa está respondendo;
   * - `aguardando`: todos aceitaram, e a mesa para quando a mão em andamento acabar;
   * - `pausada`: a mesa está parada.
   */
  estado: 'votando' | 'aguardando' | 'pausada';
  /** Id (de membro) de quem pediu. */
  por: string;
  /** Nome de quem pediu. */
  nome: string;
  /** Quem já aceitou (ids de membro). */
  aceitos: string[];
  /** Quem precisa aceitar (ids de membro): os jogadores sentados, conectados e ainda na partida. */
  votantes: string[];
  /**
   * Quanto falta, em ms, no momento do envio: para a votação cair (`votando`) ou para a partida ser
   * encerrada (`pausada`). Vai em "quanto falta" e não em horário porque o relógio do cliente não
   * é o do servidor.
   */
  restaMs: number | null;
}
