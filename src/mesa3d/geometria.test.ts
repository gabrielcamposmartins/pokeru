import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ABERTAS_AO_VIRAR, BARALHO_NA_MESA, aplicar, entregarCartas, olhar, pegarBaralho, poseDe, virarAPilha } from '../personagem/animacoes';
import { Boneco, MESA } from '../personagem/boneco';
import { montarEsqueleto } from '../personagem/esqueleto';
import { STAGE_H, STAGE_W } from '../game/layout';
import {
  ABERTAS,
  ALTURA_DA_MESA,
  CAMERA_DO_JOGO,
  GIRO_DO_BARALHO,
  MARCAS,
  MEIO,
  RAIO,
  RECUO,
  TRILHO,
  homografia,
  lenteDaTela,
  lugares,
  mundoParaPlano,
  noMundo,
  pelaHomografia,
  planoParaMundo,
  projetar,
  projetarMundo,
  seatLayout3d,
} from './geometria';

/** A que distância um ponto (x, z) está para dentro da beirada do estádio de raio `raio` (negativo: fora). */
const dentro = (x: number, z: number, raio = RAIO) => raio - Math.hypot(Math.max(Math.abs(x) - MEIO, 0), z);

describe('mesa 3D: o estádio e os assentos', () => {
  it('o tampo fica na mesma altura das animações', () => {
    expect(ALTURA_DA_MESA).toBe(MESA);
  });

  it('o assento 0 é o do jogador: no meio do lado de baixo, olhando para a mesa', () => {
    const [eu] = lugares(6);
    expect(eu.x).toBeCloseTo(0, 9);
    expect(eu.z).toBeCloseTo(RAIO + RECUO, 9);
    // o personagem é modelado olhando para +z: girado, a frente dele aponta para o meio da mesa (-z)
    const frente = noMundo(eu, 0, 1);
    expect(frente.z).toBeLessThan(eu.z);
    expect(frente.x).toBeCloseTo(0, 9);
  });

  it('os lugares seguem no sentido do jogo: o próximo fica à esquerda do jogador na tela', () => {
    for (const n of [3, 4, 5, 6]) expect(lugares(n)[1].x).toBeLessThan(0);
    // com quatro: embaixo, ponta esquerda, em cima, ponta direita
    const q = lugares(4);
    expect(q[1].z).toBeCloseTo(0, 9);
    expect(q[1].x).toBeCloseTo(-(MEIO + RAIO + RECUO), 9);
    expect(q[2].z).toBeCloseTo(-(RAIO + RECUO), 9);
    expect(q[3].x).toBeCloseTo(MEIO + RAIO + RECUO, 9);
  });

  it('cada personagem fica atrás da beirada, à mesma distância, e os lugares não se encostam', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const ls = lugares(n);
      expect(ls).toHaveLength(n);
      for (const l of ls) {
        expect(dentro(l.x, l.z)).toBeCloseTo(-RECUO, 6);
        expect(dentro(l.beirada.x, l.beirada.z)).toBeCloseTo(0, 6);
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(ls[i].x - ls[j].x, ls[i].z - ls[j].z)).toBeGreaterThan(0.6);
    }
  });

  it('as cartas, a aposta e a pilha de cada assento caem no feltro, e as cartas mais perto do dono que a aposta', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (const g of seatLayout3d(n, 0, true)) {
        for (const p of [g.cards, g.bet, g.dealer, g.deck]) {
          const w = planoParaMundo(p);
          expect(dentro(w.x, w.z, RAIO - TRILHO)).toBeGreaterThan(0.03);
        }
        const doDono = (p: { x: number; y: number }) => Math.hypot(p.x - g.edge.x, p.y - g.edge.y);
        expect(doDono(g.cards)).toBeLessThan(doDono(g.bet));
      }
    }
  });

  it('o plano da mesa e o tampo vão e voltam sem perder nada', () => {
    const p = { x: 1234, y: 321 };
    const w = planoParaMundo(p);
    const q = mundoParaPlano(w.x, w.z);
    expect(q.x).toBeCloseTo(p.x, 9);
    expect(q.y).toBeCloseTo(p.y, 9);
    expect(planoParaMundo({ x: 800, y: 550 })).toEqual({ x: 0, z: 0 });
  });
});

