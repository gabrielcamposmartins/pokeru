import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateStorageKey } from '../util/storage';
import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  CHIP_PRESETS,
  DEFAULT_WIN_FX,
  FACE_PRESETS,
  TABLE_PRESETS,
  findCharacter,
  sanitizeBack,
  sanitizeChip,
  sanitizeFace,
  sanitizeTable,
  sanitizeWinFx,
  type AvatarInfo,
  type CardBackStyle,
  type CardFaceStyle,
  type CharacterStyle,
  type ChipStyle,
  type PlayerCosmetics,
  type TableStyle,
  type WinFxId,
} from '../../shared/styles';

export type StyleKind = 'face' | 'back' | 'chip' | 'table';

export interface StyleMap {
  face: CardFaceStyle;
  back: CardBackStyle;
  chip: ChipStyle;
  table: TableStyle;
}

export const PRESETS: { [K in StyleKind]: StyleMap[K][] } = {
  face: FACE_PRESETS,
  back: BACK_PRESETS,
  chip: CHIP_PRESETS,
  table: TABLE_PRESETS,
};

export const SANITIZE: { [K in StyleKind]: (v: unknown) => StyleMap[K] } = {
  face: sanitizeFace,
  back: (v) => sanitizeBack(v, true),
  chip: sanitizeChip,
  table: sanitizeTable,
};

export const KIND_LABEL: Record<StyleKind, string> = {
  face: 'Frente das Cartas',
  back: 'Verso das Cartas',
  chip: 'Fichas',
  table: 'Mesa',
};

export interface Settings {
  volume: number;
  muted: boolean;
  /** Vozes dos personagens (falas gravadas) durante a partida. */
  voices: boolean;
  voiceVolume: number;
  animSpeed: number;
  handHint: boolean;
  autoMuck: boolean;
  /** Aparência da interface (id em src/ui/themes.ts). */
  uiTheme: string;
  /** App desktop: procurar e instalar a versão nova ao abrir. */
  autoUpdate: boolean;
}

/** Credenciais de uma conta num servidor (o token volta a entrar como o mesmo jogador). */
export interface ServerAccount {
  id: string;
  token: string;
  /** Último saldo visto — o menu mostra isso antes de conectar, para não abrir zerado. */
  money?: number;
  /**
   * Últimos itens vistos (chaves do catálogo). Serve para as telas não abrirem com tudo
   * trancado enquanto a conexão não veio; quem manda de verdade é sempre o servidor.
   */
  owned?: string[];
}

interface ProfileState {
  name: string;
  avatar: AvatarInfo;
  /** Id do personagem escolhido. */
  character: string;
  /** Id do efeito das cartas quando você ganha (catálogo em src/render/cardfx.tsx). */
  winFx: WinFxId;
  custom: { [K in StyleKind]: StyleMap[K][] };
  equipped: Record<StyleKind, string>;
  /** Conta em cada servidor (endereço → credenciais), para voltar com o mesmo saldo e vínculo. */
  accounts: Record<string, ServerAccount>;
  settings: Settings;
  setName(name: string): void;
  setAvatar(a: AvatarInfo): void;
  setCharacter(id: string): void;
  setWinFx(id: WinFxId): void;
  setAccount(server: string, account: ServerAccount): void;
  equip(kind: StyleKind, id: string): void;
  saveStyle<K extends StyleKind>(kind: K, style: StyleMap[K]): void;
  deleteStyle(kind: StyleKind, id: string): void;
  updateSettings(p: Partial<Settings>): void;
  resetAll(): void;
}

/**
 * Servidor oficial do Pokeru: o IP fixo da VM.
 *
 * O jogador **não escolhe** endereço: o jogo fala sempre com o servidor oficial, e o que ele
 * escolhe é a *sala* (veja a lista de salas no lobby). Quem hospeda um servidor próprio aponta o
 * app na hora de montá-lo, não em tempo de uso:
 *
 *   - `config.js` servido pelo servidor web do cliente (POKERU_SERVER_URL no Docker);
 *   - `VITE_SERVER_URL=ws://localhost:3001` no build (é como se desenvolve contra um servidor local).
 */
export const DEFAULT_SERVER_URL = 'ws://35.209.186.9:3001';

/** O endereço que este app usa — decidido no build/hospedagem, nunca digitado pelo jogador. */
export const SERVER_URL: string =
  (globalThis as { PokeruConfig?: { serverUrl?: string } }).PokeruConfig?.serverUrl ||
  import.meta.env?.VITE_SERVER_URL ||
  DEFAULT_SERVER_URL;

