import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Opening, OpeningPlayer } from '../../shared/protocol';
import { BACK_PRESETS, CHARACTER_PRESETS, FACE_PRESETS } from '../../shared/styles';
import { OpeningView } from './Opening';

/**
 * A abertura mostra o que cada um montou. O que este teste cobra é justamente isso: título, nível
 * e as cartas de cada jogador no card certo — e a faixa de pronto só em quem confirmou.
 */

function jogador(over: Partial<OpeningPlayer> = {}): OpeningPlayer {
  return {
    seat: 0,
    name: 'Gabi',
    isBot: false,
    title: null,
    level: 1,
    character: CHARACTER_PRESETS[0],
    face: FACE_PRESETS[0],
    back: BACK_PRESETS[0],
    ready: false,
    ...over,
  };
}

const render = (opening: Opening, mySeat: number | null = null) => renderToStaticMarkup(<OpeningView opening={opening} mySeat={mySeat} />);

describe('abertura: o card de cada jogador', () => {
  it('leva título, nível e a faixa de pronto de quem confirmou', () => {
    const html = render({
      waitMs: 12_000,
      players: [
        jogador({ seat: 0, name: 'Gabi', title: 'Tubarão', level: 12, ready: true }),
        jogador({ seat: 1, name: 'Marina', title: null, level: 3, ready: false }),
      ],
    });

    expect(html).toContain('Tubarão');
    expect(html).toContain('Nv. 12');
    expect(html).toContain('Nv. 3');
    // uma faixa só: a de quem está pronto
    expect([...html.matchAll(/pm-ribbon/g)]).toHaveLength(1);
    expect(html).toContain('PRONTO');
    // quem não confirmou aparece com os pontinhos de carregando
    expect(html).toContain('pm-loading');
  });

  it('bot aparece como BOT, sem nível inventado', () => {
    const html = render({ waitMs: 12_000, players: [jogador({ name: 'Bot Ren', isBot: true, level: 0, ready: true })] });
    expect(html).toContain('>BOT<');
    expect(html).not.toContain('Nv. 0');
  });

  it('sempre duas linhas, com o de sobra em cima', () => {
    const seis = render({ waitMs: 12_000, players: [0, 1, 2, 3, 4, 5].map((i) => jogador({ seat: i, name: `J${i}` })) });
    expect([...seis.matchAll(/class="pm-row"/g)]).toHaveLength(2);
    // 3 e 3: a primeira linha fecha antes da segunda começar
    const [antes, depois] = seis.split('class="pm-row"').slice(1);
    expect([...antes.matchAll(/pm-card/g)].length).toBe(3);
    expect([...depois.matchAll(/pm-card/g)].length).toBe(3);

    // com cinco, a de cima leva o extra — e continuam sendo duas linhas
    const cinco = render({ waitMs: 12_000, players: [0, 1, 2, 3, 4].map((i) => jogador({ seat: i, name: `J${i}` })) });
    expect([...cinco.matchAll(/class="pm-row"/g)]).toHaveLength(2);
    const [a5, b5] = cinco.split('class="pm-row"').slice(1);
    expect([...a5.matchAll(/pm-card/g)].length).toBe(3);
    expect([...b5.matchAll(/pm-card/g)].length).toBe(2);

    // e com dois também: uma em cada linha
    const dois = render({ waitMs: 12_000, players: [0, 1].map((i) => jogador({ seat: i, name: `J${i}` })) });
    expect([...dois.matchAll(/class="pm-row"/g)]).toHaveLength(2);
  });

  it('mesa vazia não quebra a tela', () => {
    const html = render({ waitMs: 12_000, players: [] });
    expect(html).toContain('Preparando a mesa');
    expect(html).toContain('todos prontos');
  });
});
