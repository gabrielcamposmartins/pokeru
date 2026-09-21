/**
 * O padocoin — a moeda da economia do bot do Discord.
 *
 * Precisa ser reconhecível ao lado da ficha de pôquer em 30px, então não disputa a mesma forma:
 * a ficha é um disco com marcas na borda, e esta é uma moeda cunhada com um pãozinho no meio
 * (padoca → padocoin). Cor de latão, para não passar por ficha dourada.
 */
export function PadoCoinSvg({ size = 30 }: { size?: number }) {
  const id = 'pado';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${id}-face`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="55%" stopColor="#e8b850" />
          <stop offset="100%" stopColor="#a9762a" />
        </radialGradient>
        <linearGradient id={`${id}-bread`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8a5a22" />
          <stop offset="100%" stopColor="#5f3a12" />
        </linearGradient>
      </defs>
      {/* corpo da moeda, com a borda mais escura fazendo o volume */}
      <circle cx="50" cy="50" r="47" fill="#7a5218" />
      <circle cx="50" cy="50" r="43" fill={`url(#${id}-face)`} />
      {/* pãozinho: o corpo e os três cortes. Grande e de traço grosso, para ler em 14px. */}
      <ellipse cx="50" cy="52" rx="32" ry="19" fill={`url(#${id}-bread)`} transform="rotate(-12 50 52)" />
      <g stroke="#ffe9a8" strokeWidth="5" strokeLinecap="round">
        <line x1="36" y1="47" x2="44" y2="39" />
        <line x1="48" y1="52" x2="56" y2="44" />
        <line x1="60" y1="57" x2="68" y2="49" />
      </g>
      {/* brilho de cunhagem */}
      <path d="M22 32a34 34 0 0 1 26-16" fill="none" stroke="#fff6d8" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
