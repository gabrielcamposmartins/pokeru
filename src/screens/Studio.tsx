import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Card } from '../../shared/cards';
import {
  BACK_PATTERNS,
  CHIP_VALUES,
  DEFAULT_WIN_FX,
  EMBLEMS,
  FONT_KEYS,
  TABLE_PATTERNS,
  AURA_SLOT,
  DEFAULT_AURA,
  tirarAura,
  vestirAura,
  type AuraId,
  type BackPattern,
  type CardBackStyle,
  type CardFaceStyle,
  type ChipStyle,
  type Emblem,
  type TablePattern,
  type TableStyle,
  type WinFxId,
} from '../../shared/styles';
import { KIND_LABEL, PRESETS, SANITIZE, findStyle, isPreset, useCharacter, useProfile, type StyleKind, type StyleMap } from '../store/profile';
import { pecasDaConta, useMyStyles, useOwned, useOwns, usePecas } from '../store/shop';
import { CAMPOS_DE_ESCOLHA, ehCor, encaixar, liberado, type Componentes } from '../../shared/componentes';
import { itemKey, ownsItem, padoPrice, priceOf } from '../../shared/catalog';
import { useSession } from '../store/session';
import { CardBackSvg, CardFaceSvg, CardView, FONT_FAMILY, FONT_LABEL } from '../render/CardArt';
import { ChipSvg } from '../render/Chip';
import { BackPreview, ChipPreview, FacePreview, TablePreview, ThemeSample } from '../render/StylePreview';
import { ScreenHeader, Section, Segmented, Slider, Toggle } from '../ui/controls';
import { parseJsonc } from '../../shared/jsonc';
import { sfx, type FxSound } from '../audio/sfx';
import { CardWinFx, WIN_FX, findWinFx, type FxFrame } from '../render/cardfx';
import { AURAS, AuraAmostra, CharacterAura, SLOT_LABEL, findAura } from '../render/aura';
import { FRAMES, PortraitFrame, findFrame } from '../render/PortraitFrame';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { UI_THEMES, findTheme, useThemePreview, type UiTheme } from '../ui/themes';

// ------------------------------------------------------------------ util

function newId(): string {
  return 'custom-' + Math.random().toString(36).slice(2, 10);
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** As peças liberadas do tipo que está sendo editado (veja shared/componentes.ts). */
const PecasCtx = createContext<Componentes>({ cores: [], opcoes: {} });

/** As escolhas liberadas de um campo, na ordem de sempre. */
function useLiberadas<T extends string>(campo: string, todas: readonly T[]): T[] {
  const comp = useContext(PecasCtx);
  return todas.filter((v) => liberado(comp, campo, v));
}

/**
 * Uma cor do editor: só as cores dos estilos que a conta tem.
 *
 * No lugar do seletor livre, uma amostra que abre a paleta. A cor atual aparece mesmo que não
 * esteja na paleta (um estilo feito antes da trava), para ninguém perder o que já tinha — mas
 * trocar, só por uma cor liberada.
 */
function CorLiberada({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const comp = useContext(PecasCtx);
  const [aberta, setAberta] = useState(false);
  const atual = value.toLowerCase();
  const paleta = comp.cores.includes(atual) ? comp.cores : [atual, ...comp.cores];
  return (
    <div
      className="cor-lib"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberta(false);
      }}
    >
      <button type="button" className="cor-lib-botao" onClick={() => setAberta((v) => !v)} aria-expanded={aberta}>
        <i style={{ background: value }} />
        <span>{label}</span>
      </button>
      {aberta && (
        <div className="cor-lib-paleta" role="listbox" aria-label={label}>
          {paleta.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c === atual}
              className={c === atual ? 'on' : ''}
              style={{ background: c }}
              title={c}
              onClick={() => {
                onChange(c);
                setAberta(false);
              }}
            />
          ))}
          <small className="cor-lib-dica">Só as cores dos estilos que você tem. Estilo novo, cores novas.</small>
        </div>
      )}
    </div>
  );
}

/**
 * Uma variação aleatória feita **só com peças da conta**.
 *
 * Sorteia dois estilos que a pessoa tem e, campo a campo, pega a cor (ou a escolha) de um ou de
 * outro. O resultado é novo, mas cada peça dele saiu de algo que ela ganhou — o sorteio antigo
 * inventava cores, e aí o Aleatório virava a porta dos fundos da roleta.
 */
function aleatorio<T extends object>(kind: StyleKind, st: T, estilos: readonly object[], comp: Componentes): T {
  if (!estilos.length) return st;
  const a = pick(estilos);
  const b = pick(estilos);
  const mistura = (atual: unknown, x: unknown, y: unknown): unknown => {
    if (ehCor(atual)) {
      const escolhido = Math.random() < 0.5 ? x : y;
      return ehCor(escolhido) ? escolhido : ehCor(x) ? x : ehCor(y) ? y : pick(comp.cores);
    }
    if (Array.isArray(atual)) return atual.map((v, i) => mistura(v, (x as unknown[] | undefined)?.[i], (y as unknown[] | undefined)?.[i]));
    if (atual && typeof atual === 'object') {
      return Object.fromEntries(
        Object.entries(atual).map(([k, v]) => [k, mistura(v, (x as Record<string, unknown> | undefined)?.[k], (y as Record<string, unknown> | undefined)?.[k])]),
      );
    }
    return atual;
  };
  const out = mistura(st, a, b) as Record<string, unknown>;
  for (const campo of CAMPOS_DE_ESCOLHA[kind]) {
    const ok = comp.opcoes[campo] ?? [];
    if (ok.length) out[campo] = pick(ok);
  }
  return encaixar(kind, out as T, comp);
}

async function loadImage(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = 500;
  c.height = 700;
  const ctx = c.getContext('2d')!;
  const s = Math.max(c.width / img.width, c.height / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}

// ------------------------------------------------------------------ miniaturas

const SAMPLE: Card = { r: 14, s: 'h' };

function Thumb({ kind, st }: { kind: StyleKind; st: StyleMap[StyleKind] }) {
  switch (kind) {
    case 'face':
      return <CardFaceSvg card={SAMPLE} style={st as CardFaceStyle} width={38} />;
    case 'back':
      return <CardBackSvg style={st as CardBackStyle} width={38} />;
    case 'chip':
      return <ChipSvg value={100} size={44} style={st as ChipStyle} />;
    case 'table': {
      const t = st as TableStyle;
      return (
        <svg viewBox="0 0 60 40" width={56} height={38}>
          <ellipse cx={30} cy={20} rx={28} ry={18} fill={t.rail} />
          <ellipse cx={30} cy={20} rx={24} ry={14.5} fill={t.felt} stroke={t.railAccent} strokeWidth={1.4} />
          <ellipse cx={30} cy={18} rx={12} ry={7} fill={t.feltLight} opacity={0.6} />
        </svg>
      );
    }
  }
}

// ------------------------------------------------------------------ editores

type Setter<T> = (patch: Partial<T>) => void;

function OptGrid<T extends string>({ value, options, onChange, render }: { value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => React.ReactNode }) {
  return (
    <div className="opt-grid">
      {options.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)} type="button">
          {render(o)}
        </button>
      ))}
    </div>
  );
}

