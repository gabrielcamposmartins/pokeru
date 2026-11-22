/**
 * A ponte entre o diretor de animações (src/game/director.ts) e a mesa 3D.
 *
 * O diretor encena cada evento da partida; na mesa 2D ele punha cartas e fichas voando em camadas
 * de HTML. Na 3D quem encena o que é objeto (fichas, cartas fechadas, os personagens) é a cena 3D:
 * ela se registra aqui ao abrir, e o diretor, achando um palco, pede a ele o gesto em vez do voo.
 * Cada pedido devolve uma promessa que se cumpre quando o gesto chega ao ponto em que o estado da
 * mesa deve mudar (as fichas pousaram, a carta chegou) — é o mesmo contrato dos voos 2D.
 *
 * Este arquivo é leve de propósito (nada de three.js): o diretor o importa no pacote principal.
 */

import type { Card } from '../../shared/cards';

export interface Palco3D {
  /** Fichas da pilha do jogador para a aposta (o personagem as coloca na mesa). */
  apostar(seat: number, valor: number, allin?: boolean): Promise<void>;
  /** Fichas da aposta de volta para a pilha do jogador (o que sobrou de uma aposta não paga). */
  devolver(seat: number, valor: number): Promise<void>;
  /**
   * "Passo": o personagem bate na mesa. `aoBater` avisa a cada batida da mão (é quando o som toca);
   * devolve false se o gesto não vai tocar (sem o personagem, ou ocupado com outro gesto).
   */
  bater(seat: number, aoBater?: () => void): boolean;
  /** Os jogadores olham as cartas que acabaram de receber. */
  olharCartas(seats: number[]): void;
  /**
   * O dealer reparte as cartas da mão, uma a uma, com as mãos: cada carta sai do baralho que ele
   * segura, voa e pousa fechada na frente de quem a recebe. `aoSair(k)` avisa quando a carta `k` sai
   * da mão dele e `aoChegar(k)`, quando pousa — é aí que o estado da mesa passa a contá-la (e que a
   * carta 2D de quem joga aparece). A promessa se cumpre quando a última pousa.
   */
  darCartas(cartas: { seat: number; i: number; n: number }[], aoChegar: (k: number) => void, aoSair?: (k: number) => void): Promise<void>;
  /** A mão acabou (ou não há mais cartas a dar): quem está com o baralho na mão o pousa de volta na mesa. */
  largarBaralho(): Promise<void>;
  /**
   * O showdown: o personagem vira as duas cartas dele, que pousam abertas na frente dele. A promessa
   * se cumpre quando elas pousam — é aí que o estado da mesa passa a tê-las abertas (e as 2D tomam
   * o lugar das 3D).
   */
  virarCartas(seat: number, cartas: Card[]): Promise<void>;
  /**
   * O dealer abre cartas na mesa (o flop, o turn, o river): cada uma sai do baralho, vira no ar e
   * pousa aberta no lugar dela, depois das `jaNaMesa` que já estão lá. `aoChegar(k)` avisa quando a
   * carta `k` pousa: é aí que a carta 2D toma o lugar da 3D.
   */
  abrirMesa(cartas: Card[], jaNaMesa: number, aoChegar: (k: number) => void): Promise<void>;
  /** As cartas fechadas de um jogador vão para o descarte (desistiu). `aoLancar` avisa quando elas saem da mão dele (é quando o som toca). */
  desistir(seat: number, quantas: number, aoLancar?: () => void): Promise<void>;
  /**
   * As cartas fechadas destes jogadores começam a brilhar (com a cor do efeito de vitória de cada um):
   * são as de quem ganhou, antes de ele as virar. O brilho acompanha a virada e some quando as cartas
   * abertas 2D (com o efeito inteiro) tomam o lugar.
   */
  brilhar(quem: { seat: number; cor: string }[]): void;
  /** Poker de 5 cartas: as cartas `indices` de um jogador vão para o descarte, fechadas. */
  descartar(seat: number, indices: number[], n: number): Promise<void>;
  /** As cartas fechadas da mão anterior voltam para o baralho do novo dealer. */
  recolherCartas(paraSeat: number | null, cartas: { seat: number; n: number }[]): Promise<void>;
  /** As apostas da rua vão para o pote. */
  recolherApostas(apostas: { seat: number; valor: number }[]): Promise<void>;
  /**
   * O pote (ou parte dele) vai para um vencedor: pousa na frente dele, e ele o puxa para junto da
   * pilha com uma mão enquanto comemora com a outra. A promessa se cumpre quando ele o larga.
   */
  pagar(seat: number, valor: number): Promise<void>;
  /**
   * A aposta de um acessório (shared/aposta.ts): o personagem tira a peça da mão e a pousa na mesa, na
   * frente dele. `aoTirar` avisa no instante em que ela sai da mão — é quando o estado da mesa deixa de
   * tê-la no personagem. A promessa se cumpre quando ela pousa.
   */
  apostarItem(seat: number, id: string, aoTirar: () => void): Promise<void>;
  /** Ninguém pagou a aposta: a peça volta da mesa para a mão do dono. */
  devolverItem(seat: number, id: string): Promise<void>;
  /** As peças apostadas nesta rua vão para junto do pote, com as fichas. */
  recolherItens(): Promise<void>;
  /** As peças do pote vão para quem as ganhou (`seat` é o dono; `para`, quem ficou com ela). */
  entregarItens(itens: { seat: number; id: string; para: number }[]): Promise<void>;
}

let atual: Palco3D | null = null;

/** O palco 3D aberto agora (null: a mesa é a 2D, ou ainda não abriu). */
export function palco3d(): Palco3D | null {
  return atual;
}

/** A cena 3D se registra ao abrir e sai ao fechar (só sai quem entrou: duas montagens do StrictMode não se atropelam). */
export function registrarPalco(p: Palco3D | null, dono?: Palco3D): void {
  if (p) atual = p;
  else if (!dono || atual === dono) atual = null;
}