describe('mesa 3D: a câmera e a camada 2D deitada no tampo', () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_DO_JOGO.fov, STAGE_W / STAGE_H, 0.02, 60);
  camera.position.set(...CAMERA_DO_JOGO.posicao);
  camera.lookAt(new THREE.Vector3(...CAMERA_DO_JOGO.alvo));
  camera.updateMatrixWorld(true);

  it('a projeção é a mesma da câmera do three.js (é ela que desenha o canvas)', () => {
    for (const [x, y, z] of [
      [0, ALTURA_DA_MESA, 0],
      [-0.8, ALTURA_DA_MESA, 0.3],
      [0.5, 1.4, -0.4],
      [1.1, ALTURA_DA_MESA, 0.5],
    ]) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const p = projetarMundo(x, y, z);
      expect(p.x).toBeCloseTo(((v.x + 1) / 2) * STAGE_W, 6);
      expect(p.y).toBeCloseTo(((1 - v.y) / 2) * STAGE_H, 6);
    }
  });

  it('a tela que passa do palco usa a mesma lente: o meio dela é o quadro do palco', () => {
    // do tamanho do palco, é a câmera do dono
    expect(lenteDaTela(1, 1).fov).toBeCloseTo(CAMERA_DO_JOGO.fov, 9);
    expect(lenteDaTela(1, 1).aspecto).toBeCloseTo(STAGE_W / STAGE_H, 9);
    // mais larga (uma janela de 2,2:1) e mais alta: um ponto cai no mesmo lugar do palco
    for (const [fx, fy] of [
      [1.2375, 1],
      [1, 1.3],
    ]) {
      const lente = lenteDaTela(fx, fy);
      const larga = new THREE.PerspectiveCamera(lente.fov, lente.aspecto, 0.02, 60);
      larga.position.copy(camera.position);
      larga.quaternion.copy(camera.quaternion);
      larga.updateMatrixWorld(true);
      for (const [x, y, z] of [
        [0.4, ALTURA_DA_MESA, 0.2],
        [-1.1, ALTURA_DA_MESA, -0.3],
      ]) {
        const v = new THREE.Vector3(x, y, z).project(larga);
        const p = projetarMundo(x, y, z);
        // (a tela tem fx × 1600 por fy × 900, com o palco no meio)
        expect(((v.x + 1) / 2) * STAGE_W * fx - (STAGE_W * (fx - 1)) / 2).toBeCloseTo(p.x, 5);
        expect(((1 - v.y) / 2) * STAGE_H * fy - (STAGE_H * (fy - 1)) / 2).toBeCloseTo(p.y, 5);
      }
    }
  });

  it('numa janela de 2,2:1 as pontas da mesa aparecem inteiras (no palco de 16:9 sozinho ficam cortadas)', () => {
    const ponta = projetarMundo(MEIO + RAIO + 0.014, ALTURA_DA_MESA, 0);
    expect(ponta.x).toBeGreaterThan(STAGE_W);
    const sobra = (STAGE_W * (2.2 / (STAGE_W / STAGE_H) - 1)) / 2;
    expect(ponta.x).toBeLessThan(STAGE_W + sobra);
  });

  it('as cartas abertas 2D ficam onde "virar as duas cartas" as deixa, e a pilha fechada é a de "olhar"', () => {
    const b = new Boneco(montarEsqueleto());
    const virar = virarAPilha(b);
    const fim = virar.objetos!(virar.dur, b);
    fim.forEach((o, i) => {
      expect(o.pos.x).toBeCloseTo(ABERTAS[i][0], 3);
      expect(o.pos.z).toBeCloseTo(ABERTAS[i][1], 3);
      expect(o.aberta).toBe(true);
    });
    const comeco = virar.objetos!(0, b);
    const parado = olhar(b).objetos!(0, b);
    comeco.forEach((o, i) => expect(o.pos.distanceTo(parado[i].pos)).toBeLessThan(1e-6));
  });

  it('o baralho parado fica onde "pegar o baralho" o busca, e fora de baixo das cartas abertas do meio da mesa', () => {
    expect(BARALHO_NA_MESA.em).toEqual([...MARCAS.baralho]);
    expect(BARALHO_NA_MESA.giro).toBe(GIRO_DO_BARALHO);
    // no meu lugar (o de baixo), visto no plano: para além da última carta da mesa, com folga
    const eu = lugares(6)[0];
    const w = noMundo(eu, MARCAS.baralho[0], MARCAS.baralho[1]);
    const p = mundoParaPlano(w.x, w.z);
    expect(Math.abs(p.x - 800)).toBeGreaterThan(2 * 98 + 44 + 50);
  });

  it('pegar o baralho acaba na espera da entrega, com o baralho na mão esquerda', () => {
    const b = new Boneco(montarEsqueleto());
    const pega = pegarBaralho(b);
    const fim = poseDe(pega, pega.dur);
    const espera = poseDe(entregarCartas(b, [{ alvo: [-0.28, 0.84] }]), 0);
    for (const lado of ['E', 'D'] as const) {
      expect(fim.maos[lado].punho.distanceTo(espera.maos[lado].punho)).toBeLessThan(1e-4);
      expect(fim.maos[lado].dedos.distanceTo(espera.maos[lado].dedos)).toBeLessThan(1e-4);
    }
    // o baralho sai da mesa, do lugar dele, e acaba onde a entrega o tem
    const de = pega.objetos!(0, b)[0];
    expect(de.pos.x).toBeCloseTo(BARALHO_NA_MESA.em[0], 6);
    expect(de.pos.z).toBeCloseTo(BARALHO_NA_MESA.em[1], 6);
    const naMao = aplicar(b, pega, pega.dur)[0];
    const naEntrega = aplicar(b, entregarCartas(b, [{ alvo: [-0.28, 0.84] }]), 0).find((o) => o.tipo === 'baralho')!;
    expect(naMao.pos.distanceTo(naEntrega.pos)).toBeLessThan(1e-4);
  });

  it('a homografia do CSS leva cada ponto do plano aonde a câmera o vê', () => {
    const m = homografia();
    for (const p of [
      { x: 800, y: 550 },
      { x: 100, y: 900 },
      { x: 1500, y: 200 },
      { x: 640, y: 600 },
    ]) {
      const a = pelaHomografia(m, p);
      const b = projetar(p);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
    // o meio da mesa tem escala 1; o que fica mais perto da câmera (embaixo) parece maior
    expect(projetar({ x: 800, y: 550 }).s).toBeCloseTo(1, 9);
    expect(projetar({ x: 800, y: 900 }).s).toBeGreaterThan(1);
  });

  it('o jogo inteiro aparece: as cartas e a aposta de cada assento caem dentro da tela', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (const g of seatLayout3d(n, 2, true)) {
        for (const p of [g.cards, g.bet]) {
          const s = projetar(p);
          expect(s.x).toBeGreaterThan(0);
          expect(s.x).toBeLessThan(STAGE_W);
          expect(s.y).toBeGreaterThan(0);
          expect(s.y).toBeLessThan(STAGE_H);
        }
        // (a minha placa tem lugar fixo, no canto de baixo)
        if (g.isMe) continue;
        expect(g.plate.x).toBeGreaterThanOrEqual(112);
        expect(g.plate.x).toBeLessThanOrEqual(STAGE_W - 112);
        expect(g.plate.y).toBeGreaterThanOrEqual(44);
        // (as dos outros não descem até a minha placa nem até o painel de ações)
        expect(g.plate.y).toBeLessThanOrEqual(470);
      }
    }
  });

  it('a placa de cada um não cobre as cartas dele', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (const g of seatLayout3d(n, 0, true)) {
        if (g.isMe) continue;
        const c = projetar(g.cards);
        expect(Math.abs(g.plate.x - c.x) >= 170 || Math.abs(g.plate.y - c.y) >= 100, `${n} lugares, visual ${g.vis}`).toBe(true);
      }
    }
  });

  it('o assento âncora é o de baixo, e a minha placa fica no canto de sempre', () => {
    const geo = seatLayout3d(6, 3, true);
    expect(geo[3].vis).toBe(0);
    expect(geo[3].isMe).toBe(true);
    expect(geo[3].plate).toEqual({ x: 250, y: 846 });
    expect(geo[4].vis).toBe(1);
    // sem mim na mesa (assistindo), ninguém é "eu"
    expect(seatLayout3d(6, 0, false).some((g) => g.isMe)).toBe(false);
  });
});

describe('as cartas abertas e as mãos', () => {
  it('o retângulo de que as mãos se afastam é o das cartas abertas do jogo', () => {
    expect(ABERTAS_AO_VIRAR).toEqual(ABERTAS.map((p) => [p[0], p[1]]));
  });
});
