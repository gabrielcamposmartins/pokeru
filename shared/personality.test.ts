import { describe, expect, it } from 'vitest';
import {
  NEUTRA,
  PARTIDAS_LEMBRADAS,
  PERSONALIDADES,
  TRACOS,
  estiloDoBot,
  personalidadeDasPartidas,
  personalidadeDe,
  resumoVazio,
  somarResumos,
  tagsDe,
  taxa,
  tracoDominante,
  ultimasPartidas,
  type Personalidade,
  type ResumoDaPartida,
} from './personality';
import { CHARACTER_PRESETS } from './styles';

/**
 * A personalidade.
 *
 * O que estes testes protegem é o que o gráfico promete: que o número diz alguma coisa sobre a
 * pessoa. Um traço que sobe com pouca amostra, ou que mede a coisa errada, transforma o perfil
 * numa decoração — e ninguém percebe o erro, porque um gráfico bonito parece sempre verdadeiro.
 */

const partida = (r: Partial<ResumoDaPartida> = {}, at = '2026-09-20T00:00:00.000Z'): ResumoDaPartida => ({
  ...resumoVazio(at),
  ...r,
});

describe('o peso da dúvida', () => {
  it('sem amostra nenhuma, todo traço fica no meio', () => {
    const p = personalidadeDe(resumoVazio());
    for (const t of TRACOS) expect(p[t.id], t.id).toBeCloseTo(0.5, 6);
  });

  it('uma única observação não leva o traço para a ponta', () => {
    // blefou na única aposta que fez: longe de virar "o blefador"
    const p = personalidadeDe(partida({ maos: 1, agressoes: 1, blefes: 1 }));
    expect(p.blefe).toBeGreaterThan(0.5);
    expect(p.blefe).toBeLessThan(0.65);
  });

  it('com muita amostra, o traço chega perto do que de fato aconteceu', () => {
    const p = personalidadeDe(partida({ maos: 200, agressoes: 200, blefes: 180 }));
    expect(p.blefe).toBeGreaterThan(0.82);
  });

  it('a taxa nunca sai de 0 a 1, nem com contagem torta', () => {
    for (const [parte, total] of [
      [0, 0],
      [5, 0],
      [-3, 10],
      [10, 10],
      [1, 1000],
    ]) {
      const v = taxa(parte, total);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('cada traço mede a sua coisa', () => {
  const muito = 120;

  it('agressão separa quem aposta de quem paga', () => {
    const agressivo = personalidadeDe(partida({ maos: muito, agressoes: 100, pagadas: 10, passadas: 10 }));
    const passivo = personalidadeDe(partida({ maos: muito, agressoes: 10, pagadas: 60, passadas: 50 }));
    expect(agressivo.agressao).toBeGreaterThan(0.7);
    expect(passivo.agressao).toBeLessThan(0.3);
  });

  it('cautela é não entrar: quem paga tudo não é cauteloso, mesmo desistindo depois', () => {
    const seletivo = personalidadeDe(partida({ maos: muito, entradas: 12 }));
    const solto = personalidadeDe(partida({ maos: muito, entradas: 110 }));
    expect(seletivo.cautela).toBeGreaterThan(0.8);
    expect(solto.cautela).toBeLessThan(0.2);
  });

  it('blefe é apostar sem carta, e não apostar muito', () => {
    // dois jogadores igualmente agressivos: só um aposta sem nada
    const comCarta = personalidadeDe(partida({ maos: muito, agressoes: 80, blefes: 4 }));
    const semCarta = personalidadeDe(partida({ maos: muito, agressoes: 80, blefes: 64 }));
    expect(comCarta.agressao).toBeCloseTo(semCarta.agressao, 6);
    expect(semCarta.blefe - comCarta.blefe).toBeGreaterThan(0.5);
  });

  it('teimosia é pagar a última, e só conta onde houve a chance', () => {
    const teimoso = personalidadeDe(partida({ maos: muito, ultimasRuas: 40, pagouAteOFim: 36 }));
    const desistente = personalidadeDe(partida({ maos: muito, ultimasRuas: 40, pagouAteOFim: 2 }));
    expect(teimoso.teimosia).toBeGreaterThan(0.75);
    expect(desistente.teimosia).toBeLessThan(0.25);
    // quem nunca chegou lá não é nem uma coisa nem outra
    expect(personalidadeDe(partida({ maos: muito })).teimosia).toBeCloseTo(0.5, 6);
  });

  it('faro é ganhar o que se leva ao showdown', () => {
    const bom = personalidadeDe(partida({ maos: muito, showdowns: 30, showdownsGanhos: 26 }));
    const ruim = personalidadeDe(partida({ maos: muito, showdowns: 30, showdownsGanhos: 3 }));
    expect(bom.faro).toBeGreaterThan(0.7);
    expect(ruim.faro).toBeLessThan(0.3);
  });
});

describe('a janela das últimas partidas', () => {
  const muitas = Array.from({ length: 30 }, (_, i) =>
    partida({ maos: 10, agressoes: 10, blefes: i < 20 ? 0 : 10 }, `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
  );

  it('só as dez mais recentes contam', () => {
    expect(ultimasPartidas(muitas)).toHaveLength(PARTIDAS_LEMBRADAS);
    // as dez últimas são as que blefam
    expect(personalidadeDasPartidas(muitas).blefe).toBeGreaterThan(0.85);
  });

  it('a ordem da lista não muda o resultado', () => {
    const baralhada = [...muitas].reverse();
    expect(personalidadeDasPartidas(baralhada)).toEqual(personalidadeDasPartidas(muitas));
  });

  it('somar partidas soma campo a campo, e guarda a data mais nova', () => {
    const t = somarResumos([partida({ maos: 3 }, '2026-01-01T00:00:00.000Z'), partida({ maos: 4 }, '2026-05-05T00:00:00.000Z')]);
    expect(t.maos).toBe(7);
    expect(t.at).toBe('2026-05-05T00:00:00.000Z');
  });

  it('o jeito de jogar muda quando a pessoa muda', () => {
    const antes = Array.from({ length: 10 }, () => partida({ maos: 20, entradas: 2 }, '2026-08-01T00:00:00.000Z'));
    const depois = Array.from({ length: 10 }, () => partida({ maos: 20, entradas: 19 }, '2026-09-01T00:00:00.000Z'));
    expect(personalidadeDasPartidas(antes).cautela).toBeGreaterThan(0.85);
    expect(personalidadeDasPartidas([...antes, ...depois]).cautela).toBeLessThan(0.2);
  });
});

describe('etiquetas', () => {
  it('quem não se destaca em nada não ganha etiqueta', () => {
    expect(tagsDe(NEUTRA)).toEqual([]);
    // mas ainda há um traço mais alto que os outros, para quando é preciso dizer algo
    expect(tracoDominante({ ...NEUTRA, faro: 0.51 }).id).toBe('faro');
  });

  it('as etiquetas saem do mais marcante para o menos, e não passam de três', () => {
    const p: Personalidade = { blefe: 0.9, agressao: 0.8, risco: 0.7, cautela: 0.65, teimosia: 0.2, faro: 0.5 };
    expect(tagsDe(p).map((t) => t.id)).toEqual(['blefe', 'agressao', 'risco']);
  });
});

describe('a personalidade dos bots', () => {
  it('todo personagem tem uma, e todos os seis traços', () => {
    for (const c of CHARACTER_PRESETS) {
      const p = PERSONALIDADES[c.id];
      expect(p, c.id).toBeTruthy();
      for (const t of TRACOS) {
        expect(p[t.id], `${c.id}/${t.id}`).toBeGreaterThanOrEqual(0);
        expect(p[t.id], `${c.id}/${t.id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('nenhum personagem é igual a outro: a mesa teria quatro bots com a mesma cara', () => {
    const vistos = new Set(CHARACTER_PRESETS.map((c) => TRACOS.map((t) => PERSONALIDADES[c.id][t.id]).join(',')));
    expect(vistos.size).toBe(CHARACTER_PRESETS.length);
  });

  it('cada um tem alguma coisa que salta: quatro personagens mornos não são quatro personagens', () => {
    for (const c of CHARACTER_PRESETS) {
      expect(tagsDe(PERSONALIDADES[c.id]).length, c.id).toBeGreaterThan(0);
    }
  });
});

describe('o traço manda na mesa', () => {
  it('sem personalidade, o estilo é exatamente o da dificuldade', () => {
    expect(estiloDoBot('normal')).toEqual(estiloDoBot('normal', undefined));
    expect(estiloDoBot('hard').iters).toBeGreaterThan(estiloDoBot('easy').iters);
    expect(estiloDoBot('hard').noise).toBeLessThan(estiloDoBot('easy').noise);
  });

  it('quem blefa no papel blefa na mesa', () => {
    const base = estiloDoBot('normal');
    expect(estiloDoBot('normal', PERSONALIDADES.yukina).bluff).toBeGreaterThan(base.bluff);
    expect(estiloDoBot('normal', PERSONALIDADES.ren).bluff).toBeLessThan(base.bluff);
  });

  it('a agressão, o tamanho da aposta e a teimosia seguem o traço', () => {
    const marina = estiloDoBot('normal', PERSONALIDADES.marina);
    const ren = estiloDoBot('normal', PERSONALIDADES.ren);
    const tobi = estiloDoBot('normal', PERSONALIDADES.tobi);
    expect(marina.aggression).toBeGreaterThan(ren.aggression);
    expect(tobi.bet).toBeGreaterThan(ren.bet);
    expect(tobi.callDown).toBeGreaterThan(ren.callDown);
  });

  it('o faro ajusta a dificuldade: quem lê melhor simula mais e erra menos', () => {
    const base = estiloDoBot('normal');
    const atento = estiloDoBot('normal', PERSONALIDADES.ren);
    const distraido = estiloDoBot('normal', PERSONALIDADES.tobi);
    expect(atento.iters).toBeGreaterThan(base.iters);
    expect(atento.noise).toBeLessThan(base.noise);
    expect(distraido.iters).toBeLessThan(base.iters);
  });

  it('nenhum ajuste sai da faixa que a mesa aguenta', () => {
    const extremos: Personalidade[] = [
      { blefe: 1, agressao: 1, risco: 1, cautela: 1, teimosia: 1, faro: 1 },
      { blefe: 0, agressao: 0, risco: 0, cautela: 0, teimosia: 0, faro: 0 },
    ];
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (const p of extremos) {
        const e = estiloDoBot(d, p);
        expect(e.iters).toBeGreaterThan(0);
        expect(e.noise).toBeGreaterThan(0);
        expect(e.bluff).toBeGreaterThanOrEqual(0);
        expect(e.bluff).toBeLessThanOrEqual(0.35);
        expect(e.aggression).toBeGreaterThan(0);
        expect(e.aggression).toBeLessThan(1);
        expect(e.bet).toBeGreaterThan(0.5);
        expect(e.callDown).toBeLessThanOrEqual(0.9);
      }
    }
  });
});
