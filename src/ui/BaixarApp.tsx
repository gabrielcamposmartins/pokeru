import { useEffect, useState } from 'react';
import { isDesktopApp } from '../update/autoUpdate';
import { sfx } from '../audio/sfx';

/**
 * O convite para baixar o app desktop, para quem está jogando pelo navegador
 * (https://pokeru.padoru.org). Dentro do app ele não aparece.
 *
 * O link é o da última release do GitHub com o nome fixo `Pokeru-setup.exe` — cada release sobe
 * uma cópia do instalador com esse nome, além da versionada, e é isso que mantém o link estável.
 */
export const LINK_DO_INSTALADOR = 'https://github.com/gabrielcamposmartins/pokeru/releases/latest/download/Pokeru-setup.exe';

/** true quando o jogo está no navegador (e não no app desktop). */
export function useNoNavegador(): boolean {
  const [web, setWeb] = useState(false);
  useEffect(() => {
    let vivo = true;
    void isDesktopApp().then((desktop) => vivo && setWeb(!desktop));
    return () => {
      vivo = false;
    };
  }, []);
  return web;
}

function IconeBaixar({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z" />
    </svg>
  );
}

/** O botão: redondo no topo do menu, ou largo embaixo do painel de entrada. */
export function BotaoBaixarApp({ jeito }: { jeito: 'topo' | 'largo' }) {
  const web = useNoNavegador();
  if (!web) return null;
  const abrir = () => {
    sfx.click();
    window.open(LINK_DO_INSTALADOR, '_blank', 'noopener');
  };
  if (jeito === 'topo')
    return (
      <button className="round-icon" title="Baixar o app para Windows" aria-label="Baixar o app para Windows" onClick={abrir}>
        <IconeBaixar />
      </button>
    );
  return (
    <button className="btn btn-ghost baixar-app" onClick={abrir}>
      <IconeBaixar /> Baixar o app para Windows
    </button>
  );
}
