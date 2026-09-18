/**
 * O jogo se chamava PokerSoul, e o que estava salvo no navegador usava esse nome como chave
 * (`pokersoul-profile`, `pokersoul-bond`). Na primeira vez que o Pokeru abre, o conteúdo antigo é
 * copiado para a chave nova — ninguém perde perfil, estilos ou vínculo por causa da troca de nome.
 *
 * A cópia só acontece quando a chave nova ainda não existe, então é seguro chamar sempre, e a
 * antiga fica onde está (se alguém voltar para uma versão velha, continua achando os dados).
 */
export function migrateStorageKey(from: string, to: string): void {
  try {
    const store = globalThis.localStorage;
    if (!store) return;
    if (store.getItem(to) !== null) return;
    const old = store.getItem(from);
    if (old !== null) store.setItem(to, old);
  } catch {
    // navegador sem localStorage (ou com ele bloqueado): nada a migrar
  }
}
