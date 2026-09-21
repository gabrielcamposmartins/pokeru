import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '../../shared/cards';
import {
  BACK_PATTERNS,
  CHIP_VALUES,
  EMBLEMS,
  FONT_KEYS,
  TABLE_PATTERNS,
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
import { useMyStyles, useOwns } from '../store/shop';
import { itemKey, padoPrice, priceOf } from '../../shared/catalog';
import { useSession } from '../store/session';
import { CardBackSvg, CardFaceSvg, CardView, FONT_FAMILY, FONT_LABEL } from '../render/CardArt';
import { ChipStack, ChipSvg } from '../render/Chip';
import { CharacterPortrait } from '../render/CharacterArt';
import { TableFelt } from '../render/TableFelt';
import { CARD_H, CARD_W, boardSlot, planeStyle, project } from '../game/layout';
import { ColorField, ScreenHeader, Section, Segmented, Slider, Toggle } from '../ui/controls';
import { rgbToHex } from '../util/color';
import { parseJsonc } from '../../shared/jsonc';
import { sfx, type FxSound } from '../audio/sfx';
import { CardWinFx, WIN_FX, findWinFx, type FxFrame } from '../render/cardfx';
import { fmt } from '../util/format';
import { UI_THEMES, findTheme, useThemePreview, type UiTheme } from '../ui/themes';

// ------------------------------------------------------------------ util

function newId(): string {
  return 'custom-' + Math.random().toString(36).slice(2, 10);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function randomize<K extends StyleKind>(kind: K, st: StyleMap[K]): StyleMap[K] {
  const hue = Math.random() * 360;
  const col = (l: number, s = 65, spread = 90) => hslToHex((hue + (Math.random() - 0.5) * spread + 360) % 360, s, l);
  const any = st as unknown as Record<string, unknown>;
  switch (kind) {
    case 'face': {
      const dark = Math.random() < 0.3;
      return {
        ...any,
        bg: dark ? col(12, 30) : col(97, 40),
        bgGradient: dark ? col(6, 30) : col(88, 45),
        border: col(dark ? 60 : 70, 60),
        frame: pick(['none', 'line', 'double', 'ornate'] as const),
        frameColor: col(60, 60),
        suitColors: {
          s: dark ? col(85, 40) : col(18, 45),
          h: col(52, 80, 40),
          d: Math.random() < 0.5 ? col(52, 80, 40) : col(48, 70, 200),
          c: dark ? col(85, 40) : col(20, 50),
        },
        font: pick(FONT_KEYS),
        center: pick(['pips', 'big', 'minimal'] as const),
        court: pick(['letter', 'crest'] as const),
        courtColor: dark ? col(85, 50) : col(28, 55),
        courtAccent: col(58, 75),
      } as StyleMap[K];
    }
    case 'back':
      return {
        ...any,
        base: col(38, 70),
        base2: col(26, 70),
        pattern: pick(BACK_PATTERNS.filter((p) => p !== 'solid')),
        patternColor: col(82, 70),
        patternOpacity: 0.3 + Math.random() * 0.5,
        border: col(95, 30),
        frame: col(70, 70),
        emblem: pick(EMBLEMS.filter((e) => e !== 'none' && e !== 'text')),
        emblemColor: col(92, 40),
        emblemBg: col(30, 70),
      } as StyleMap[K];
    case 'chip': {
      const tiers = CHIP_VALUES.map((_, i) => {
        const h = (hue + i * 45) % 360;
        return { base: hslToHex(h, 65, 45 + (i % 2) * 10), edge: hslToHex((h + 180) % 360, 30, 95), text: '#ffffff' };
      });
      return { ...any, tiers, edgePattern: pick(['blocks', 'stripes', 'dots'] as const), inlay: pick(['ring', 'solid', 'dashed'] as const) } as StyleMap[K];
    }
    case 'table':
      return {
        ...any,
        felt: col(32, 55),
        feltLight: col(44, 55),
        rail: col(14, 40),
        railAccent: col(62, 75),
        pattern: pick(TABLE_PATTERNS),
        patternColor: col(85, 60),
        logoColor: col(88, 50),
        bgTop: col(16, 45),
        bgBottom: col(5, 40),
      } as StyleMap[K];
    default:
      return st;
  }
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

// ------------------------------------------------------------------ pré-visualizações

const FACE_SAMPLES: Card[] = [
  { r: 14, s: 's' },
  { r: 13, s: 'h' },
  { r: 12, s: 'd' },
  { r: 11, s: 'c' },
  { r: 10, s: 'h' },
  { r: 7, s: 's' },
  { r: 5, s: 'd' },
  { r: 3, s: 'c' },
];

function FacePreview({ st }: { st: CardFaceStyle }) {
  return (
    <div className="preview-cards">
      {FACE_SAMPLES.map((c, i) => (
        <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -14, rotate: -2 }}>
          <CardFaceSvg card={c} style={st} width={128} />
        </motion.div>
      ))}
    </div>
  );
}

function BackPreview({ st }: { st: CardBackStyle }) {
  return (
    <div className="preview-backs">
      <motion.div whileHover={{ rotateY: 15, rotateX: 8 }} style={{ transformPerspective: 800 }}>
        <CardBackSvg style={st} width={230} />
      </motion.div>
      <div className="mini-fan">
        {[-14, 0, 14].map((a, i) => (
          <div key={i} style={{ transform: `rotate(${a}deg)` }}>
            <CardBackSvg style={st} width={110} />
          </div>
        ))}
      </div>
      <div className="flip-demo">
        <span className="muted small">Passe o mouse para virar</span>
        <FlipDemo back={st} />
      </div>
    </div>
  );
}

function FlipDemo({ back }: { back: CardBackStyle }) {
  const [up, setUp] = useState(false);
  return (
    <div onMouseEnter={() => setUp(true)} onMouseLeave={() => setUp(false)}>
      <CardView card={{ r: 14, s: 's' }} faceUp={up} width={110} back={back} />
    </div>
  );
}

function ChipPreview({ st }: { st: ChipStyle }) {
  return (
    <div className="preview-chips">
      <div className="chip-row">
        {CHIP_VALUES.map((v, i) => (
          <motion.div key={v} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.04, type: 'spring' }} whileHover={{ y: -8, rotate: 25 }}>
            <ChipSvg value={v} size={84} style={st} />
          </motion.div>
        ))}
      </div>
      <div className="row gap center" style={{ gap: 60, marginTop: 30 }}>
        <ChipStack amount={12860} size={64} style={st} />
        <ChipStack amount={2535} size={64} style={st} />
        <ChipStack amount={31250} size={64} style={st} />
      </div>
    </div>
  );
}

