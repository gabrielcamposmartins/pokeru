import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MESA } from '../personagem/boneco';
import { MEIO, RAIO } from './geometria';
import { prepararSombra, RUMO_DA_LUZ, sombraDosBracos } from './sombras';

describe('a luz das sombras', () => {
  const alvo = new THREE.Vector3(0, MESA, 0);
  const cantos = [MESA - 0.07, MESA + 0.4].flatMap((y) => [-1, 1].flatMap((i) => [-1, 1].map((j) => new THREE.Vector3(i * (MEIO + RAIO), y, j * RAIO))));

  it('vem de cima, da esquerda e do lado de lá: a sombra cai para a direita e para cá', () => {
    expect(RUMO_DA_LUZ.length()).toBeCloseTo(1, 6);
    expect(RUMO_DA_LUZ.y).toBeGreaterThan(0.7);
    expect(RUMO_DA_LUZ.x).toBeLessThan(0);
    expect(RUMO_DA_LUZ.z).toBeLessThan(0);
  });

  it('o mapa de sombras cobre a mesa inteira, justo', () => {
    const luz = new THREE.DirectionalLight();
    prepararSombra(luz, alvo, cantos, 8192);
    expect(luz.castShadow).toBe(true);
    luz.updateMatrixWorld(true);
    luz.shadow.updateMatrices(luz);
    const cam = luz.shadow.camera;
    const lados = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
    for (const c of cantos) {
      const p = c.clone().project(cam);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(Math.abs(p[k])).toBeLessThanOrEqual(1 + 1e-6);
        lados[k][0] = Math.min(lados[k][0], p[k]);
        lados[k][1] = Math.max(lados[k][1], p[k]);
      }
    }
    // (justo: os cantos encostam nas bordas do mapa, dos dois lados)
    for (const k of ['x', 'y', 'z'] as const) {
      expect(lados[k][0]).toBeCloseTo(-1, 4);
      expect(lados[k][1]).toBeCloseTo(1, 4);
    }
    expect(cam.near).toBeGreaterThan(0);
  });

  it('o tamanho do mapa respeita o teto da placa', () => {
    const luz = new THREE.DirectionalLight();
    prepararSombra(luz, alvo, cantos, 1024);
    expect(luz.shadow.mapSize.x).toBe(1024);
    expect(luz.shadow.mapSize.y).toBe(1024);
  });

  it('os braços entram no mapa por um material só para cada tipo de malha', () => {
    expect(sombraDosBracos('position')).toBe(sombraDosBracos('position'));
    expect(sombraDosBracos('repouso')).not.toBe(sombraDosBracos('position'));
  });
});