/** As duas combinações clássicas de naipes — só aparecem quando as cores delas estão liberadas. */
const NAIPES_DUAS = { s: '#1b1b24', h: '#d0243b', d: '#d0243b', c: '#1b1b24' };
const NAIPES_QUATRO = { s: '#1d1f27', h: '#e0263e', d: '#1f6fe0', c: '#1c9a4c' };

const MOLDURAS_DA_FRENTE = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'line', label: 'Linha' },
  { value: 'double', label: 'Dupla' },
  { value: 'ornate', label: 'Ornada' },
] as const;
const CENTROS = [
  { value: 'pips', label: 'Tradicional' },
  { value: 'big', label: 'Naipe grande' },
  { value: 'minimal', label: 'Minimalista' },
] as const;
const FIGURAS = [
  { value: 'crest', label: 'Brasão' },
  { value: 'letter', label: 'Letra grande' },
] as const;

function FaceEditor({ st, set }: { st: CardFaceStyle; set: Setter<CardFaceStyle> }) {
  const sc = (k: keyof CardFaceStyle['suitColors'], v: string) => set({ suitColors: { ...st.suitColors, [k]: v } });
  const comp = useContext(PecasCtx);
  const temCores = (n: Record<string, string>) => Object.values(n).every((c) => comp.cores.includes(c));
  const molduras: string[] = useLiberadas('frame', MOLDURAS_DA_FRENTE.map((m) => m.value));
  const centros: string[] = useLiberadas('center', CENTROS.map((m) => m.value));
  const figuras: string[] = useLiberadas('court', FIGURAS.map((m) => m.value));
  const fontes = useLiberadas('font', FONT_KEYS);
  return (
    <>
      <Section title="Cores do papel">
        <div className="color-grid">
          <CorLiberada label="Fundo" value={st.bg} onChange={(v) => set({ bg: v })} />
          <CorLiberada label="Degradê" value={st.bgGradient} onChange={(v) => set({ bgGradient: v })} />
          <CorLiberada label="Borda" value={st.border} onChange={(v) => set({ border: v })} />
          <CorLiberada label="Moldura" value={st.frameColor} onChange={(v) => set({ frameColor: v })} />
        </div>
      </Section>
      <Section title="Naipes">
        <div className="color-grid">
          <CorLiberada label="♠ Espadas" value={st.suitColors.s} onChange={(v) => sc('s', v)} />
          <CorLiberada label="♥ Copas" value={st.suitColors.h} onChange={(v) => sc('h', v)} />
          <CorLiberada label="♦ Ouros" value={st.suitColors.d} onChange={(v) => sc('d', v)} />
          <CorLiberada label="♣ Paus" value={st.suitColors.c} onChange={(v) => sc('c', v)} />
        </div>
        <div className="row gap">
          {temCores(NAIPES_DUAS) && (
            <button className="btn btn-ghost small" onClick={() => set({ suitColors: NAIPES_DUAS })}>
              Duas cores
            </button>
          )}
          {temCores(NAIPES_QUATRO) && (
            <button className="btn btn-ghost small" onClick={() => set({ suitColors: NAIPES_QUATRO })}>
              Quatro cores
            </button>
          )}
        </div>
      </Section>
      <Section title="Formato">
        <Slider label="Espessura da borda" value={st.borderWidth} min={0} max={14} onChange={(v) => set({ borderWidth: v })} />
        <Slider label="Arredondamento" value={st.radius} min={0} max={40} onChange={(v) => set({ radius: v })} />
        <Segmented
          label="Moldura"
          value={st.frame}
          onChange={(v) => set({ frame: v })}
          options={MOLDURAS_DA_FRENTE.filter((m) => molduras.includes(m.value))}
        />
      </Section>
      <Section title="Tipografia">
        <Segmented
          value={st.font}
          onChange={(v) => set({ font: v })}
          options={fontes.map((f) => ({ value: f, label: <span style={{ fontFamily: FONT_FAMILY[f] }}>{FONT_LABEL[f]}</span> }))}
        />
        <Slider label="Tamanho do índice" value={st.indexScale} min={0.8} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ indexScale: v })} />
      </Section>
      <Section title="Centro e figuras">
        <Segmented
          label="Centro"
          value={st.center}
          onChange={(v) => set({ center: v })}
          options={CENTROS.filter((m) => centros.includes(m.value))}
        />
        <Segmented
          label="Figuras (J, Q, K)"
          value={st.court}
          onChange={(v) => set({ court: v })}
          options={FIGURAS.filter((m) => figuras.includes(m.value))}
        />
        <div className="color-grid">
          <CorLiberada label="Figura" value={st.courtColor} onChange={(v) => set({ courtColor: v })} />
          <CorLiberada label="Detalhe" value={st.courtAccent} onChange={(v) => set({ courtAccent: v })} />
        </div>
      </Section>
    </>
  );
}

const EMBLEM_ICON: Record<Emblem, string> = {
  none: '∅',
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
  star: '★',
  moon: '☾',
  crown: '♛',
  flower: '❀',
  fleur: '⚜',
  text: 'Aa',
};

const PATTERN_LABEL: Record<BackPattern, string> = {
  solid: 'Liso',
  stripes: 'Listras',
  diamonds: 'Losangos',
  dots: 'Bolinhas',
  checker: 'Xadrez',
  waves: 'Ondas',
  lattice: 'Treliça',
  stars: 'Estrelas',
  sakura: 'Sakura',
  scales: 'Escamas',
  damask: 'Damasco',
};

