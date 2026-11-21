import { describe, expect, it } from 'vitest';
import { gerarPersonagem } from './corpo';
import { montarEsqueleto } from './esqueleto';
import { ENFEITE, TRAJES, costurar } from './roupa';

// malha grossa: o teste confere que a roupa sai inteira e obedece aos ossos, não o acabamento
const GROSSA = { corpo: 0.009, mao: 0.0035 };

describe('a roupa da parte de cima', () => {
  const esq = montarEsqueleto();
  const corpo = gerarPersonagem(GROSSA);
  const feitas = new Map(TRAJES.map((t) => [t.id, costurar(t, esq, corpo, GROSSA)]));
  /** Quantos vértices da roupa há além de `x` (de um lado ou do outro). */
  const alem = (id: string, x: number) => {
    const { pos } = feitas.get(id)!.malha;
    let n = 0;
    for (let v = 0; v < pos.length; v += 3) if (Math.abs(pos[v]) > x) n++;
    return n;
  };

  it('tem um traje para cada personagem do jogo', () => {
    expect(TRAJES.map((t) => t.id)).toEqual(['alistair', 'marina', 'ren', 'tobi', 'violetta', 'yukina']);
  });

  for (const traje of TRAJES) {
    it(`${traje.nome}: sai inteira, colorida, presa aos ossos, e cobre a pele debaixo dela`, () => {
      const r = feitas.get(traje.id)!;
      const n = r.malha.pos.length / 3;
      expect(n).toBeGreaterThan(2000);
      expect(r.malha.cor.length).toBe(n * 3);
      expect(r.malha.cor2.length).toBe(n * 3);
      expect(r.malha.enfeite.length).toBe(n);
      let piorSoma = 0;
      let semOsso = 0;
      let esquerda = 0;
      for (let v = 0; v < n; v++) {
        piorSoma = Math.max(piorSoma, Math.abs(r.pesos[v * 4] + r.pesos[v * 4 + 1] + r.pesos[v * 4 + 2] + r.pesos[v * 4 + 3] - 1));
        // um vértice de roupa preso só à bacia ficou sem osso
        if (r.indices[v * 4] === 0 && r.pesos[v * 4] === 1 && r.malha.pos[v * 3 + 1] > 1.15) semOsso++;
        if (r.malha.pos[v * 3] > 0.3) esquerda++;
      }
      expect(piorSoma).toBeLessThan(1e-4);
      expect(semOsso).toBe(0);
      // todo traje tem alguma coisa nos braços
      expect(esquerda).toBeGreaterThan(100);
      // a roupa cobre parte do corpo, não ele todo (as pernas ficam de fora)
      const coberta = r.coberto.reduce((s, c) => s + c, 0) / r.coberto.length;
      expect(coberta).toBeGreaterThan(0.03);
      expect(coberta).toBeLessThan(0.85);
      for (const i of r.malha.idx) expect(i).toBeLessThan(n);
    });
  }

  it('Alistair e Ren usam luvas inteiras; Marina e Tobi, sem dedos; Violetta e Yukina, mãos nuas', () => {
    // as pontas dos dedos ficam além de x = 0,8; a palma, entre 0,7 e 0,77
    for (const id of ['alistair', 'ren']) expect(alem(id, 0.8)).toBeGreaterThan(50);
    for (const id of ['marina', 'tobi']) {
      expect(alem(id, 0.72)).toBeGreaterThan(50);
      expect(alem(id, 0.82)).toBe(0);
    }
    for (const id of ['violetta', 'yukina']) expect(alem(id, 0.7)).toBe(0);
  });

  it('as mangas arriadas da Marina e do Tobi param no meio do antebraço: dali à luva o braço fica à mostra', () => {
    // o cotovelo fica em x = 0,432 e o punho em 0,68; o meio do antebraço, em 0,556
    for (const id of ['marina', 'tobi']) {
      const { pos } = feitas.get(id)!.malha;
      let noPunhoDaManga = 0;
      let entreAMangaEALuva = 0;
      for (let v = 0; v < pos.length; v += 3) {
        const x = Math.abs(pos[v]);
        if (x > 0.51 && x < 0.556) noPunhoDaManga++;
        if (x > 0.565 && x < 0.65) entreAMangaEALuva++;
      }
      expect(noPunhoDaManga).toBeGreaterThan(20);
      expect(entreAMangaEALuva).toBe(0);
    }
  });

  it('os trajes têm estampa: o dragão do Tobi e do Ren, o canelado dos punhos, a renda da Violetta', () => {
    const tem = (id: string, enfeite: number) => feitas.get(id)!.malha.enfeite.includes(enfeite);
    expect(tem('tobi', ENFEITE.dragao)).toBe(true);
    expect(tem('tobi', ENFEITE.canelado)).toBe(true);
    expect(tem('ren', ENFEITE.dragaoE)).toBe(true);
    expect(tem('marina', ENFEITE.canelado)).toBe(true);
    expect(tem('violetta', ENFEITE.renda)).toBe(true);
  });

  it('as partes soltas são pano: as mangas da Yukina, a jaqueta e as mangas arriadas da Marina, as mangas arriadas do Tobi, o casaco do Alistair, os babados da Violetta', () => {
    const panos = (id: string) => (TRAJES.find((t) => t.id === id)!.panos?.() ?? []).map((p) => p.nome);
    expect(panos('yukina')).toEqual(['manga.E', 'manga.D']);
    expect(panos('marina')).toEqual(['jaqueta', 'manga.E', 'manga.D']);
    expect(panos('alistair')).toEqual(['casaco']);
    expect(panos('violetta')).toEqual(['babado.E', 'babado.D', 'renda.E', 'renda.D']);
    expect(panos('ren')).toEqual([]);
    expect(panos('tobi')).toEqual(['manga.E', 'manga.D']);
  });
});