const PREVIEW_PLANE = planeStyle();

function TablePreview({ st }: { st: TableStyle }) {
  const cards: Card[] = [
    { r: 14, s: 'h' },
    { r: 13, s: 'h' },
    { r: 7, s: 'c' },
  ];
  const chips = project({ x: 800, y: 780 });
  return (
    <div className="preview-table" style={{ background: `radial-gradient(ellipse at 50% 40%, ${st.bgTop}, ${st.bgBottom} 80%)` }}>
      <div className="preview-table-inner">
        <div style={PREVIEW_PLANE}>
          <TableFelt st={st} />
          {cards.map((c, i) => {
            const p = boardSlot(i);
            return (
              <div key={i} style={{ position: 'absolute', left: p.x - CARD_W / 2, top: p.y - CARD_H / 2 }}>
                <CardView card={c} width={CARD_W} />
              </div>
            );
          })}
        </div>
        <div className="seat-bet" style={{ left: chips.x, top: chips.y, transform: `scale(${chips.s})` }}>
          <div className="seat-bet-inner">
            <ChipStack amount={3450} size={36} />
          </div>
        </div>
      </div>
    </div>
  );
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

function FaceEditor({ st, set }: { st: CardFaceStyle; set: Setter<CardFaceStyle> }) {
  const sc = (k: keyof CardFaceStyle['suitColors'], v: string) => set({ suitColors: { ...st.suitColors, [k]: v } });
  return (
    <>
      <Section title="Cores do papel">
        <div className="color-grid">
          <ColorField label="Fundo" value={st.bg} onChange={(v) => set({ bg: v })} />
          <ColorField label="Degradê" value={st.bgGradient} onChange={(v) => set({ bgGradient: v })} />
          <ColorField label="Borda" value={st.border} onChange={(v) => set({ border: v })} />
          <ColorField label="Moldura" value={st.frameColor} onChange={(v) => set({ frameColor: v })} />
        </div>
      </Section>
      <Section title="Naipes">
        <div className="color-grid">
          <ColorField label="♠ Espadas" value={st.suitColors.s} onChange={(v) => sc('s', v)} />
          <ColorField label="♥ Copas" value={st.suitColors.h} onChange={(v) => sc('h', v)} />
          <ColorField label="♦ Ouros" value={st.suitColors.d} onChange={(v) => sc('d', v)} />
          <ColorField label="♣ Paus" value={st.suitColors.c} onChange={(v) => sc('c', v)} />
        </div>
        <div className="row gap">
          <button className="btn btn-ghost small" onClick={() => set({ suitColors: { s: '#1b1b24', h: '#d0243b', d: '#d0243b', c: '#1b1b24' } })}>
            Duas cores
          </button>
          <button className="btn btn-ghost small" onClick={() => set({ suitColors: { s: '#1d1f27', h: '#e0263e', d: '#1f6fe0', c: '#1c9a4c' } })}>
            Quatro cores
          </button>
        </div>
      </Section>
      <Section title="Formato">
        <Slider label="Espessura da borda" value={st.borderWidth} min={0} max={14} onChange={(v) => set({ borderWidth: v })} />
        <Slider label="Arredondamento" value={st.radius} min={0} max={40} onChange={(v) => set({ radius: v })} />
        <Segmented
          label="Moldura"
          value={st.frame}
          onChange={(v) => set({ frame: v })}
          options={[
            { value: 'none', label: 'Nenhuma' },
            { value: 'line', label: 'Linha' },
            { value: 'double', label: 'Dupla' },
            { value: 'ornate', label: 'Ornada' },
          ]}
        />
      </Section>
      <Section title="Tipografia">
        <Segmented
          value={st.font}
          onChange={(v) => set({ font: v })}
          options={FONT_KEYS.map((f) => ({ value: f, label: <span style={{ fontFamily: FONT_FAMILY[f] }}>{FONT_LABEL[f]}</span> }))}
        />
        <Slider label="Tamanho do índice" value={st.indexScale} min={0.8} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ indexScale: v })} />
      </Section>
      <Section title="Centro e figuras">
        <Segmented
          label="Centro"
          value={st.center}
          onChange={(v) => set({ center: v })}
          options={[
            { value: 'pips', label: 'Tradicional' },
            { value: 'big', label: 'Naipe grande' },
            { value: 'minimal', label: 'Minimalista' },
          ]}
        />
        <Segmented
          label="Figuras (J, Q, K)"
          value={st.court}
          onChange={(v) => set({ court: v })}
          options={[
            { value: 'crest', label: 'Brasão' },
            { value: 'letter', label: 'Letra grande' },
          ]}
        />
        <div className="color-grid">
          <ColorField label="Figura" value={st.courtColor} onChange={(v) => set({ courtColor: v })} />
          <ColorField label="Detalhe" value={st.courtAccent} onChange={(v) => set({ courtAccent: v })} />
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
  const toast = useSession((s) => s.toast);
  return (
    <>
      <Section title="Base">
        <div className="color-grid">
          <ColorField label="Cor 1" value={st.base} onChange={(v) => set({ base: v })} />
          <ColorField label="Cor 2" value={st.base2} onChange={(v) => set({ base2: v })} />
        </div>
      </Section>
      <Section title="Padrão">
        <OptGrid
          value={st.pattern}
          options={BACK_PATTERNS}
          onChange={(v) => set({ pattern: v })}
          render={(p) => (
            <span className="pattern-opt">
              <CardBackSvg style={{ ...st, pattern: p, emblem: 'none', image: undefined, patternOpacity: Math.max(0.5, st.patternOpacity) }} width={30} />
              <small>{PATTERN_LABEL[p]}</small>
            </span>
          )}
        />
        <ColorField label="Cor do padrão" value={st.patternColor} onChange={(v) => set({ patternColor: v })} />
        <Slider label="Escala" value={st.patternScale} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => set({ patternScale: v })} />
        <Slider label="Opacidade" value={st.patternOpacity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ patternOpacity: v })} />
      </Section>
      <Section title="Borda">
        <div className="color-grid">
          <ColorField label="Borda" value={st.border} onChange={(v) => set({ border: v })} />
          <ColorField label="Filete" value={st.frame} onChange={(v) => set({ frame: v })} />
        </div>
        <Slider label="Largura da borda" value={st.borderWidth} min={0} max={24} onChange={(v) => set({ borderWidth: v })} />
        <Slider label="Arredondamento" value={st.radius} min={0} max={40} onChange={(v) => set({ radius: v })} />
      </Section>
      <Section title="Emblema">
        <OptGrid value={st.emblem} options={EMBLEMS} onChange={(v) => set({ emblem: v })} render={(e) => <span className="emblem-opt">{EMBLEM_ICON[e]}</span>} />
        {st.emblem === 'text' && (
          <input className="input" maxLength={3} value={st.emblemText} onChange={(e) => set({ emblemText: e.target.value })} placeholder="Até 3 letras" />
        )}
        <div className="color-grid">
          <ColorField label="Símbolo" value={st.emblemColor} onChange={(v) => set({ emblemColor: v })} />
          <ColorField label="Fundo" value={st.emblemBg} onChange={(v) => set({ emblemBg: v })} />
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

