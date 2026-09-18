import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findCharacter } from '../../shared/styles';
import { comumText, falaText } from '../audio/falas';
import { voiceUrl } from '../audio/voice';
import { BOND_MAX, BOND_MISSIONS, BOND_POINTS, EMPTY_BOND, HEART_COST, rewardsOf } from './bond';
import { BondPageView } from './BondPage';

const marina = findCharacter('marina');
const stats = (points: number) => ({ ...EMPTY_BOND, points, wins: 4, losses: 6, folds: 11, hands: 21, matches: 2 });
const page = (points: number) => renderToStaticMarkup(<BondPageView char={marina} st={stats(points)} onClose={() => {}} />);

describe('página de vínculo', () => {
  it('abre com o personagem, os pontos e o que falta para o próximo coração', () => {
    const html = page(HEART_COST[0]);
    expect(html).toContain('Vínculo com Marina');
    expect(html).toContain('A Fênix da Mesa');
    expect(html).toContain(`${HEART_COST[0]} <small>pts</small>`);
    expect(html).toContain('1 de 5 corações');
    // o próximo coração vem com o nome da recompensa dele
    expect(html).toContain(rewardsOf(marina)[1].name);
  });

  it('lista as missões com os pontos e o que você já fez', () => {
    const html = page(0);
    expect(html).toContain('Missões');
    for (const m of BOND_MISSIONS) {
      expect(html, m.ev).toContain(m.label);
      expect(html, m.ev).toContain(`+${BOND_POINTS[m.ev]}`);
    }
    expect(html).toContain('desistências');
  });

  it('a recompensa de voz mostra o momento, a fala, a tradução e o arquivo do áudio', () => {
    const reward = rewardsOf(marina).find((r) => r.voice === 'showdown')!;
    const fala = falaText('marina', 'showdown')!;
    const html = page(BOND_MAX);
    expect(html).toContain(reward.name);
    expect(html).toContain('Ao abrir as cartas (showdown)');
    expect(html).toContain(fala.text);
    expect(html).toContain(fala.pt);
    // o áudio existe: a página nomeia o arquivo e o botão de ouvir fica ativo
    const file = decodeURIComponent(voiceUrl('marina', 'fala', 'showdown')!.split('/').pop()!);
    expect(html).toContain(file.replace(/</g, '&lt;'));
    expect(html).toContain('♪ Ouvir');
    expect(html).not.toContain('Complete o 1º coração para ouvir');
    // e diz qual chamada comum ela substitui
    expect(html).toContain(comumText('show')!.text);
  });

  it('a voz ainda travada diz qual coração falta', () => {
    const html = page(0);
    expect(html).toContain('Complete o 1º coração para ouvir');
    expect(html).toContain('disabled');
  });

  it('as recompensas que ainda não existem aparecem como "em breve"', () => {
    const html = page(BOND_MAX);
    const soon = rewardsOf(marina).filter((r) => r.soon);
    expect(soon.length).toBeGreaterThan(0);
    for (const r of soon) expect(html, r.id).toContain(r.name);
    expect(html).toContain('Em breve');
    expect(html).toContain('chega numa atualização');
  });

  it('com o vínculo completo, todas as recompensas aparecem recebidas', () => {
    const html = page(BOND_MAX);
    expect(html).toContain('Vínculo completo');
    expect(html.match(/Recebida/g)).toHaveLength(rewardsOf(marina).filter((r) => !r.soon).length);
  });
});