describe('as luvas que o jogador escolhe', () => {
  const FEITIOS = ['inteira', 'sem-dedos', 'tatica', 'renda', 'opera', 'manopla'] as const;
  const estilo = (feitio: (typeof FEITIOS)[number] | 'nenhuma') => ({ feitio, cor: '#222222', cor2: '#555555', cor3: '#e0ad3e' });

  it('cada feitio tem as peças dele, todas marcadas como da luva; sem luvas, nenhuma', async () => {
    const { pecasDaLuva } = await import('./roupa');
    expect(pecasDaLuva(estilo('nenhuma'))).toEqual([]);
    for (const f of FEITIOS) {
      const pecas = pecasDaLuva(estilo(f));
      expect(pecas.length, f).toBeGreaterThanOrEqual(2);
      for (const p of pecas) expect(p.luva, f).toBe(true);
    }
  });

  it('a luva escolhida entra no lugar da do traje, e o resto do traje fica', async () => {
    const { TRAJES, pecasDoTraje } = await import('./roupa');
    for (const traje of TRAJES) {
      const dele = traje.pecas();
      const semLuva = pecasDoTraje(traje, estilo('nenhuma'));
      expect(semLuva.some((p) => p.luva), traje.id).toBe(false);
      expect(semLuva).toHaveLength(dele.filter((p) => !p.luva).length);
      const comOpera = pecasDoTraje(traje, estilo('opera'));
      expect(comOpera.filter((p) => p.luva).length, traje.id).toBeGreaterThanOrEqual(2);
      // (sem estilo, é o traje como ele é)
      expect(pecasDoTraje(traje)).toHaveLength(dele.length);
    }
  });

  it('a de meio dedo é aberta nas costas da mão, deixa as pontas dos dedos de fora e cobre a palma', async () => {
    const { pecasDaLuva } = await import('./roupa');
    const { juntas } = await import('./corpo');
    const J = juntas();
    const [corpo] = pecasDaLuva(estilo('sem-dedos'));
    const dentro = (x: number, y: number, z: number) => corpo.forma.d(x, y, z) < 0;
    /** Sobe (ou desce) de bem longe até achar o pano: há luva nesta linha vertical, deste lado da mão? */
    const temPano = (x: number, z: number, deCima: boolean) => {
      for (let k = 0; k < 400; k++) {
        const y = J.punho[1] + (deCima ? 1 : -1) * (0.04 - k * 0.0001);
        if (dentro(x, y, z)) return true;
      }
      return false;
    };
    const meioZ = (J.dedos[1].raiz[2] + J.dedos[2].raiz[2]) / 2 + 0.0015;
    // no meio das costas da mão, a abertura: não há pano por cima; por baixo (a palma), há
    expect(temPano(J.punho[0] + 0.049, meioZ, true)).toBe(false);
    expect(temPano(J.punho[0] + 0.049, meioZ, false)).toBe(true);
    // fora da abertura, perto do punho, há pano por cima
    expect(temPano(J.punho[0] + 0.02, meioZ, true)).toBe(true);
    // e a ponta do dedo médio fica de fora
    const d = J.dedos[1];
    expect(temPano(d.raiz[0] + d.rumo[0] * d.j2, d.raiz[2] + d.rumo[2] * d.j2, true)).toBe(false);
  });

  it('a de ópera sobe pelo antebraço; a de passeio acaba no punho', async () => {
    const { pecasDaLuva } = await import('./roupa');
    const { juntas } = await import('./corpo');
    const J = juntas();
    const alcanca = (f: 'opera' | 'inteira', x: number) => {
      const [corpo] = pecasDaLuva(estilo(f));
      for (let k = 0; k < 500; k++) if (corpo.forma.d(x, J.punho[1] + 0.05 - k * 0.0001, J.punho[2]) < 0) return true;
      return false;
    };
    expect(alcanca('opera', J.punho[0] - 0.08)).toBe(true);
    expect(alcanca('inteira', J.punho[0] - 0.08)).toBe(false);
    expect(alcanca('inteira', J.punho[0] + 0.03)).toBe(true);
  });
});

