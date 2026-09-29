import { create } from 'zustand';
import type { CharacterStyle, WinFxId } from '../../shared/styles';
import { useProfile, type StyleKind } from '../store/profile';
import type { SoundSet } from '../audio/sfx';

/**
 * Aparências da interface (escolhidas no Estúdio → UI).
 *
 * Cada tema tem duas partes:
 *   - CSS: um arquivo em src/styles/ com as regras dentro de `:root[data-ui='<id>'] { … }`
 *     (o App põe o id do tema ativo em <html data-ui>). O tema "default" é o global.css puro.
 *   - Este registro: o que não dá para fazer só com CSS (textos do menu, cores desenhadas em SVG, sons).
 *
 * Para adicionar um tema: crie o CSS, importe-o em src/main.tsx e acrescente uma entrada em UI_THEMES.
 */

export interface UiTheme {
  id: string;
  name: string;
  description: string;
  /** O que o tema muda, para a lista do Estúdio. */
  features: string[];
  /** Miniatura na lista do Estúdio. */
  swatch: { bg: string; panel: string; accent: string; text: string; font: string; glyph: string };
  menu: {
    subtitle: string;
    /** Linha pequena abaixo do subtítulo. */
    motto?: string;
    /** Ornamento entre o logo e o subtítulo. */
    flourish?: string;
    icons: { characters: string; studio: string };
  };
  table: {
    /** Tachas de latão e frisos finos na borda da mesa. */
    ornate: boolean;
    consoleBg: [string, string] | 'rail';
    consoleRadius: number;
    /** Cor da luz de quem está na vez, no console. */
    turnLight: string;
  };
  /** Fundo da faixa do cut-in (all-in, mão grande). */
  cutinBand(st: CharacterStyle): string;
  sounds: SoundSet;
  /** Estilos que combinam com o tema (botão "Equipar estilos do tema"). */
  styles: Record<StyleKind, string>;
  /** Efeito das cartas vencedoras que combina com o tema. */
  winFx: WinFxId;
}

export const UI_THEMES: UiTheme[] = [
  {
    id: 'default',
    name: 'Sakura (padrão)',
    description: 'O visual original: noite roxa, dourado e rosa, com pétalas de sakura e faixas de anime.',
    features: ['Fonte arredondada', 'Painéis roxos com dourado', 'Pétalas de sakura no menu', 'Sons eletrônicos suaves'],
    swatch: { bg: '#1a1236', panel: '#302460', accent: '#f2c14e', text: '#f4efff', font: "'M PLUS Rounded 1c', sans-serif", glyph: '✿' },
    menu: {
      subtitle: 'ポケル · Texas Hold’em',
      icons: { characters: '✿', studio: '✦' },
    },
    table: { ornate: false, consoleBg: ['#2a1f4d', '#0c0819'], consoleRadius: 34, turnLight: '#6bf2c1' },
    cutinBand: (st) => `linear-gradient(90deg, ${st.bg2}, ${st.bg} 55%, ${st.bg2})`,
    sounds: 'default',
    styles: { face: 'face-classic', back: 'back-sakura', chip: 'chip-casino', table: 'table-soul' },
    winFx: 'prism',
  },
  {
    id: 'victorian',
    name: 'Vitoriano',
    description: 'Salão aristocrático do século XIX: mogno, bordô, verde-garrafa, latão e marfim à luz de velas.',
    features: [
      'Tipografia serifada (Cormorant, Cinzel, Playfair)',
      'Papel de parede adamascado e lambri de madeira',
      'Painéis de couro com cantoneiras de latão',
      'Retratos em moldura dourada e tachas na mesa',
      'Cut-in em faixa de veludo',
      'Efeito de vitória Luz Sagrada',
      'Sineta, relógio de pêndulo e cravo',
    ],
    swatch: { bg: '#4a1119', panel: '#401f15', accent: '#c9a25a', text: '#f3e9d2', font: "'Cinzel', serif", glyph: '⚜' },
    menu: {
      subtitle: 'Salão Aristocrático · Texas Hold’em',
      motto: 'Est. MDCCCLXXXVII',
      flourish: '⚜',
      icons: { characters: '♛', studio: '✒' },
    },
    table: { ornate: true, consoleBg: 'rail', consoleRadius: 16, turnLight: '#ffd27a' },
    cutinBand: (st) => `linear-gradient(90deg, #140706 0%, ${st.bg2}d9 30%, ${st.bg}99 58%, #140706 100%), #2a0c10`,
    sounds: 'victorian',
    styles: { face: 'face-victorian', back: 'back-victorian', chip: 'chip-victorian', table: 'table-victorian' },
    winFx: 'holy',
  },
  {
    id: 'retro',
    name: 'Retrofuturista',
    description: 'Synthwave e HUD de ficção científica: céu escuro, sol no horizonte, grade neon em perspectiva e monitor de tubo.',
    features: [
      'Tipografia geométrica (Orbitron e Chakra Petch)',
      'Grade em perspectiva e brilho de horizonte no fundo',
      'Cinco paletas: Synthwave, Tron, Vaporwave, Fósforo verde e Âmbar',
      'Linhas de varredura de CRT (dá para desligar)',
      'Painéis com cantoneiras de HUD e bordas de neon',
      'Cantos retos em toda a interface',
      'Efeito de vitória Relâmpago',
    ],
    swatch: { bg: '#0d0221', panel: '#1f0d45', accent: '#ff2a6d', text: '#05d9e8', font: "'Orbitron', sans-serif", glyph: '◢' },
    menu: {
      subtitle: 'ポケル · Texas Hold’em · 1985',
      motto: 'SYS.ONLINE ▮',
      icons: { characters: '◈', studio: '◧' },
    },
    // o fundo e a luz do console seguem a paleta pelo CSS (retro.css); estes são os da Synthwave
    table: { ornate: false, consoleBg: ['#1f0d45', '#0d0221'], consoleRadius: 6, turnLight: '#05d9e8' },
    cutinBand: (st) =>
      `repeating-linear-gradient(180deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 4px), linear-gradient(90deg, #0d0221 0%, ${st.bg2}cc 30%, ${st.bg}99 60%, #0d0221 100%)`,
    sounds: 'default',
    styles: { face: 'face-neon', back: 'back-midnight', chip: 'chip-neon', table: 'table-night' },
    winFx: 'lightning',
  },
];