function ChipEditor({ st, set }: { st: ChipStyle; set: Setter<ChipStyle> }) {
  const [tier, setTier] = useState(0);
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
          <ColorField label="Base" value={t.base} onChange={(v) => setTierColor({ base: v })} />
          <ColorField label="Borda" value={t.edge} onChange={(v) => setTierColor({ edge: v })} />
          <ColorField label="Valor" value={t.text} onChange={(v) => setTierColor({ text: v })} />
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
          options={[
            { value: 'blocks', label: 'Blocos' },
            { value: 'stripes', label: 'Listras' },
            { value: 'dots', label: 'Pontos' },
            { value: 'none', label: 'Lisa' },
          ]}
        />
        <Slider label="Marcas na borda" value={st.edgeCount} min={4} max={12} onChange={(v) => set({ edgeCount: v })} />
        <Segmented
          label="Centro"
          value={st.inlay}
          onChange={(v) => set({ inlay: v })}
          options={[
            { value: 'ring', label: 'Anel' },
            { value: 'dashed', label: 'Tracejado' },
            { value: 'solid', label: 'Sólido' },
          ]}
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
  return (
    <>
      <Section title="Feltro">
        <div className="color-grid">
          <ColorField label="Feltro" value={st.felt} onChange={(v) => set({ felt: v })} />
          <ColorField label="Brilho central" value={st.feltLight} onChange={(v) => set({ feltLight: v })} />
        </div>
        <Segmented label="Estampa" value={st.pattern} onChange={(v) => set({ pattern: v })} options={TABLE_PATTERNS.map((p) => ({ value: p, label: TPATTERN_LABEL[p] }))} />
        <ColorField label="Cor da estampa / linhas" value={st.patternColor} onChange={(v) => set({ patternColor: v })} />
      </Section>
      <Section title="Borda acolchoada">
        <div className="color-grid">
          <ColorField label="Borda" value={st.rail} onChange={(v) => set({ rail: v })} />
          <ColorField label="Friso" value={st.railAccent} onChange={(v) => set({ railAccent: v })} />
        </div>
      </Section>
      <Section title="Logotipo">
        <input className="input" maxLength={24} value={st.logoText} onChange={(e) => set({ logoText: e.target.value })} />
        <ColorField label="Cor do logotipo" value={st.logoColor} onChange={(v) => set({ logoColor: v })} />
      </Section>
      <Section title="Ambiente">
        <div className="color-grid">
          <ColorField label="Fundo (centro)" value={st.bgTop} onChange={(v) => set({ bgTop: v })} />
          <ColorField label="Fundo (bordas)" value={st.bgBottom} onChange={(v) => set({ bgBottom: v })} />
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

/** Amostra de componentes da mesa, desenhada com o tema ativo (o da pré-visualização). */
function ThemeSample() {
  const character = useCharacter();
  const name = useProfile((s) => s.name);
  return (
    <div className="theme-sample">
      <div className="theme-sample-row">
        <div className="plate seat-card is-me theme-sample-plate">
          <div className="seat-portrait" style={{ background: `linear-gradient(160deg, ${character.bg}, ${character.bg2})`, width: 76, height: 76 }}>
            <CharacterPortrait st={character} size={76} />
            <div className="seat-frame" />
            <div className="plate-pos pos-D">D</div>
          </div>
          <div className="seat-info">
            <div className="seat-name">{name}</div>
            <div className="seat-stack">
              <ChipSvg value={100} size={16} />
              {fmt(2480)}
            </div>
          </div>
          <div className="plate-action act-raise">Aumentou</div>
        </div>
        <div className="callout callout-raise">Aumento!</div>
      </div>
      <div className="theme-sample-row">
        <CardView card={{ r: 14, s: 's' }} width={74} />
        <CardView card={{ r: 13, s: 'h' }} width={74} />
        <CardView card={null} faceUp={false} width={74} />
        <ChipStack amount={1250} size={30} maxCols={3} />
      </div>
      <div className="act-row">
        <button className="act-btn fold" onClick={() => sfx.click()}>
          Desistir
        </button>
        <button className="act-btn call" onClick={() => sfx.click()}>
          Pagar {fmt(40)}
        </button>
        <button className="act-btn raise" onClick={() => sfx.click()}>
          Aumentar {fmt(120)}
        </button>
      </div>
    </div>
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
function WinFxStudio() {
  const chosen = useProfile((s) => s.winFx);
  const setWinFx = useProfile((s) => s.setWinFx);
  const toast = useSession((s) => s.toast);
  const [sel, setSel] = useState<WinFxId>(chosen);
  const fx = findWinFx(sel);
  const equipped = fx.id === chosen;
  return (
    <div className="studio-body">
      <div className="panel style-list">
        {WIN_FX.map((f) => (
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

// ------------------------------------------------------------------ tela

type Tab = StyleKind | 'ui' | 'fx';

const TABS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'face', icon: '🂡', label: KIND_LABEL.face },
  { tab: 'back', icon: '🂠', label: KIND_LABEL.back },
  { tab: 'chip', icon: '◉', label: KIND_LABEL.chip },
  { tab: 'table', icon: '⬭', label: KIND_LABEL.table },
  { tab: 'fx', icon: '✦', label: 'Efeitos' },
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

export function Studio({ onBack }: { onBack: () => void }) {
  const profile = useProfile();
  const toast = useSession((s) => s.toast);
  const [tab, setTab] = useState<Tab>('face');
  /** Estilo das abas de estilos (as abas Efeitos e UI não editam estilos). */
  const kind: StyleKind = tab === 'ui' || tab === 'fx' ? 'face' : tab;
  const [selected, setSelected] = useState<Record<StyleKind, string>>(() => ({ ...profile.equipped }));
  const [importing, setImporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // só o que é dele: presets comprados (ou gratuitos) e as criações do próprio Estúdio
  const list = useMyStyles(kind);
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
      const st = SANITIZE[k](obj?.style ?? obj);
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
        {tab !== 'ui' && tab !== 'fx' && (
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
                <button className="btn btn-ghost small" onClick={() => set(randomize(kind, current))} title="Gera uma variação aleatória">
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
          <div className="panel editor">{editor}</div>
        </div>
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onImport={doImport} />}
    </div>
  );
}
