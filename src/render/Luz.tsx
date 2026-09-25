import { memo } from 'react';

/**
 * Os feixes de luz atrás do prêmio.
 *
 * É a Luz Sagrada das cartas vencedoras (render/cardfx.tsx) recortada para fora da carta: doze
 * raios girando e um halo, pintados com `currentColor` — que quem chama define como a cor da
 * raridade. Um lendário nasce dourado; um comum, verde.
 */
export const LuzDoPremio = memo(function LuzDoPremio() {
  return (
    <svg className="giro-luz" viewBox="0 0 100 100" aria-hidden>
      <g className="giro-raios">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} transform={`rotate(${i * 30} 50 50)`} d="M50 50 L45 -30 L55 -30 Z" />
        ))}
      </g>
      <circle className="giro-halo" cx={50} cy={50} r={34} />
    </svg>
  );
});
