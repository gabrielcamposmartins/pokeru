import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../audio/sfx';
import { BLIND_STEPS } from '../../shared/protocol';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <div className="color-meta">
        <span>{label}</span>
        <input
          className="hex"
          value={value}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider-field">
      <div className="slider-top">
        <span>{label}</span>
        <b>{format ? format(value) : value}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg-field">
      {label && <span className="field-label">{label}</span>}
      <div className="seg">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            disabled={o.disabled}
            className={o.value === value ? 'on' : ''}
            onClick={() => {
              sfx.click();
              onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      {label}
    </button>
  );
}

export function ScreenHeader({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  return (
    <div className="screen-header">
      <button
        className="btn btn-ghost"
        onClick={() => {
          sfx.click();
          onBack();
        }}
      >
        ⟵ Voltar
      </button>
      <h1 className="title-deco">{title}</h1>
      <div className="header-extra">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

/** Uma opção do seletor. `value` é o que vai para quem escolhe; o resto é do desenho. */
export interface SelectOption<T> {
  value: T;
  label: string;
  /** Uma linha embaixo do rótulo, na lista aberta. */
  hint?: string;
  /** Um enfeite à esquerda (ícone, marca). */
  glyph?: ReactNode;
  /** O rótulo desenhado de outro jeito (o título com o brilho dele, por exemplo). */
  render?: ReactNode;
}

/**
 * Um seletor com a cara do jogo.
 *
 * O `<select>` do sistema abre uma lista do Windows no meio de uma tela laqueada: fonte errada,
 * cor errada, e nenhuma chance de mostrar o título com o brilho que ele tem na mesa. Este abre a
 * própria lista, com rótulo, explicação e enfeite por linha.
 *
 * O teclado continua funcionando como se espera de um seletor — setas andam, Enter escolhe, Esc
 * fecha — e o papel de acessibilidade é o de uma caixa de combinação, então quem usa leitor de
 * tela ouve "seletor", e não "botão" seguido de uma lista de botões soltos.
 */
export function Select<T extends string | number | null>({
  value,
  options,
  onChange,
  placeholder = 'Escolher…',
  disabled,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = options.find((o) => o.value === value);

  // clicar fora fecha: uma lista aberta esquecida no canto da tela rouba o próximo clique
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const escolher = (o: SelectOption<T>) => {
    sfx.click();
    onChange(o.value);
    setAberto(false);
  };

  const tecla = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) {
        setAberto(true);
        setFoco(Math.max(0, options.findIndex((o) => o.value === value)));
        return;
      }
      setFoco((f) => (f + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (aberto && options[foco]) escolher(options[foco]);
      else setAberto(true);
    }
  };

  return (
    <div className={`sel ${aberto ? 'aberto' : ''} ${disabled ? 'off' : ''}`} ref={caixa}>
      <button
        type="button"
        className="sel-botao"
        role="combobox"
        aria-expanded={aberto}
        aria-haspopup="listbox"
        disabled={disabled}
        onKeyDown={tecla}
        onClick={() => {
          if (disabled) return;
          sfx.click();
          setAberto((a) => !a);
          setFoco(Math.max(0, options.findIndex((o) => o.value === value)));
        }}
      >
        <span className="sel-valor">{atual ? (atual.render ?? atual.label) : <i className="muted">{placeholder}</i>}</span>
        <span className="sel-seta" aria-hidden>
          ▾
        </span>
      </button>
      {aberto && (
        <div className="sel-lista" role="listbox" tabIndex={-1}>
          {options.map((o, i) => (
            <button
              type="button"
              key={String(o.value)}
              className={`sel-item ${o.value === value ? 'on' : ''} ${i === foco ? 'foco' : ''}`}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setFoco(i)}
              onClick={() => escolher(o)}
            >
              {o.glyph && <span className="sel-ico">{o.glyph}</span>}
              <span className="sel-texto">
                <b>{o.render ?? o.label}</b>
                {o.hint && <small>{o.hint}</small>}
              </span>
              {o.value === value && <span className="sel-marca">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * O seletor de blinds: um campo de número que **pula degraus**.
 *
 * Blind não é um número livre — é a escala da mesa, e 37/74 não diz nada a ninguém. Então o campo
 * anda pela escada de `BLIND_STEPS` com as setas, o teclado e a roda do mouse, mostrando sempre o
 * par pequeno/grande. Por fora ele se comporta como um `input type=number` (mesmo papel de
 * acessibilidade, `spinbutton`), mas com os valores que a mesa aceita.
 */
export function BlindPicker({ value, onChange, label = 'Blinds' }: { value: number; onChange: (bb: number) => void; label?: string }) {
  const i = Math.max(
    0,
    BLIND_STEPS.findIndex((d) => d.bb === value),
  );
  const ir = (n: number) => {
    const alvo = Math.max(0, Math.min(BLIND_STEPS.length - 1, n));
    if (alvo === i) return;
    sfx.click();
    onChange(BLIND_STEPS[alvo].bb);
  };
  const d = BLIND_STEPS[i];
  return (
    <div className="seg-field">
      <span className="field-label">{label}</span>
      <div
        className="degrau"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={d.bb}
        aria-valuemin={BLIND_STEPS[0].bb}
        aria-valuemax={BLIND_STEPS[BLIND_STEPS.length - 1].bb}
        aria-valuetext={`${d.sb} / ${d.bb}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') ir(i + 1);
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ir(i - 1);
        }}
        onWheel={(e) => {
          e.preventDefault();
          ir(i + (e.deltaY < 0 ? 1 : -1));
        }}
      >
        <button type="button" className="degrau-seta" disabled={i === 0} onClick={() => ir(i - 1)} aria-label="Blind menor" tabIndex={-1}>
          −
        </button>
        <span className="degrau-val">
          <b>{d.sb.toLocaleString('pt-BR')}</b>
          <i>/</i>
          <b>{d.bb.toLocaleString('pt-BR')}</b>
        </span>
        <button
          type="button"
          className="degrau-seta"
          disabled={i === BLIND_STEPS.length - 1}
          onClick={() => ir(i + 1)}
          aria-label="Blind maior"
          tabIndex={-1}
        >
          +
        </button>
      </div>
      <span className="degrau-escala" aria-hidden>
        {BLIND_STEPS.map((x, n) => (
          <i key={x.bb} className={n === i ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}