/**
 * Paletas do tema Retrofuturista (o CSS de cada uma está em src/styles/retro.css, sob
 * `data-palette`). `colors` = [neon principal, neon complementar, fundo], para a amostra do Estúdio.
 */
export const RETRO_PALETTES: { id: string; name: string; colors: [string, string, string] }[] = [
  { id: 'synthwave', name: 'Synthwave', colors: ['#ff2a6d', '#05d9e8', '#0d0221'] },
  { id: 'tron', name: 'Tron', colors: ['#00e5ff', '#2f7bff', '#000b13'] },
  { id: 'vaporwave', name: 'Vaporwave', colors: ['#ff71ce', '#01cdfe', '#1a0b2e'] },
  { id: 'fosforo', name: 'Fósforo verde', colors: ['#33ff66', '#a6ff4d', '#010a03'] },
  { id: 'ambar', name: 'Âmbar', colors: ['#ffb000', '#ff7a00', '#0c0600'] },
];

/**
 * Põe o tema no <html>: `data-ui` escolhe a folha de estilo; `data-palette` e `data-crt` só
 * valem no Retrofuturista (paleta de cores e linhas de varredura).
 */
export function applyTheme(theme: UiTheme, prefs: { retroPalette?: string; crt?: boolean }): void {
  const root = document.documentElement;
  root.dataset.ui = theme.id;
  root.dataset.palette = RETRO_PALETTES.some((p) => p.id === prefs.retroPalette) ? prefs.retroPalette : RETRO_PALETTES[0].id;
  root.dataset.crt = prefs.crt === false ? 'off' : 'on';
}

export function findTheme(id: string | null | undefined): UiTheme {
  return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
}

/** Tema em pré-visualização no Estúdio (vale para a tela inteira até sair da aba). */
export const useThemePreview = create<{ preview: string | null; setPreview(id: string | null): void }>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));

/** Tema ativo: o da pré-visualização, se houver, senão o escolhido no perfil. */
export function useUiTheme(): UiTheme {
  const chosen = useProfile((s) => s.settings.uiTheme);
  const preview = useThemePreview((s) => s.preview);
  return findTheme(preview ?? chosen);
}
