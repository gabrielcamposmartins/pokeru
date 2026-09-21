import { owns, ownsItem, type Currency, type ItemKind } from '../../shared/catalog';
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

/** Os itens da conta (chaves do catálogo). O que é grátis não está na lista, e nem precisa. */
export function useOwned(): readonly string[] {
  const live = useSession((s) => s.account?.owned);
  const cached = useProfile((s) => s.accounts[SERVER_URL]?.owned);
  return live ?? cached ?? [];
}

export function ownedNow(): readonly string[] {
  return useSession.getState().account?.owned ?? useProfile.getState().accounts[SERVER_URL]?.owned ?? [];
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
 */
export function usePado(): number | null {
  return useSession((s) => s.account?.pado ?? null);
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
 */
export function useMyStyles<K extends StyleKind>(kind: K): StyleMap[K][] {
  const owned = useOwned();
  return useProfile((s) => [
    ...(PRESETS[kind] as StyleMap[K][]).filter((p) => ownsItem(owned, kind as ItemKind, p.id)),
    ...((s.custom[kind] ?? []) as StyleMap[K][]),
  ]);
}