function BackEditor({ st, set }: { st: CardBackStyle; set: Setter<CardBackStyle> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const padroes = useLiberadas('pattern', BACK_PATTERNS);
  const emblemas = useLiberadas('emblem', EMBLEMS);
  const toast = useSession((s) => s.toast);
  return (
    <>
      <Section title="Base">
        <div className="color-grid">
          <CorLiberada label="Cor 1" value={st.base} onChange={(v) => set({ base: v })} />
          <CorLiberada label="Cor 2" value={st.base2} onChange={(v) => set({ base2: v })} />
        </div>
      </Section>
      <Section title="Padrão">
        <OptGrid
          value={st.pattern}
          options={padroes}
          onChange={(v) => set({ pattern: v })}
          render={(p) => (
            <span className="pattern-opt">
              <CardBackSvg style={{ ...st, pattern: p, emblem: 'none', image: undefined, patternOpacity: Math.max(0.5, st.patternOpacity) }} width={30} />
              <small>{PATTERN_LABEL[p]}</small>
            </span>
          )}
        />
        <CorLiberada label="Cor do padrão" value={st.patternColor} onChange={(v) => set({ patternColor: v })} />
        <Slider label="Escala" value={st.patternScale} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => set({ patternScale: v })} />
        <Slider label="Opacidade" value={st.patternOpacity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ patternOpacity: v })} />
      </Section>
      <Section title="Borda">
        <div className="color-grid">
          <CorLiberada label="Borda" value={st.border} onChange={(v) => set({ border: v })} />
          <CorLiberada label="Filete" value={st.frame} onChange={(v) => set({ frame: v })} />
        </div>
        <Slider label="Largura da borda" value={st.borderWidth} min={0} max={24} onChange={(v) => set({ borderWidth: v })} />
        <Slider label="Arredondamento" value={st.radius} min={0} max={40} onChange={(v) => set({ radius: v })} />
      </Section>
      <Section title="Emblema">
        <OptGrid value={st.emblem} options={emblemas} onChange={(v) => set({ emblem: v })} render={(e) => <span className="emblem-opt">{EMBLEM_ICON[e]}</span>} />
        {st.emblem === 'text' && (
          <input className="input" maxLength={3} value={st.emblemText} onChange={(e) => set({ emblemText: e.target.value })} placeholder="Até 3 letras" />
        )}
        <div className="color-grid">
          <CorLiberada label="Símbolo" value={st.emblemColor} onChange={(v) => set({ emblemColor: v })} />
          <CorLiberada label="Fundo" value={st.emblemBg} onChange={(v) => set({ emblemBg: v })} />
        </div>
      </Section>
      <Section title="Imagem personalizada">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              set({ image: await loadImage(f) });
            } catch {
              toast('Não foi possível carregar a imagem', 'error');
            }
          }}
        />
        <div className="row gap">
          <button className="btn btn-pink small" onClick={() => fileRef.current?.click()}>
            🖼 Enviar imagem
          </button>
          {st.image && (
            <button className="btn btn-ghost small" onClick={() => set({ image: undefined })}>
              Remover
            </button>
          )}
        </div>
        {st.image && <Slider label="Opacidade da imagem" value={st.imageOpacity} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ imageOpacity: v })} />}
        <p className="field-hint">A imagem fica só no seu computador: na rede, os outros jogadores veem seu verso sem ela.</p>
      </Section>
    </>
  );
}

const BORDAS_DA_FICHA = [
  { value: 'blocks', label: 'Blocos' },
  { value: 'stripes', label: 'Listras' },
  { value: 'dots', label: 'Pontos' },
  { value: 'none', label: 'Lisa' },
] as const;
const CENTROS_DA_FICHA = [
  { value: 'ring', label: 'Anel' },
  { value: 'dashed', label: 'Tracejado' },
  { value: 'solid', label: 'Sólido' },
] as const;

function ChipEditor({ st, set }: { st: ChipStyle; set: Setter<ChipStyle> }) {
  const [tier, setTier] = useState(0);
  const bordas: string[] = useLiberadas('edgePattern', BORDAS_DA_FICHA.map((m) => m.value));
  const centros: string[] = useLiberadas('inlay', CENTROS_DA_FICHA.map((m) => m.value));
  const t = st.tiers[tier];
  const setTierColor = (patch: Partial<ChipStyle['tiers'][number]>) => set({ tiers: st.tiers.map((x, i) => (i === tier ? { ...x, ...patch } : x)) });
  return (
    <>
      <Section title="Escolha a ficha">
        <div className="tier-row">
          {CHIP_VALUES.map((v, i) => (
            <button key={v} className={i === tier ? 'on' : ''} onClick={() => setTier(i)}>
              <ChipSvg value={v} size={32} style={st} />
            </button>
          ))}
        </div>
      </Section>
      <Section title={`Cores da ficha de ${CHIP_VALUES[tier].toLocaleString('pt-BR')}`}>
        <div className="color-grid">
          <CorLiberada label="Base" value={t.base} onChange={(v) => setTierColor({ base: v })} />
          <CorLiberada label="Borda" value={t.edge} onChange={(v) => setTierColor({ edge: v })} />
          <CorLiberada label="Valor" value={t.text} onChange={(v) => setTierColor({ text: v })} />
        </div>
        <button
          className="btn btn-ghost small"
          onClick={() => set({ tiers: st.tiers.map((x) => ({ ...x, edge: t.edge, text: t.text })) })}
        >
          Usar esta borda/valor em todas
        </button>
      </Section>
      <Section title="Desenho">
        <Segmented
          label="Borda"
          value={st.edgePattern}
          onChange={(v) => set({ edgePattern: v })}
          options={BORDAS_DA_FICHA.filter((m) => bordas.includes(m.value))}
        />
        <Slider label="Marcas na borda" value={st.edgeCount} min={4} max={12} onChange={(v) => set({ edgeCount: v })} />
        <Segmented
          label="Centro"
          value={st.inlay}
          onChange={(v) => set({ inlay: v })}
          options={CENTROS_DA_FICHA.filter((m) => centros.includes(m.value))}
        />
        <div className="row gap wrap">
          <Toggle label="Mostrar valor" value={st.showValue} onChange={(v) => set({ showValue: v })} />
          <Toggle label="Brilho" value={st.shine} onChange={(v) => set({ shine: v })} />
        </div>
      </Section>
    </>
  );
}

const TPATTERN_LABEL: Record<TablePattern, string> = { none: 'Liso', lines: 'Linhas', hex: 'Hexágonos', sakura: 'Sakura', suits: 'Naipes', damask: 'Damasco' };

