import { create } from 'zustand';

/**
 * A subida de nível esperando para ser mostrada (a cena está em src/game/NivelNovo.tsx).
 *
 * Mora fora da cena para a sessão poder avisar sem importar componente nenhum: quem descobre a
 * subida é o `account` que chega do servidor, comparado com o anterior.
 */
interface NivelState {
  /** A subida esperando para ser mostrada: de que nível para qual. */
  pendente: { de: number; para: number } | null;
  /** Soma uma subida (duas no mesmo intervalo viram uma só, do primeiro ao último nível). */
  subiu(de: number, para: number): void;
  fechar(): void;
}

export const useNivelNovo = create<NivelState>((set) => ({
  pendente: null,
  subiu: (de, para) => set((s) => ({ pendente: { de: s.pendente ? Math.min(s.pendente.de, de) : de, para: s.pendente ? Math.max(s.pendente.para, para) : para } })),
  fechar: () => set({ pendente: null }),
}));

/** A sessão viu o nível da conta subir. */
export function nivelSubiu(de: number, para: number): void {
  if (para > de) useNivelNovo.getState().subiu(de, para);
}
