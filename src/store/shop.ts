import { useMemo } from 'react';
import { owns, ownsItem, type Currency, type ItemKind } from '../../shared/catalog';
import { useRoleta } from './roleta';
import { PRESETS, SERVER_URL, useProfile, type StyleKind, type StyleMap } from './profile';
import { useSession } from './session';

/**
 * A loja, do lado do cliente — vitrine e cadeados.
 *
 * Quem decide o que é de quem é o **servidor**: a lista vem em `account.owned` e a compra é um
 * pedido (`buy`) que ele aceita ou recusa. O que está aqui serve para desenhar: mostrar o cadeado,
 * o preço e o botão certo, e não oferecer o que a pessoa já tem.
 *
 * Fora da conexão, vale o último `owned` que vimos naquele servidor (guardado no perfil). Assim as
 * telas não abrem com tudo trancado enquanto o jogo conecta — e, se essa lembrança estiver
 * errada, o servidor corrige na primeira mensagem.
 */

/**
 * Lista vazia compartilhada.
 *
 * Um `?? []` aqui devolveria um array **novo** a cada render, e a referência nova se espalha: ela
 * entra em dependências de efeito e em seletores, onde o zustand 5 compara por identidade. Uma
 * constante resolve — e é de graça.
 */
const NENHUM: readonly string[] = Object.freeze([]);
/** Estoque vazio de presentes, pelo mesmo motivo de NENHUM. */
const SEM_PRESENTES: Readonly<Record<string, number>> = Object.freeze({});

/** Os itens da conta (chaves do catálogo). O que é grátis não está na lista, e nem precisa. */
export function useOwned(): readonly string[] {
  const live = useSession((s) => s.account?.owned);
  const cached = useProfile((s) => s.accounts[SERVER_URL]?.owned);
  return live ?? cached ?? NENHUM;
}

/**
 * Pede ao servidor uma leitura nova do saldo de padocoins.
 *
 * O saldo mora no bot do Discord: quem fala com ele é o servidor, e só quando alguém pede. Isto é
 * chamado ao abrir a loja e o perfil — as duas telas onde o número importa — e pelo botão de
 * tentar de novo. O intervalo mínimo existe para uma tela que remonta não virar enxurrada de
 * chamadas no bot.
 */
let ultimoPedido = 0;
export function pedeSaldo(force = false): void {
  const s = useSession.getState();
  if (s.status !== 'connected') return;
  const agora = Date.now();
  if (!force && agora - ultimoPedido < 10_000) return;
  ultimoPedido = agora;
  s.send({ type: 'refreshAccount' });
}

export function ownedNow(): readonly string[] {
  return useSession.getState().account?.owned ?? useProfile.getState().accounts[SERVER_URL]?.owned ?? [];
}

/**
 * Os presentes em estoque (id → quantidade).
 *
 * Contáveis, ao contrário dos itens: é o que o vínculo consome. Sem conta no servidor o estoque é
 * vazio — presentes moram na conta, como as fichas.
 */
export function useGifts(): Readonly<Record<string, number>> {
  return useSession((s) => s.account?.gifts) ?? SEM_PRESENTES;
}

/** Corações de vínculo já abertos (pelas missões) neste personagem. */
export function useBondUnlocked(character: string): number {
  return useSession((s) => s.account?.bondUnlocked?.[character] ?? 0);
}

/** Manda girar a roleta (o prêmio vem do servidor; a cena é de src/store/roleta.ts). */
export function spinRoulette(roulette: string, currency: Currency): void {
  useRoleta.getState().girar(roulette, currency);
}

/** Dá um presente a um personagem (some do estoque e vira pontos de vínculo). */
export function giveGift(character: string, gift: string): void {
  useSession.getState().send({ type: 'giveGift', character, gift });
}

/** O jogador tem este item? */
export function useOwns(kind: ItemKind, id: string): boolean {
  const owned = useOwned();
  return ownsItem(owned, kind, id);
}

export function useOwnsKey(key: string): boolean {
  return owns(useOwned(), key);
}

/**
 * Padocoins da conta. `null` quando não há Discord vinculado — e aí a moeda simplesmente não
 * aparece no jogo, em vez de aparecer zerada.
 *
 * Sem conexão vale o último valor visto naquele servidor, como acontece com as fichas: a segunda
 * moeda não deve piscar para fora da tela a cada reconexão.
 */
export function usePado(): number | null {
  const live = useSession((s) => s.account);
  const cached = useProfile((s) => s.accounts[SERVER_URL]?.pado ?? null);
  return live ? live.pado : cached;
}

/** O Discord vinculado, segundo o servidor. */
export function useDiscord() {
  return useSession((s) => s.account?.discord ?? null);
}

/** Dá para comprar? (só com conta no servidor — a loja é dele) */
export function useCanShop(): boolean {
  return useSession((s) => !!s.account);
}

/** Pede a compra ao servidor. A resposta chega como `bought` (ou um erro em aviso). */
export function buyItem(key: string, currency: Currency): void {
  useSession.getState().send({ type: 'buy', item: key, currency });
}

/**
 * Os estilos que o jogador pode usar num tipo: os presets **que ele tem** mais as criações dele.
 *
 * É o que faz a personalização trabalhar só com o que foi adquirido: o Estúdio lista isto, e uma
 * cópia só pode sair de uma peça que já está aqui.
 *
 * A junção é feita **fora** do seletor, de propósito. No zustand 5 o resultado do seletor é o
 * `getSnapshot` do `useSyncExternalStore`, comparado por identidade: montar a lista lá dentro
 * devolve um array novo a cada chamada, o React vê um estado sempre diferente e re-renderiza para
 * sempre — foi assim que o Estúdio passou a abrir com "Maximum update depth exceeded" (#185). Aqui
 * o seletor devolve a referência que já está na loja, e o `useMemo` cuida da junção.
 */
export function useMyStyles<K extends StyleKind>(kind: K): StyleMap[K][] {
  const owned = useOwned();
  const custom = useProfile((s) => s.custom[kind]) as StyleMap[K][] | undefined;
  return useMemo(() => myStyles(kind, owned, custom), [kind, owned, custom]);
}

/**
 * A lista de estilos de um tipo: os presets que o jogador tem, na ordem do catálogo, seguidos das
 * criações dele. Função pura, para poder ser testada sem React.
 *
 * Sempre sobra pelo menos um preset — o gratuito de cada tipo nunca sai da lista —, então quem
 * consome não precisa se defender de lista vazia.
 */
export function myStyles<K extends StyleKind>(kind: K, owned: readonly string[] | undefined, custom?: readonly StyleMap[K][]): StyleMap[K][] {
  const meus = (PRESETS[kind] as StyleMap[K][]).filter((p) => ownsItem(owned, kind as ItemKind, p.id));
  return custom?.length ? [...meus, ...custom] : meus;
}