function TableEditor({ st, set }: { st: TableStyle; set: Setter<TableStyle> }) {
  const estampas = useLiberadas('pattern', TABLE_PATTERNS);
  return (
    <>
      <Section title="Feltro">
        <div className="color-grid">
          <CorLiberada label="Feltro" value={st.felt} onChange={(v) => set({ felt: v })} />
          <CorLiberada label="Brilho central" value={st.feltLight} onChange={(v) => set({ feltLight: v })} />
        </div>
        <Segmented label="Estampa" value={st.pattern} onChange={(v) => set({ pattern: v })} options={estampas.map((p) => ({ value: p, label: TPATTERN_LABEL[p] }))} />
        <CorLiberada label="Cor da estampa / linhas" value={st.patternColor} onChange={(v) => set({ patternColor: v })} />
      </Section>
      <Section title="Borda acolchoada">
        <div className="color-grid">
          <CorLiberada label="Borda" value={st.rail} onChange={(v) => set({ rail: v })} />
          <CorLiberada label="Friso" value={st.railAccent} onChange={(v) => set({ railAccent: v })} />
        </div>
      </Section>
      <Section title="Logotipo">
        <input className="input" maxLength={24} value={st.logoText} onChange={(e) => set({ logoText: e.target.value })} />
        <CorLiberada label="Cor do logotipo" value={st.logoColor} onChange={(v) => set({ logoColor: v })} />
      </Section>
      <Section title="Ambiente">
        <div className="color-grid">
          <CorLiberada label="Fundo (centro)" value={st.bgTop} onChange={(v) => set({ bgTop: v })} />
          <CorLiberada label="Fundo (bordas)" value={st.bgBottom} onChange={(v) => set({ bgBottom: v })} />
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ aparência da interface

/** Miniatura de um tema: fundo, painel e destaque com a fonte do tema. */
function ThemeThumb({ t }: { t: UiTheme }) {
  const w = t.swatch;
  return (
    <span className="theme-thumb" style={{ background: w.bg, color: w.accent, fontFamily: w.font }}>
      <span className="theme-thumb-panel" style={{ background: w.panel, borderColor: w.accent, color: w.text }}>
        Aa
      </span>
      <span className="theme-thumb-glyph">{w.glyph}</span>
    </span>
  );
}

/**
 * Aba "UI": escolhe a aparência da interface. O tema selecionado já aparece na tela inteira
 * (pré-visualização); "Usar esta aparência" grava no perfil, e sair sem aplicar volta ao atual.
 */
/** Cadeado na lista de aparências: o que não é do jogador aparece marcado. */
function ThemeLock({ id }: { id: string }) {
  return useOwns('ui', id) ? null : <span className="badge locked">🔒 Loja</span>;
}

function UiThemeStudio() {
  const profile = useProfile();
  const toast = useSession((s) => s.toast);
  const setPreview = useThemePreview((s) => s.setPreview);
  const chosen = findTheme(profile.settings.uiTheme);
  const [sel, setSel] = useState(chosen.id);
  const theme = findTheme(sel);
  const inUse = theme.id === chosen.id;
  // aparência é item de loja como os outros: só se usa a que foi adquirida
  const mine = useOwns('ui', theme.id);
  const kinds = Object.keys(theme.styles) as StyleKind[];
  const stylesOn = kinds.every((k) => profile.equipped[k] === theme.styles[k]) && profile.winFx === theme.winFx;

  useEffect(() => setPreview(inUse ? null : theme.id), [inUse, theme.id, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  return (
    <div className="studio-body">
      <div className="panel style-list">
        {UI_THEMES.map((t) => (
          <button
            key={t.id}
            className={`style-item ${t.id === theme.id ? 'on' : ''}`}
            onClick={() => {
              sfx.click();
              setSel(t.id);
            }}
          >
            <span className="thumb">
              <ThemeThumb t={t} />
            </span>
            <span className="style-name">
              {t.name}
              <span className="badges">
                {t.id === chosen.id && <span className="badge eq">Em uso</span>}
                <ThemeLock id={t.id} />
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="panel preview-area">
        <div className="preview-head">
          <h2 className="title-deco theme-title">{theme.name}</h2>
          <div className="row gap">
            <button
              className="btn btn-ghost small"
              disabled={stylesOn}
              title="Equipa as cartas, fichas, mesa e efeito de vitória que combinam com este tema"
              onClick={() => {
                for (const k of kinds) profile.equip(k, theme.styles[k]);
                profile.setWinFx(theme.winFx);
                sfx.pop();
                toast(`Estilos do tema “${theme.name}” equipados!`);
              }}
            >
              {stylesOn ? '✓ Estilos do tema' : 'Equipar estilos do tema'}
            </button>
            <button
              className={`btn ${inUse ? 'btn-ghost' : 'btn-gold'} small`}
              disabled={inUse || !mine}
              title={mine ? undefined : 'Esta aparência é da loja'}
              onClick={() => {
                profile.updateSettings({ uiTheme: theme.id });
                sfx.pop();
                toast(`Aparência “${theme.name}” aplicada!`);
              }}
            >
              {inUse ? '✓ Em uso' : mine ? 'Usar esta aparência' : '🔒 Comprar na Loja'}
            </button>
          </div>
        </div>
        <div className="preview-stage">
          <ThemeSample />
        </div>
        <div className="preset-note">
          {!mine
            ? `Pré-visualização. Esta aparência custa ${priceOf(itemKey('ui', theme.id), 'chips')?.toLocaleString('pt-BR')} fichas (ou ${padoPrice(priceOf(itemKey('ui', theme.id), 'chips') ?? 0)} padocoins) na Loja.`
            : inUse
              ? 'Esta é a aparência em uso.'
              : 'Pré-visualização: a tela inteira já mostra este tema. Se sair sem aplicar, volta a aparência atual.'}
        </div>
      </div>
      <div className="panel editor">
        <Section title="Sobre">
          <p className="theme-desc">{theme.description}</p>
        </Section>
        <Section title="O que muda">
          <ul className="theme-features">
            {theme.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Section>
        <Section title="Estilos que combinam">
          <div className="theme-styles">
            {kinds.map((k) => {
              const st = findStyle(profile, k, theme.styles[k]);
              return (
                <div key={k} className="theme-style">
                  <span className="thumb">
                    <Thumb kind={k} st={st} />
                  </span>
                  <span className="style-name">
                    {st.name}
                    <small className="muted">{KIND_LABEL[k]}</small>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="theme-style">
            <span className="thumb">
              <span className="fx-chip">
                <span className="fx-chip-card" />
                <CardWinFx fx={findWinFx(theme.winFx)} width={34} radius={3} seed={9} />
              </span>
            </span>
            <span className="style-name">
              {findWinFx(theme.winFx).name}
              <small className="muted">Efeito de vitória</small>
            </span>
          </div>
          <p className="field-hint">A aparência não troca seus estilos; use “Equipar estilos do tema” se quiser o conjunto completo.</p>
        </Section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ efeitos das cartas vencedoras

const FRAME_LABEL: Record<FxFrame, string> = { pulse: 'Moldura pulsante', march: 'Moldura tracejada correndo', flicker: 'Moldura piscando' };
const FX_SOUND_LABEL: Record<FxSound, string> = {
  chime: 'Sino',
  zap: 'Descarga',
  flame: 'Labareda',
  freeze: 'Congelamento',
  choir: 'Coral',
  whoosh: 'Sopro',
};

/**
 * Aba "Efeitos": escolhe o efeito das suas cartas quando você ganha. O catálogo está em
 * src/render/cardfx.tsx — acrescentar um efeito lá já faz ele aparecer aqui.
 */
/**
 * Aba "Efeitos de vitória".
 *
 * Era a única aba sem cadeado: listava os onze efeitos e deixava equipar qualquer um. O servidor
 * corrigia na mesa (`clampCosmetics` troca pelo gratuito o que a conta não tem), então o jogador
 * equipava Fogo, lia "✓ Equipado" e ganhava a mão com o brilho dourado — o jogo discordando de si
 * mesmo em silêncio. Agora o que não é seu aparece trancado, e o botão diz de onde ele sai.
 *
 * Ver e ouvir continua livre: a aba também serve de vitrine.
 */
function WinFxStudio() {
  const chosen = useProfile((s) => s.winFx);
  const setWinFx = useProfile((s) => s.setWinFx);
  const toast = useSession((s) => s.toast);
  // `useOwns` é hook e não pode ser chamado dentro do map: a lista pergunta à posse já lida
  const owned = useOwned();
  const meu = (id: string) => ownsItem(owned, 'winfx', id);
  /*
   * Só os efeitos que são dele.
   *
   * Antes a lista mostrava todos com um cadeado "🔒 Roleta", e isso estava errado por dois
   * motivos: o Estúdio é onde se mexe no que é seu (as outras abas já listam só o que é seu), e
   * uma vitrine de coisas trancadas no meio da oficina é propaganda no lugar da ferramenta. O que
   * existe para ganhar está na Loja → Tickets, onde tem preço e chance.
   *
   * O "Ouro" vem com o jogo (FREE_KEYS), então a lista nunca fica vazia.
   */
  const meus = WIN_FX.filter((f) => meu(f.id));
  const trancados = WIN_FX.length - meus.length;
  // conta antiga com um efeito equipado que ela não tem: cai no primeiro que é dela
  const [sel, setSel] = useState<WinFxId>(meu(chosen) ? chosen : (meus[0]?.id ?? DEFAULT_WIN_FX));
  const fx = findWinFx(sel);
  const equipped = fx.id === chosen;
  return (
    <div className="studio-body">
      <div className="panel style-list">
        {meus.map((f) => (
          <button
            key={f.id}
            className={`style-item ${f.id === fx.id ? 'on' : ''}`}
            onClick={() => {
              setSel(f.id);
              sfx.fx(f.sound);
            }}
          >
            <span className="thumb">
              <span className="fx-chip">
                <span className="fx-chip-card" />
                <CardWinFx fx={f} width={34} radius={3} seed={9} />
              </span>
            </span>
            <span className="style-name">
              {f.name}
              <span className="badges">{f.id === chosen && <span className="badge eq">Equipado</span>}</span>
            </span>
          </button>
        ))}
        {/* a lista curta não é defeito: é o que ele tem. O resto sai de ticket, e isso se diz. */}
        {trancados > 0 && (
          <div className="field-hint style-locked">
            {trancados === 1 ? 'Mais 1 efeito sai' : `Mais ${trancados} efeitos saem`} das roletas (<b>Loja → Tickets</b>). Aqui aparece o
            que é seu.
          </div>
        )}
      </div>
      <div className="panel preview-area">
        <div className="preview-head">
          <h2 className="title-deco theme-title">{fx.name}</h2>
          <div className="row gap">
            <button className="btn btn-ghost small" onClick={() => sfx.fx(fx.sound)} disabled={!fx.sound}>
              ♪ Ouvir
            </button>
            <button
              className={`btn ${equipped ? 'btn-ghost' : 'btn-gold'} small`}
              disabled={equipped}
              onClick={() => {
                setWinFx(fx.id);
                sfx.pop();
                toast(`Efeito de vitória: “${fx.name}” equipado!`);
              }}
            >
              {equipped ? '✓ Equipado' : 'Equipar'}
            </button>
          </div>
        </div>
        <div className="preview-stage">
          <div className="fx-preview">
            <CardView card={{ r: 14, s: 's' }} width={140} winFx={fx} />
            <CardView card={{ r: 13, s: 'h' }} width={140} winFx={fx} />
            <CardView card={null} faceUp={false} width={140} winFx={fx} />
          </div>
        </div>
        <div className="preset-note">As cartas vencedoras (as suas e as da mesa) ficam assim quando você ganha no showdown.</div>
      </div>
      <div className="panel editor">
        <Section title="Sobre">
          <p className="theme-desc">{fx.description}</p>
        </Section>
        <Section title="Detalhes">
          <ul className="theme-features">
            <li>{FRAME_LABEL[fx.frame]}</li>
            {fx.sound && <li>Som: {FX_SOUND_LABEL[fx.sound]}</li>}
            <li>
              Cores:
              <span className="fx-colors">
                {fx.colors.map((c) => (
                  <i key={c} style={{ background: c }} title={c} />
                ))}
              </span>
            </li>
          </ul>
          <p className="field-hint">O efeito é seu: os outros jogadores veem o seu efeito quando você ganha, e você vê o deles.</p>
        </Section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ aura e moldura

/**
 * Aba de coleção: a lista do que é seu, a peça grande e o botão de equipar — uma de cada vez.
 *
 * É a aba das molduras. Moldura não se edita — não é feita de campos como uma carta ou um feltro,
 * e sim desenhada uma a uma —, então o que a pessoa faz aqui é **escolher**. As auras têm aba
 * própria (`AuraStudio`) porque ali se escolhe mais de uma.
 *
 * Como na aba de efeitos, a lista mostra só o que é da conta. O que falta tem lugar próprio (Loja
 * → Tickets, e a Galeria para ver de perto); uma prateleira de cadeados no meio da oficina é
 * propaganda no lugar da ferramenta.
 */
function ColecaoStudio<T extends { id: string; name: string; description: string }>({
  kind,
  label,
  todas,
  equipada,
  equipar,
  nota,
  mini,
  palco,
}: {
  kind: 'aura' | 'frame';
  /** Como a peça se chama numa frase ("Aura", "Moldura") — entra no aviso de equipado. */
  label: string;
  todas: readonly T[];
  equipada: string;
  equipar: (id: string) => void;
  /** Uma linha embaixo do palco dizendo onde a peça aparece no jogo. */
  nota: string;
  mini: (x: T) => React.ReactNode;
  palco: (x: T) => React.ReactNode;
}) {
  const toast = useSession((s) => s.toast);
  const owned = useOwned();
  const meu = (id: string) => ownsItem(owned, kind, id);
  const meus = todas.filter((x) => meu(x.id));
  const trancadas = todas.length - meus.length;
  // conta antiga com uma peça equipada que ela não tem: cai na primeira que é dela
  const [sel, setSel] = useState<string>(meu(equipada) ? equipada : (meus[0]?.id ?? todas[0].id));
  const atual = meus.find((x) => x.id === sel) ?? meus[0] ?? todas[0];
  const posta = atual.id === equipada;
  return (
    <div className="studio-body">
      <div className="panel style-list">
        {meus.map((x) => (
          <button
            key={x.id}
            className={`style-item ${x.id === atual.id ? 'on' : ''}`}
            onClick={() => {
              setSel(x.id);
              sfx.hover();
            }}
          >
            <span className="thumb">{mini(x)}</span>
            <span className="style-name">
              {x.name}
              <span className="badges">{x.id === equipada && <span className="badge eq">Equipado</span>}</span>
            </span>
          </button>
        ))}
        {trancadas > 0 && (
          <div className="field-hint style-locked">
            {trancadas === 1 ? 'Mais 1 sai' : `Mais ${trancadas} saem`} das roletas (<b>Loja → Tickets</b>). Aqui aparece o que é seu.
          </div>
        )}
      </div>
      <div className="panel preview-area">
        <div className="preview-head">
          <h2 className="title-deco theme-title">{atual.name}</h2>
          <div className="row gap">
            <button
              className={`btn ${posta ? 'btn-ghost' : 'btn-gold'} small`}
              disabled={posta}
              onClick={() => {
                equipar(atual.id);
                sfx.pop();
                toast(`${label}: “${atual.name}” equipada!`);
              }}
            >
              {posta ? '✓ Equipada' : 'Equipar'}
            </button>
          </div>
        </div>
        <div className="preview-stage">{palco(atual)}</div>
        <div className="preset-note">{nota}</div>
      </div>
      <div className="panel editor">
        <Section title="Sobre">
          <p className="theme-desc">{atual.description}</p>
        </Section>
      </div>
    </div>
  );
}

/**
 * Aba "Auras": as que ficam em volta do seu personagem — várias de uma vez, uma por lugar.
 *
 * Clicar numa aura da lista **prova** a aura: o palco mostra o personagem com ela junto das que já
 * estão vestidas, antes de equipar. Se ela ocupa um lugar tomado (duas asas, duas auréolas), a
 * prova já mostra a troca, e o botão diz "Trocar" e o aviso diz quem sai. É a regra de
 * `AURA_SLOT` (shared/styles.ts) aparecendo na tela antes de a pessoa descobrir por acidente.
 *
 * A lista mostra só as auras da conta, como as outras abas; o catálogo está em src/render/aura.tsx.
 */
function AuraStudio() {
  const equipadas = useProfile((s) => s.auras);
  const setAuras = useProfile((s) => s.setAuras);
  const toast = useSession((s) => s.toast);
  const owned = useOwned();
  const char = useCharacter();
  const minha = (id: AuraId) => ownsItem(owned, 'aura', id);
  const minhas = AURAS.filter((a) => minha(a.id));
  const trancadas = AURAS.length - minhas.length;
  // o que aparece de verdade: conta com uma aura equipada que ela não tem perde só aquela
  const vestidas = equipadas.filter(minha);
  const [sel, setSel] = useState<AuraId>(vestidas[vestidas.length - 1] ?? minhas[0]?.id ?? DEFAULT_AURA);
  const atual = findAura(sel);
  const vestida = vestidas.includes(atual.id);
  const provando = vestida ? vestidas : vestirAura(vestidas, atual.id);
  const sai = vestida ? undefined : vestidas.find((v) => AURA_SLOT[v] === atual.slot);
  const nota = vestida
    ? 'É assim que ela fica junto das outras que você usa — no menu, e no cut-in quando você ganha a mão.'
    : sai
      ? `Equipar tira “${findAura(sai).name}”: as duas ocupam o mesmo lugar (${SLOT_LABEL[atual.slot]}).`
      : 'O palco já mostra como ela fica junto das que você usa.';
  return (
    <div className="studio-body">
      <div className="panel style-list">
        {minhas.map((a) => (
          <button
            key={a.id}
            className={`style-item ${a.id === atual.id ? 'on' : ''}`}
            onClick={() => {
              setSel(a.id);
              sfx.hover();
            }}
          >
            <span className="thumb">
              <AuraAmostra aura={a} />
            </span>
            <span className="style-name">
              {a.name}
              <span className="badges">
                <span className="badge">{SLOT_LABEL[a.slot]}</span>
                {vestidas.includes(a.id) && <span className="badge eq">Equipada</span>}
              </span>
            </span>
          </button>
        ))}
        {trancadas > 0 && (
          <div className="field-hint style-locked">
            {trancadas === 1 ? 'Mais 1 sai' : `Mais ${trancadas} saem`} das roletas (<b>Loja → Tickets</b>). Aqui aparece o que é seu.
          </div>
        )}
      </div>
      <div className="panel preview-area">
        <div className="preview-head">
          <h2 className="title-deco theme-title">{atual.name}</h2>
          <div className="row gap">
            {vestidas.length > 0 && (
              <button
                className="btn btn-ghost small"
                onClick={() => {
                  setAuras([]);
                  sfx.click();
                  toast('Auras tiradas: o personagem fica sem nada em volta.');
                }}
              >
                Tirar todas
              </button>
            )}
            <button
              className={`btn ${vestida ? 'btn-ghost' : 'btn-gold'} small`}
              onClick={() => {
                if (vestida) {
                  setAuras(tirarAura(vestidas, atual.id));
                  sfx.click();
                  toast(`Aura “${atual.name}” tirada.`);
                } else {
                  setAuras(vestirAura(vestidas, atual.id));
                  sfx.pop();
                  toast(sai ? `“${atual.name}” no lugar de “${findAura(sai).name}”.` : `Aura “${atual.name}” equipada!`);
                }
              }}
            >
              {vestida ? 'Tirar' : sai ? 'Trocar' : 'Equipar'}
            </button>
          </div>
        </div>
        <div className="preview-stage">
          <div className="aura-palco">
            <CharacterAura auras={provando} tint={char.bg} />
            <CharacterFull st={char} height="100%" />
            <CharacterAura auras={provando} tint={char.bg} plano="frente" />
          </div>
        </div>
        <div className="preset-note">{nota}</div>
      </div>
      <div className="panel editor">
        <Section title="Sobre">
          <p className="theme-desc">{atual.description}</p>
        </Section>
        <Section title="Em uso">
          {vestidas.length ? (
            <div className="aura-em-uso">
              {vestidas.map((id) => {
                const a = findAura(id);
                return (
                  <button key={id} className={`aura-chip ${id === atual.id ? 'on' : ''}`} onClick={() => setSel(id)}>
                    <small>{SLOT_LABEL[a.slot]}</small>
                    {a.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="field-hint">Nenhuma: o personagem fica sem nada em volta.</p>
          )}
          <p className="field-hint">
            Dá para usar várias ao mesmo tempo, <b>uma por lugar</b>: a luz de fundo, um círculo, um arsenal, um par de asas, um fogo no chão, uma
            auréola e uma órbita. Equipar uma aura num lugar ocupado troca a que estava lá.
          </p>
        </Section>
      </div>
    </div>
  );
}

/** Aba "Molduras": a borda do seu retrato. O catálogo está em src/render/PortraitFrame.tsx. */
function MolduraStudio() {
  const escolhida = useProfile((s) => s.frame);
  const setFrame = useProfile((s) => s.setFrame);
  const char = useCharacter();
  const fundo = { background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` };
  return (
    <ColecaoStudio
      kind="frame"
      label="Moldura"
      todas={FRAMES}
      equipada={escolhida}
      equipar={(id) => setFrame(findFrame(id).id)}
      nota="É a borda do seu retrato na mesa, no placar do fim da partida e no perfil — todo mundo vê."
      mini={(f) => (
        <span className="com-moldura" style={{ ...fundo, display: 'block', width: 34, height: 34, borderRadius: 8 }}>
          <CharacterPortrait st={char} size={34} />
          <PortraitFrame frame={f} size={34} />
        </span>
      )}
      palco={(f) => (
        <div className="moldura-palco">
          {/* os dois tamanhos que existem no jogo: o seu assento na mesa e o dos outros */}
          <span className="com-moldura" style={{ ...fundo, width: 200, height: 200 }}>
            <CharacterPortrait st={char} size={200} />
            <PortraitFrame frame={f} size={200} />
          </span>
          <span className="com-moldura" style={{ ...fundo, width: 76, height: 76 }}>
            <CharacterPortrait st={char} size={76} />
            <PortraitFrame frame={f} size={76} />
          </span>
        </div>
      )}
    />
  );
}

// ------------------------------------------------------------------ tela

/** As abas que **não** editam um estilo: escolhem uma peça pronta. */
const AVULSAS = ['ui', 'fx', 'aura', 'frame'] as const;
type Avulsa = (typeof AVULSAS)[number];
type Tab = StyleKind | Avulsa;

const ehAvulsa = (t: Tab): t is Avulsa => (AVULSAS as readonly string[]).includes(t);

const TABS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'face', icon: '🂡', label: KIND_LABEL.face },
  { tab: 'back', icon: '🂠', label: KIND_LABEL.back },
  { tab: 'chip', icon: '◉', label: KIND_LABEL.chip },
  { tab: 'table', icon: '⬭', label: KIND_LABEL.table },
  { tab: 'fx', icon: '✦', label: 'Efeitos' },
  { tab: 'aura', icon: '❂', label: 'Auras' },
  { tab: 'frame', icon: '▣', label: 'Molduras' },
  { tab: 'ui', icon: '❖', label: 'UI' },
];

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (text: string) => void }) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h3>Importar estilo</h3>
        <p className="muted small">Cole o JSON exportado por outro jogador ou escolha um arquivo .json.</p>
        <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"pokeru":1,"kind":"back","style":{…}}' />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }}
        />
        <div className="row gap between" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost small" onClick={() => fileRef.current?.click()}>
            Abrir arquivo…
          </button>
          <div className="row gap">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-gold" onClick={() => onImport(text)} disabled={!text.trim()}>
              Importar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Studio({ onBack, inicial = 'face' }: { onBack: () => void; /** A aba que abre (o preview usa). */ inicial?: Tab }) {
  const profile = useProfile();
  const toast = useSession((s) => s.toast);
  const [tab, setTab] = useState<Tab>(inicial);
  /** Estilo das abas de estilos (as abas avulsas — efeitos, aura, moldura, UI — não editam nada). */
  const kind: StyleKind = ehAvulsa(tab) ? 'face' : tab;
  const [selected, setSelected] = useState<Record<StyleKind, string>>(() => ({ ...profile.equipped }));
  const [importing, setImporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // só o que é dele: presets comprados (ou gratuitos) e as criações do próprio Estúdio
  const list = useMyStyles(kind);
  // e as peças com que ele pode montar: as dos estilos que tem
  const pecas = usePecas(kind);
  const owned = useOwned();
  // quantos presets deste tipo ainda não são do jogador: sem isso a lista curta parece defeito
  const trancados = PRESETS[kind].length - list.filter((x) => isPreset(kind, x.id)).length;
  const current = (list.find((x) => x.id === selected[kind]) ?? list[0]) as StyleMap[StyleKind];
  const preset = isPreset(kind, current.id);
  const equipped = profile.equipped[kind] === current.id;
  const select = (k: StyleKind, id: string) => {
    setSelected((s) => ({ ...s, [k]: id }));
    setConfirmDel(false);
  };

  const commit = (next: StyleMap[StyleKind]) => {
    if (preset) {
      const copy = { ...next, id: newId(), name: `${current.name} (cópia)`, from: current.id } as StyleMap[StyleKind];
      profile.saveStyle(kind, copy);
      select(kind, copy.id);
      toast('Estilos padrão não mudam — criamos uma cópia editável para você.');
    } else {
      profile.saveStyle(kind, next);
    }
  };
  const set = (patch: object) => commit({ ...current, ...patch } as StyleMap[StyleKind]);

  const createNew = () => {
    const n = profile.custom[kind].length + 1;
    // `from` diz de qual peça esta saiu — o servidor aceita o personalizado por causa dele
    const copy = { ...current, id: newId(), name: `Meu estilo ${n}`, from: isPreset(kind, current.id) ? current.id : ((current as { from?: string }).from ?? current.id) } as StyleMap[StyleKind];
    profile.saveStyle(kind, copy);
    select(kind, copy.id);
    sfx.pop();
  };

  const exportStyle = () => {
    const data = JSON.stringify({ pokeru: 1, kind, style: current }, null, 2);
    navigator.clipboard?.writeText(data).catch(() => {});
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pokeru-${kind}-${current.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Estilo exportado e copiado para a área de transferência!');
  };

  const doImport = (text: string) => {
    try {
      const obj = parseJsonc(text) as { kind?: StyleKind; style?: unknown } | null;
      const k: StyleKind = obj && typeof obj.kind === 'string' && obj.kind in PRESETS ? obj.kind : kind;
      // o estilo importado chega com as peças que a pessoa tem: cada cor vira a mais parecida da paleta dela
      const st = encaixar(k, SANITIZE[k](obj?.style ?? obj), pecasDaConta(k, owned).comp);
      const saved = { ...st, id: newId(), name: st.name || 'Importado' } as StyleMap[StyleKind];
      profile.saveStyle(k, saved);
      setTab(k);
      select(k, saved.id);
      setImporting(false);
      toast('Estilo importado!');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'JSON inválido', 'error');
    }
  };

  let editor: React.ReactNode;
  let previewNode: React.ReactNode;
  switch (kind) {
    case 'face':
      editor = <FaceEditor st={current as CardFaceStyle} set={set} />;
      previewNode = <FacePreview st={current as CardFaceStyle} />;
      break;
    case 'back':
      editor = <BackEditor st={current as CardBackStyle} set={set} />;
      previewNode = <BackPreview st={current as CardBackStyle} />;
      break;
    case 'chip':
      editor = <ChipEditor st={current as ChipStyle} set={set} />;
      previewNode = <ChipPreview st={current as ChipStyle} />;
      break;
    case 'table':
      editor = <TableEditor st={current as TableStyle} set={set} />;
      previewNode = <TablePreview st={current as TableStyle} />;
      break;
  }

  return (
    <div className="screen studio">
      <div className="menu-bg" />
      <ScreenHeader title="Estúdio de Estilos" onBack={onBack}>
        {!ehAvulsa(tab) && (
          <button className="btn btn-ghost small" onClick={() => setImporting(true)}>
            ⤓ Importar
          </button>
        )}
      </ScreenHeader>
      <div className="studio-tabs">
        {TABS.map((t) => (
          <button
            key={t.tab}
            className={tab === t.tab ? 'on' : ''}
            onClick={() => {
              sfx.click();
              setTab(t.tab);
              setConfirmDel(false);
            }}
          >
            <span className="tab-ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ui' ? (
        <UiThemeStudio />
      ) : tab === 'fx' ? (
        <WinFxStudio />
      ) : tab === 'aura' ? (
        <AuraStudio />
      ) : tab === 'frame' ? (
        <MolduraStudio />
      ) : (
        <div className="studio-body">
          <div className="panel style-list">
            <button className="btn btn-pink wide" onClick={createNew}>
              + Novo estilo
            </button>
            {list.map((s) => (
              <button key={s.id} className={`style-item ${s.id === current.id ? 'on' : ''}`} onClick={() => select(kind, s.id)}>
                <span className="thumb">
                  <Thumb kind={kind} st={s} />
                </span>
                <span className="style-name">
                  {s.name}
                  <span className="badges">
                    {profile.equipped[kind] === s.id && <span className="badge eq">Equipado</span>}
                    {isPreset(kind, s.id) ? <span className="badge">Padrão</span> : <span className="badge mine">Meu</span>}
                  </span>
                </span>
              </button>
            ))}
            {trancados > 0 && (
              <div className="field-hint style-locked">
                {trancados === 1 ? 'Mais 1 estilo deste tipo sai' : 'Mais ' + trancados + ' estilos deste tipo saem'} das roletas (<b>Loja → Tickets</b>). Aqui aparece o que é seu.
              </div>
            )}
          </div>
          <div className="panel preview-area">
            <div className="preview-head">
              <input
                className="input title-input"
                value={current.name}
                maxLength={40}
                onChange={(e) => (preset ? undefined : profile.saveStyle(kind, { ...current, name: e.target.value } as StyleMap[StyleKind]))}
                readOnly={preset}
                title={preset ? 'Estilos padrão não podem ser renomeados' : 'Renomear'}
              />
              <div className="row gap">
                <button className="btn btn-ghost small" onClick={() => set(aleatorio(kind, current, pecas.estilos, pecas.comp))} title="Mistura as peças dos estilos que você tem">
                  🎲 Aleatório
                </button>
                <button className="btn btn-ghost small" onClick={exportStyle}>
                  ⤒ Exportar
                </button>
                {!preset &&
                  (confirmDel ? (
                    <button
                      className="btn btn-danger small"
                      onClick={() => {
                        profile.deleteStyle(kind, current.id);
                        select(kind, PRESETS[kind][0].id);
                      }}
                    >
                      Confirmar exclusão
                    </button>
                  ) : (
                    <button className="btn btn-ghost small" onClick={() => setConfirmDel(true)}>
                      🗑 Excluir
                    </button>
                  ))}
                <button
                  className={`btn ${equipped ? 'btn-ghost' : 'btn-gold'} small`}
                  disabled={equipped}
                  onClick={() => {
                    profile.equip(kind, current.id);
                    sfx.pop();
                    toast(`${KIND_LABEL[kind]}: “${current.name}” equipado!`);
                  }}
                >
                  {equipped ? '✓ Equipado' : 'Equipar'}
                </button>
              </div>
            </div>
            <div className="preview-stage">{previewNode}</div>
            {preset && <div className="preset-note">Este é um estilo padrão. Qualquer ajuste cria automaticamente uma cópia sua.</div>}
          </div>
          <div className="panel editor">
            <PecasCtx.Provider value={pecas.comp}>{editor}</PecasCtx.Provider>
          </div>
        </div>
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onImport={doImport} />}
    </div>
  );
}
