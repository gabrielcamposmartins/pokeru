import type { CSSProperties } from 'react';
import type { CharacterStyle } from '../../shared/styles';

/**
 * Arte dos personagens (imagens em public/characters/<id>/).
 * `full.png` é a ilustração de corpo inteiro; `portrait.png` é o retrato usado na mesa.
 */

export function CharacterPortrait({ st, size, className, style }: { st: CharacterStyle; size: number; className?: string; style?: CSSProperties }) {
  return (
    <img
      className={`char-img ${className ?? ''}`}
      src={st.portrait}
      width={size}
      height={size}
      style={{ objectFit: 'cover', ...style }}
      draggable={false}
      alt={st.name}
    />
  );
}

export type CharView = 'full' | 'bust';

/** Corpo inteiro, ou só o busto (parte de cima da ilustração, usada no cut-in). */
export function CharacterFull({
  st,
  height,
  view = 'full',
  animate,
  className,
  style,
  onClick,
}: {
  st: CharacterStyle;
  height: number;
  view?: CharView;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  if (view === 'bust') {
    return (
      <div className={`char-bust ${className ?? ''}`} style={{ height, width: height * 0.9, ...style }} onClick={onClick}>
        <img src={st.full} alt={st.name} draggable={false} />
      </div>
    );
  }
  return (
    <div className={`char-full ${animate ? 'char-anim' : ''} ${className ?? ''}`} style={{ height, ...style }} onClick={onClick}>
      <img src={st.full} alt={st.name} draggable={false} />
    </div>
  );
}
