import type { ReactNode } from 'react';
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
