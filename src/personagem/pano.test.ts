import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { aplicar, criarClipes } from './animacoes';
import { Boneco, MESA } from './boneco';
import { montarEsqueleto } from './esqueleto';
import { Pano, type DefDePano, type MesaDoPano } from './pano';
import { TRAJES } from './roupa';

const mesa: MesaDoPano = { y: MESA, z0: 0.08, alto: 0.6 };

// (simular o pano leva alguns segundos; com a suíte inteira rodando junto, mais)
vi.setConfig({ testTimeout: 60_000 });

describe('o pano solto da roupa', () => {
  const b = new Boneco(montarEsqueleto());
  const clipes = criarClipes(b);
  const def = (traje: string, nome: string): DefDePano => TRAJES.find((t) => t.id === traje)!.panos!().find((p) => p.nome === nome)!;
  /** Põe as mãos na mesa (o descanso de mãos planas) e deixa o pano assentar. */
  const naMesa = (pano: Pano) => {
    aplicar(b, clipes.find((c) => c.id === 'idle-plana')!, 0);
    b.raiz.updateMatrixWorld(true);
    pano.recolocar();
    pano.assentar(mesa, 160);
  };
  /** Confere que o pano está inteiro: sem número estragado, fora da mesa e sem esticar demais. */
  const inteiro = (pano: Pano) => {
    let dentro = 0;
    for (let k = 0; k < pano.n; k++) {
      if (!pano.livre(k)) continue;
      const [x, y, z] = [pano.pos[k * 3], pano.pos[k * 3 + 1], pano.pos[k * 3 + 2]];
      expect(Number.isFinite(x + y + z)).toBe(true);
      if (z > mesa.z0 && y < mesa.y - 0.0005) dentro++;
    }
    expect(dentro).toBe(0);
    // (quase todos os elásticos perto do comprimento deles; uns poucos, junto de onde o pano é preso, esticam mais)
    expect(pano.esticado(0.95)).toBeLessThan(0.4);
  };

  it('a manga da Yukina pende do braço na T-pose', () => {
    const d = def('yukina', 'manga.E');
    const pano = new Pano(b, d);
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    pano.recolocar();
    pano.assentar(null, 160);
    let maisBaixo = Infinity;
    for (let k = 0; k < pano.n; k++) maisBaixo = Math.min(maisBaixo, pano.pos[k * 3 + 1]);
    // o braço fica a 1,40 m: a boca da manga cai bem abaixo dele, mas não se desfaz
    expect(maisBaixo).toBeLessThan(1.28);
    expect(maisBaixo).toBeGreaterThan(1.05);
    expect(pano.esticado(0.95)).toBeLessThan(0.4);
  });

  it('com as mãos na mesa, a manga da Yukina pousa no tampo sem entrar nele, e o braço continua dentro dela', () => {
    const d = def('yukina', 'manga.E');
    const pano = new Pano(b, d);
    naMesa(pano);
    inteiro(pano);
    // o anel de pano perto do punho ainda dá a volta no antebraço (não escapou para o lado)
    const cotovelo = new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.E').matrixWorld);
    const punho = new THREE.Vector3().setFromMatrixPosition(b.osso('mao.E').matrixWorld);
    const eixo = punho.clone().sub(cotovelo).normalize();
    for (const r of [12, 18, 24]) {
      const anel = Array.from({ length: d.cols }, (_, c) => new THREE.Vector3(pano.pos[(r * d.cols + c) * 3], pano.pos[(r * d.cols + c) * 3 + 1], pano.pos[(r * d.cols + c) * 3 + 2]));
      const centro = anel.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / anel.length);
      const noEixo = cotovelo.clone().add(eixo.clone().multiplyScalar(Math.min(punho.distanceTo(cotovelo), Math.max(0, centro.clone().sub(cotovelo).dot(eixo)))));
      const u = new THREE.Vector3(0, 1, 0).cross(eixo).normalize();
      const v = eixo.clone().cross(u);
      let voltas = 0;
      anel.forEach((p, c) => {
        const de = p.clone().sub(noEixo);
        const ate = anel[(c + 1) % anel.length].clone().sub(noEixo);
        let giro = Math.atan2(ate.dot(v), ate.dot(u)) - Math.atan2(de.dot(v), de.dot(u));
        if (giro > Math.PI) giro -= 2 * Math.PI;
        if (giro < -Math.PI) giro += 2 * Math.PI;
        voltas += giro;
      });
      expect(Math.abs(Math.round(voltas / (2 * Math.PI)))).toBe(1);
    }
  });

  it('pousado, o pano para de se mexer', () => {
    for (const [traje, nome] of [['yukina', 'manga.E'], ['marina', 'manga.D']]) {
      const pano = new Pano(b, def(traje, nome));
      aplicar(b, clipes.find((c) => c.id === 'idle-plana')!, 0);
      b.raiz.updateMatrixWorld(true);
      pano.recolocar();
      for (let k = 0; k < 420; k++) pano.passo(1 / 60, mesa);
      // depois de sete segundos, o quanto o ponto que mais anda ainda anda num quadro
      const antes = new Float32Array(pano.pos);
      pano.passo(1 / 60, mesa);
      let pior = 0;
      for (let k = 0; k < pano.n; k++) pior = Math.max(pior, Math.hypot(pano.pos[k * 3] - antes[k * 3], pano.pos[k * 3 + 1] - antes[k * 3 + 1], pano.pos[k * 3 + 2] - antes[k * 3 + 2]));
      expect(pior).toBeLessThan(0.00005);
    }
  });

  it('as mangas arriadas do Tobi e da Marina têm mais pano do que braço, juntam volume em cima do punho e deixam à mostra a metade do antebraço', () => {
    for (const traje of ['tobi', 'marina']) {
      const d = def(traje, 'manga.E');
      expect(d.medida).toBeDefined();
      // o pano de verdade é mais comprido do que o trecho de braço que ele veste
      const naPose = Math.abs(d.repouso(0, d.rows - 1)[0] - d.repouso(0, 0)[0]);
      const deVerdade = Math.abs(d.medida!(0, d.rows - 1)[0] - d.medida!(0, 0)[0]);
      expect(deVerdade / naPose).toBeGreaterThan(1.2);
      const pano = new Pano(b, d);
      naMesa(pano);
      inteiro(pano);
      // ao longo do antebraço (0 = cotovelo, 1 = punho): onde há pano, e a que distância do osso
      const cotovelo = new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.E').matrixWorld);
      const punho = new THREE.Vector3().setFromMatrixPosition(b.osso('mao.E').matrixWorld);
      const eixo = punho.clone().sub(cotovelo);
      const comprimento = eixo.length();
      eixo.normalize();
      let longe = 0;
      let ateOnde = 0;
      for (let k = 0; k < pano.n; k++) {
        const p = new THREE.Vector3(pano.pos[k * 3], pano.pos[k * 3 + 1], pano.pos[k * 3 + 2]).sub(cotovelo);
        const t = p.dot(eixo) / comprimento;
        ateOnde = Math.max(ateOnde, t);
        if (t > 0.1 && t < 0.5) longe = Math.max(longe, p.sub(eixo.clone().multiplyScalar(t * comprimento)).length());
      }
      // o volume em cima do punho: ali a manga fica bem mais gorda do que o braço (uns 3 cm de raio)
      expect(longe).toBeGreaterThan(0.05);
      // e o pano não passa do meio do antebraço (com alguma folga, para a dobra que cai por cima do punho)
      expect(ateOnde).toBeLessThan(0.62);
    }
  });

  it('numa mesa de poker (o contorno em estádio), a manga também pousa no tampo sem entrar nele', () => {
    // a mesa da página mesa.html, vista do lugar do jogador: a beirada mais perto 0,12 m à frente dele
    const raio = 0.62;
    const estadio: MesaDoPano = { y: MESA, alto: 0.6, estadio: { a: [0.55, 0.12 + raio], b: [-0.55, 0.12 + raio], raio } };
    const pano = new Pano(b, def('yukina', 'manga.E'));
    aplicar(b, clipes.find((c) => c.id === 'idle-plana')!, 0);
    b.raiz.updateMatrixWorld(true);
    pano.recolocar();
    pano.assentar(estadio, 160);
    let dentro = 0;
    let noTampo = 0;
    for (let k = 0; k < pano.n; k++) {
      if (!pano.livre(k)) continue;
      const [x, y, z] = [pano.pos[k * 3], pano.pos[k * 3 + 1], pano.pos[k * 3 + 2]];
      const naMesa = Math.hypot(Math.max(Math.abs(x) - 0.55, 0), z - (0.12 + raio)) < raio;
      if (naMesa && y < MESA - 0.0005) dentro++;
      if (naMesa && y < MESA + 0.01) noTampo++;
    }
    expect(dentro).toBe(0);
    // e ela pousou mesmo (não ficou no ar)
    expect(noTampo).toBeGreaterThan(20);
  });

  it('a jaqueta da Marina fica presa pelos braços e cai atrás das costas, abaixo dos ombros', () => {
    const d = def('marina', 'jaqueta');
    const pano = new Pano(b, d);
    naMesa(pano);
    inteiro(pano);
    // a gola, no meio das costas: atrás do corpo e abaixo do alto dos ombros (1,45 m)
    const k = (d.cols - 1) / 2;
    expect(pano.pos[k * 3 + 2]).toBeLessThan(-0.05);
    expect(pano.pos[k * 3 + 1]).toBeLessThan(1.4);
    expect(pano.pos[k * 3 + 1]).toBeGreaterThan(1.15);
  });

  it('o casaco do Alistair e os babados da Violetta também assentam sem entrar na mesa', () => {
    for (const [traje, nome] of [['alistair', 'casaco'], ['violetta', 'renda.E'], ['violetta', 'babado.D']]) {
      const pano = new Pano(b, def(traje, nome));
      naMesa(pano);
      inteiro(pano);
    }
  });

  it('o lado de fora do pano é o de fora: as normais da manga apontam para longe do braço', () => {
    for (const nome of ['manga.E', 'manga.D']) {
      const d = def('yukina', nome);
      const pano = new Pano(b, d);
      const nor = pano.geometria.getAttribute('normal');
      let paraFora = 0;
      for (let c = 0; c < d.cols; c++) {
        const k = 10 * d.cols + c;
        // (na T-pose o braço corre ao longo de x, a 1,40 m de altura)
        if (nor.getY(k) * (pano.pos[k * 3 + 1] - 1.4) + nor.getZ(k) * pano.pos[k * 3 + 2] > 0) paraFora++;
      }
      expect(paraFora).toBe(d.cols);
    }
  });

  it('num passo comprido, com o ajudante atrasado, o braço do Goro continua dentro da manga', () => {
    // (era o defeito da mesa cheia: o passo do pano dobrava de tamanho, o pano cedia, e o braço saía
    // pela parede da manga e ficava de fora. Aqui o ajudante atrasa: cada passo simula 1/15 s e a
    // animação anda 0,15 s — o resto do caminho o pano faz levado pelos ossos)
    const estadio: MesaDoPano = { y: MESA, alto: 0.6, estadio: { a: [-0.55, 0.74], b: [0.55, 0.74], raio: 0.62 } };
    for (const [id, anda] of [['fichas', 0.15], ['ganhar', 0.3]] as const) {
      const clipe = clipes.find((c) => c.id === id)!;
      const mangas = ['manga.E', 'manga.D'].map((nome) => new Pano(b, def('goro', nome)));
      aplicar(b, clipe, 0);
      b.raiz.updateMatrixWorld(true);
      for (const m of mangas) {
        m.recolocar();
        m.assentar(estadio, 60);
      }
      let furadas = 0;
      for (let t = 0; t < clipe.dur; t += anda) {
        aplicar(b, clipe, t);
        b.raiz.updateMatrixWorld(true);
        for (const m of mangas) {
          m.passo(1 / 15, estadio, 1 - 1 / 15 / anda);
          if (m.furada()) furadas++;
        }
      }
      expect(furadas).toBe(0);
      // (e sem precisar da rede de segurança)
      expect(mangas.reduce((n, m) => n + m.remendos, 0)).toBe(0);
    }
  });

  it('recomeçada do lugar, a manga fica sempre em volta do braço (é do que a rede de segurança depende)', () => {
    for (const traje of ['goro', 'alistair', 'zuzu']) {
      const manga = new Pano(b, def(traje, 'manga.D'));
      for (const id of ['fichas', 'olhar', 'entregar', 'idle-sobrepostas']) {
        const clipe = clipes.find((c) => c.id === id)!;
        for (let t = 0; t < clipe.dur; t += 0.7) {
          aplicar(b, clipe, t);
          b.raiz.updateMatrixWorld(true);
          manga.recolocar();
          expect(manga.furada()).toBe(false);
        }
      }
    }
  });

  it('a rede de segurança: a manga que ficou com o braço de fora recomeça do lugar', () => {
    const manga = new Pano(b, def('goro', 'manga.D'));
    naMesa(manga);
    expect(manga.furada()).toBe(false);
    // tira a manga do braço à força: o pano inteiro um palmo para cima, com o braço por baixo dele
    const x = (manga as unknown as { x: Float64Array; antes: Float64Array }).x;
    const antes = (manga as unknown as { x: Float64Array; antes: Float64Array }).antes;
    for (let k = 0; k < manga.n; k++) {
      if (!manga.livre(k)) continue;
      x[k * 3 + 1] += 0.22;
      antes[k * 3 + 1] += 0.22;
    }
    manga.pos.set(x);
    expect(manga.furada()).toBe(true);
    for (let k = 0; k < 8; k++) manga.passo(1 / 60, mesa);
    expect(manga.remendos).toBe(1);
    expect(manga.furada()).toBe(false);
    inteiro(manga);
  });

  it('o pano engomado (dureza de 1 a 2) tem os mesmos elásticos, mais fortes, e a manga dele quebra no cotovelo', () => {
    const d = def('alistair', 'manga.E');
    expect(d.dureza).toBeGreaterThan(1);
    // (os mesmos elásticos: o passo do pano engomado custa o que custa o do encorpado)
    const elasticos = (dureza: number) => (new Pano(b, { ...d, dobra: undefined, dureza }) as unknown as { forca: number[] }).forca;
    expect(elasticos(2).length).toBe(elasticos(1).length);
    const soma = (f: number[]) => f.reduce((t, x) => t + x, 0);
    expect(soma(elasticos(2))).toBeGreaterThan(soma(elasticos(1)) * 1.15);
    // no cotovelo (a 0,432 m ao longo do braço) ela dobra como pano comum; longe dele, com a dureza inteira
    const noCotovelo = Math.round(((0.432 - 0.15) / (0.618 - 0.15)) * (d.rows - 1));
    expect(d.dobra!(0, noCotovelo)).toBeLessThan(0.3);
    expect(d.dobra!(0, 4)).toBe(1);
    expect(d.dobra!(0, d.rows - 4)).toBe(1);
    // e assenta na mesa inteira, como os outros
    const pano = new Pano(b, d);
    naMesa(pano);
    inteiro(pano);
    expect(pano.furada()).toBe(false);
  });
});
