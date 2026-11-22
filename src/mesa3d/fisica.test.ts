import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Mesa, disco, type Disco } from './fisica';

const NIVEL = 1.14;
const RAIO = 0.0195;
const MEIA = 0.00165;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Anda a mesa até todos dormirem (ou o tempo acabar). Devolve os segundos que levou. */
function ateParar(m: Mesa, max = 8): number {
  let t = 0;
  while (!m.quieta && t < max) {
    m.passo(1 / 60);
    t += 1 / 60;
  }
  return t;
}

const deitado = (d: Disco) => Math.abs(V(0, 1, 0).applyQuaternion(d.quat).y);
const inteiro = (d: Disco) => [d.pos.x, d.pos.y, d.pos.z, d.quat.x, d.quat.y, d.quat.z, d.quat.w].every(Number.isFinite);

describe('a física das fichas e dos anéis', () => {
  it('uma ficha largada de pé no ar cai, quica pouco e dorme deitada no tampo', () => {
    const m = new Mesa(NIVEL);
    const d = m.por(disco(V(0, NIVEL + 0.05, 0), new THREE.Quaternion(), V(), V(), RAIO, MEIA));
    const t = ateParar(m);
    expect(t).toBeLessThan(3);
    expect(d.dorme).toBe(true);
    expect(d.pos.y).toBeGreaterThan(NIVEL + MEIA - 0.0006);
    expect(d.pos.y).toBeLessThan(NIVEL + MEIA + 0.0008);
    expect(deitado(d)).toBeGreaterThan(0.999);
  });

  it('uma ficha jogada para a frente, rodopiando, anda um pouco, deita e para — sem sair voando', () => {
    for (let n = 0; n < 12; n++) {
      const m = new Mesa(NIVEL);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4 + n * 0.21, n, 0.3 * n));
      const d = m.por(disco(V(0, NIVEL + 0.06, 0), q, V(0.1 * (n % 3), 0.3, 0.7), V(6 - n, 2, n - 4), RAIO, MEIA));
      const t = ateParar(m);
      expect(t, `jogada ${n}`).toBeLessThan(7);
      expect(inteiro(d), `jogada ${n}`).toBe(true);
      expect(deitado(d), `jogada ${n}`).toBeGreaterThan(0.99);
      expect(d.pos.y, `jogada ${n}`).toBeLessThan(NIVEL + MEIA + 0.001);
      expect(d.pos.y, `jogada ${n}`).toBeGreaterThan(NIVEL + MEIA - 0.0008);
      // foi para a frente, e não para longe
      expect(d.pos.z, `jogada ${n}`).toBeGreaterThan(0.02);
      expect(Math.hypot(d.pos.x, d.pos.z), `jogada ${n}`).toBeLessThan(0.6);
    }
  });

  it('um punhado jogado no mesmo lugar: as fichas se espalham ou ficam umas sobre as outras, nunca uma dentro da outra', () => {
    const m = new Mesa(NIVEL);
    let semente = 3;
    const acaso = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 9; i++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(acaso() * 0.6, acaso() * 6, acaso() * 0.6));
      m.por(disco(V((acaso() - 0.5) * 0.01, NIVEL + 0.04 + i * 0.006, (acaso() - 0.5) * 0.01), q, V((acaso() - 0.5) * 0.2, 0, 0.45 + acaso() * 0.2), V(acaso() * 6 - 3, acaso() * 4, acaso() * 6 - 3), RAIO, MEIA));
    }
    const t = ateParar(m, 10);
    expect(t).toBeLessThan(10);
    for (const d of m.discos) {
      expect(inteiro(d)).toBe(true);
      expect(d.pos.y).toBeGreaterThan(NIVEL + MEIA - 0.001);
      // nenhuma ficou a mais de umas poucas fichas de altura
      expect(d.pos.y).toBeLessThan(NIVEL + MEIA * 2 * 9 + 0.004);
    }
    // duas deitadas na mesma altura não ocupam o mesmo lugar
    for (const a of m.discos) {
      for (const b of m.discos) {
        if (a === b || deitado(a) < 0.95 || deitado(b) < 0.95) continue;
        if (Math.abs(a.pos.y - b.pos.y) > MEIA * 0.8) continue;
        expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(RAIO * 2 * 0.8);
      }
    }
  });

  it('um anel (um disco mais grosso e menor) também quica, rola e assenta', () => {
    const m = new Mesa(NIVEL);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.4, 0.2));
    const d = m.por(disco(V(0, NIVEL + 0.07, 0), q, V(0.05, 0.2, 0.5), V(3, 1, -2), 0.02, 0.006));
    const t = ateParar(m);
    expect(t).toBeLessThan(7);
    expect(inteiro(d)).toBe(true);
    expect(deitado(d)).toBeGreaterThan(0.98);
    expect(d.pos.y).toBeLessThan(NIVEL + 0.006 + 0.001);
  });

  it('a beirada da mesa segura o que rola para fora', () => {
    const m = new Mesa(NIVEL, (x, z) => Math.hypot(x, z) < 0.2);
    const d = m.por(disco(V(0, NIVEL + 0.02, 0), new THREE.Quaternion(), V(0, 0, 3), V(), RAIO, MEIA));
    ateParar(m);
    expect(Math.hypot(d.pos.x, d.pos.z)).toBeLessThan(0.21);
  });
});