const initial = {
  name: 'Jogador',
  avatar: { color: '#ff6b9a', icon: '♠' },
  character: CHARACTER_PRESETS[0].id,
  winFx: DEFAULT_WIN_FX,
  custom: { face: [], back: [], chip: [], table: [] },
  accounts: {} as Record<string, ServerAccount>,
  equipped: {
    face: FACE_PRESETS[0].id,
    back: BACK_PRESETS[1].id,
    chip: CHIP_PRESETS[0].id,
    table: TABLE_PRESETS[1].id,
  },
  settings: {
    volume: 0.7,
    muted: false,
    voices: true,
    voiceVolume: 1,
    animSpeed: 1,
    handHint: true,
    autoMuck: true,
    uiTheme: 'default',
    autoUpdate: true,
  },
};

/** O que foi salvo por cima do padrão, só com as chaves que ainda existem (descarta as antigas, como os braços). */
function known<T extends object>(base: T, saved: unknown): T {
  const entries = Object.entries((saved ?? {}) as Record<string, unknown>).filter(([k]) => k in base);
  return { ...base, ...Object.fromEntries(entries) } as T;
}

// o nome mudou (PokerSoul → Pokeru): traz o que já estava salvo
migrateStorageKey('pokersoul-profile', 'pokeru-profile');

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...initial,
      setName: (name) => set({ name: name.slice(0, 16) }),
      setAvatar: (avatar) => set({ avatar }),
      setCharacter: (character) => set({ character }),
      setWinFx: (winFx) => set({ winFx }),
      setAccount: (server, account) => set((s) => ({ accounts: { ...s.accounts, [server]: account } })),
      equip: (kind, id) => set((s) => ({ equipped: { ...s.equipped, [kind]: id } })),
      saveStyle: (kind, style) =>
        set((s) => {
          const list = s.custom[kind] as StyleMap[typeof kind][];
          const idx = list.findIndex((x) => x.id === style.id);
          const next = idx >= 0 ? list.map((x, i) => (i === idx ? style : x)) : [...list, style];
          return { custom: { ...s.custom, [kind]: next } };
        }),
      deleteStyle: (kind, id) =>
        set((s) => {
          const list = (s.custom[kind] as { id: string }[]).filter((x) => x.id !== id);
          const equipped = s.equipped[kind] === id ? { ...s.equipped, [kind]: PRESETS[kind][0].id } : s.equipped;
          return { custom: { ...s.custom, [kind]: list }, equipped };
        }),
      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: 'pokeru-profile',
      version: 2,
      // v2 só acrescentou settings.uiTheme, que o merge preenche com o padrão
      migrate: (persisted) => persisted as ProfileState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProfileState>;
        return {
          ...current,
          ...p,
          accounts: { ...current.accounts, ...(p.accounts ?? {}) },
          custom: known(current.custom, p.custom),
          equipped: known(current.equipped, p.equipped),
          settings: known(current.settings, p.settings),
        };
      },
    },
  ),
);

type ProfileSnapshot = Pick<ProfileState, 'custom' | 'equipped'>;

export function allStyles<K extends StyleKind>(s: ProfileSnapshot, kind: K): StyleMap[K][] {
  return [...(PRESETS[kind] as StyleMap[K][]), ...((s.custom[kind] ?? []) as StyleMap[K][])];
}

export function findStyle<K extends StyleKind>(s: ProfileSnapshot, kind: K, id: string): StyleMap[K] {
  return (
    (PRESETS[kind] as StyleMap[K][]).find((x) => x.id === id) ??
    ((s.custom[kind] ?? []) as StyleMap[K][]).find((x) => x.id === id) ??
    PRESETS[kind][0]
  );
}

export function useEquipped<K extends StyleKind>(kind: K): StyleMap[K] {
  return useProfile((s) => findStyle(s, kind, s.equipped[kind]));
}

/** Personagem escolhido pelo jogador. */
export function useCharacter(): CharacterStyle {
  return findCharacter(useProfile((s) => s.character));
}

export function isPreset(kind: StyleKind, id: string): boolean {
  return (PRESETS[kind] as { id: string }[]).some((x) => x.id === id);
}

/** Cosméticos que vão para a rede. */
export function myCosmetics(): PlayerCosmetics {
  const s = useProfile.getState();
  return {
    back: sanitizeBack(findStyle(s, 'back', s.equipped.back), false),
    character: findCharacter(s.character),
    winFx: sanitizeWinFx(s.winFx),
  };
}
