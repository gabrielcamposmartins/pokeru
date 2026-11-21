import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FICHA } from '../personagem/animacoes';
import { geometriaDaFicha, perfilDaFicha, RELEVO_DA_FICHA } from './ficha';

describe('a ficha 3D', () => {
  const geo = geometriaDaFicha();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const idx = geo.getIndex()!;

  it('cabe no lugar de uma ficha: o raio dela, e menos que o passo da pilha', () => {
    let raio = 0;
    let cima = -Infinity;
    let baixo = Infinity;
    for (let i = 0; i < pos.count; i++) {
      raio = Math.max(raio, Math.hypot(pos.getX(i), pos.getZ(i)));
      cima = Math.max(cima, pos.getY(i));
      baixo = Math.min(baixo, pos.getY(i));
    }
    expect(raio).toBeCloseTo(FICHA.raio, 6);
    expect(cima - baixo).toBeCloseTo(RELEVO_DA_FICHA.alto, 6);
    expect(cima - baixo).toBeLessThan(FICHA.alto);
    // (o meio fica na origem: é por ele que a cena a põe na pilha)
    expect(cima + baixo).toBeCloseTo(0, 6);
  });

  it('tem relevo: o miolo fica abaixo da beirada, e a quina desce até a lateral', () => {
    const p = perfilDaFicha();
    const miolo = p.find((a) => a.r === 0)!;
    const beirada = p.find((a) => a.r === RELEVO_DA_FICHA.quina)!;
    expect(miolo.y).toBeGreaterThan(beirada.y);
    const lateral = p.filter((a) => a.parte === 0);
    expect(lateral).toHaveLength(2);
    expect(lateral[0].y).toBeGreaterThan(beirada.y);
    // (o perfil nunca volta para dentro na face de cima, nem sobe na lateral)
    const cima = p.filter((a) => a.parte === 1);
    for (let i = 1; i < cima.length; i++) expect(cima[i].r).toBeGreaterThanOrEqual(cima[i - 1].r);
  });

  it('as normais têm tamanho um, e todo triângulo olha para fora', () => {
    for (let i = 0; i < nor.count; i++) expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 5);
    const v = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = (i: number) => new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
    let conferidos = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const face = v(b).sub(v(a)).cross(v(c).sub(v(a)));
      if (face.length() < 1e-12) continue;
      const media = n(a).add(n(b)).add(n(c));
      expect(face.normalize().dot(media.normalize())).toBeGreaterThan(0.5);
      conferidos++;
    }
    expect(conferidos).toBeGreaterThan(400);
  });

  it('tem os três grupos dos materiais (a lateral, a face de cima e a de baixo), cobrindo tudo', () => {
    expect(geo.groups.map((g) => g.materialIndex).sort()).toEqual([0, 1, 2]);
    expect(geo.groups.reduce((s, g) => s + g.count, 0)).toBe(idx.count);
  });

  it('o desenho cabe na textura, e o valor não sai espelhado na face de cima', () => {
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
    // na face de cima, o lado +x da ficha é a direita do desenho, e o lado de lá (−z) é o alto dele
    const topo = geo.groups.find((g) => g.materialIndex === 1)!;
    for (let t = topo.start; t < topo.start + topo.count; t++) {
      const i = idx.getX(t);
      expect(uv.getX(i) - 0.5).toBeCloseTo(pos.getX(i) / (2 * FICHA.raio), 5);
      expect(uv.getY(i) - 0.5).toBeCloseTo(-pos.getZ(i) / (2 * FICHA.raio), 5);
    }
  });
});
