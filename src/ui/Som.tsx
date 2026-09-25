import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProfile } from '../store/profile';
import { sfx } from '../audio/sfx';

/** O ícone acompanha o volume: mudo, baixo, médio, alto. */
function iconeDoVolume(volume: number, muted: boolean): string {
  if (muted || volume <= 0) return '🔇';
  if (volume < 0.34) return '🔈';
  if (volume < 0.67) return '🔉';
  return '🔊';
}

/**
 * O botão de som do menu e da partida: silencia **e** regula o volume geral.
 *
 * Clicar abre uma régua de volume com o botão de silenciar embaixo; a rodinha do mouse em cima do
 * botão sobe e desce o volume sem abrir nada. Antes ele só ligava e desligava, e para baixar o som
 * era preciso sair da mesa e ir até Ajustes.
 *
 * Mexer no volume com o som desligado liga o som: quem sobe o volume quer ouvir.
 */
export function BotaoDeSom({ className, lado = 'baixo' }: { className: string; lado?: 'baixo' | 'esquerda' }) {
  const volume = useProfile((s) => s.settings.volume);
  const muted = useProfile((s) => s.settings.muted);
  const updateSettings = useProfile((s) => s.updateSettings);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // clicar fora fecha a régua
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener('pointerdown', fora);
    return () => window.removeEventListener('pointerdown', fora);
  }, [aberto]);

  const ajusta = (v: number) => {
    const novo = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    updateSettings({ volume: novo, muted: novo <= 0 });
  };
  const pct = Math.round((muted ? 0 : volume) * 100);

  return (
    <div
      className={`som ${lado}`}
      ref={caixa}
      onWheel={(e) => {
        // a rodinha regula direto, de 5 em 5
        ajusta((muted ? 0 : volume) + (e.deltaY < 0 ? 0.05 : -0.05));
      }}
    >
      <button
        className={className}
        title={`Som: ${pct}% (clique para o volume, rodinha para ajustar)`}
        aria-label="Volume"
        aria-expanded={aberto}
        onClick={() => {
          sfx.click();
          setAberto((a) => !a);
        }}
      >
        {iconeDoVolume(volume, muted)}
      </button>
      {aberto && (
        <div className="som-regua" role="group" aria-label="Volume geral">
          <b className="som-pct">{pct}%</b>
          {/* a régua é um controle deitado, girado de pé: o vertical nativo não aceita o desenho do jogo */}
          <span className="som-trilho">
            <input
              type="range"
              className="som-slider"
              min={0}
              max={100}
              step={1}
              value={pct}
              aria-label="Volume geral"
              style={{ '--som': `${pct}%` } as CSSProperties}
              onChange={(e) => ajusta(Number(e.target.value) / 100)}
              onPointerUp={() => sfx.click()}
            />
          </span>
          <button
            className="som-mudo"
            title={muted ? 'Ativar som' : 'Silenciar'}
            onClick={() => {
              // tirar do mudo com o volume no zero devolve um volume audível
              if (muted)
                updateSettings({
                  muted: false,
                  volume: volume > 0 ? volume : 0.5,
                });
              else updateSettings({ muted: true });
            }}
          >
            {muted ? '🔇' : '🔈'}
          </button>
        </div>
      )}
    </div>
  );
}
