import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ACESSORIOS, SEM_ACESSORIOS, type Acessorios } from '../../shared/acessorios';
import { campoDoCorpo } from '../personagem/corpo';
import { montarEsqueleto } from '../personagem/esqueleto';
import { medidasDosLacos, pecasDosAcessorios } from './acessorios3d';

const com = (p: Partial<Acessorios>): Acessorios => ({ ...SEM_ACESSORIOS, ...p });

describe('os acessórios 3D: as medidas', () => {
  const m = medidasDosLacos();

  it('cada dedo e o pulso têm a grossura de um dedo e de um pulso de verdade', () => {
    for (const r of m.dedos.slice(0, 4)) {
      expect(r).toBeGreaterThan(0.0055);
      expect(r).toBeLessThan(0.0105);
    }
    // o polegar é o mais grosso; o mínimo, o mais fino
    expect(m.dedos[4]).toBeGreaterThan(m.dedos[3]);
    expect(m.dedos[3]).toBeLessThan(m.dedos[1]);
    expect(m.pulso).toBeGreaterThan(0.02);
    expect(m.pulso).toBeLessThan(0.04);
  });

  it('cada peça vai presa a um osso que existe', () => {
    const esq = montarEsqueleto();
    const a = com({ aneis: [0, 1, 2, 3, 4].map((dedo) => ({ id: 'anel-alianca', mao: 'E' as const, dedo })), bracos: { E: ['pulseira-contas'], D: ['pulseira-couro'] } });
    const pecas = pecasDosAcessorios(a, 'nenhuma');
    expect(pecas).toHaveLength(7);
    for (const p of pecas) expect(esq.indice[`${p.osso}.${p.mao}`], p.osso).toBeGreaterThanOrEqual(0);
  });
});

describe('os acessórios 3D: as peças', () => {
  const campo = campoDoCorpo();
  /** A menor distância de um pedaço à pele (negativa: entrou nela) e a maior. */
  const distancias = (geo: THREE.BufferGeometry) => {
    const pos = geo.getAttribute('position');
    let menor = Infinity;
    let maior = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const d = campo(pos.getX(i), pos.getY(i), pos.getZ(i));
      menor = Math.min(menor, d);
      maior = Math.max(maior, d);
    }
    return { menor, maior };
  };

  it('todo anel fica rente ao dedo, sem entrar na pele, em qualquer dedo', () => {
    for (const def of ACESSORIOS.filter((a) => a.tipo === 'anel')) {
      for (let dedo = 0; dedo < 5; dedo++) {
        const [peca] = pecasDosAcessorios(com({ aneis: [{ id: def.id, mao: 'E', dedo }] }), 'nenhuma');
        const aro = distancias(peca.pedacos[0].geo);
        // (no vão entre dois dedos a pele é dos dois: ali o aro aperta um nada — o polegar, mais, contra a palma;
        // e o aro largo e a serpente, que cobrem um trecho maior do dedo, chegam mais perto do vão)
        const largo = def.tipo === 'anel' && (def.pedra === 'incrustada' || def.pedra === 'serpente');
        expect(aro.menor, `${def.id} no dedo ${dedo}`).toBeGreaterThan(dedo === 4 || largo ? -0.0023 : -0.0012);
        expect(aro.maior, `${def.id} no dedo ${dedo}`).toBeLessThan(0.007);
      }
    }
  });

  it('por cima da luva inteira o anel é mais largo', () => {
    const naPele = pecasDosAcessorios(com({ aneis: [{ id: 'anel-alianca', mao: 'E', dedo: 1 }] }), 'nenhuma')[0].pedacos[0].geo;
    const naLuva = pecasDosAcessorios(com({ aneis: [{ id: 'anel-alianca', mao: 'E', dedo: 1 }] }), 'inteira')[0].pedacos[0].geo;
    expect(distancias(naLuva).menor).toBeGreaterThan(distancias(naPele).menor + 0.001);
  });

  it('as pulseiras dão a volta no pulso sem entrar nele', () => {
    for (const def of ACESSORIOS.filter((a) => a.tipo === 'pulseira')) {
      const [peca] = pecasDosAcessorios(com({ bracos: { E: [def.id], D: [] } }), 'nenhuma');
      for (const p of peca.pedacos) {
        const d = distancias(p.geo);
        expect(d.menor, def.id).toBeGreaterThan(-0.0005);
        expect(d.maior, def.id).toBeLessThan(0.013);
      }
    }
  });

  it('no mesmo braço, as peças vão em fila do pulso para o cotovelo — sem entrar na pele e sem entrar uma na outra', () => {
    // (sem relógio: o mostrador é desenhado num canvas, que aqui não há — o relógio na fila se confere no navegador)
    const fila = ['pulseira-contas', 'pulseira-corrente', 'pulseira-couro', 'pulseira-terco', 'pulseira-argolas', 'pulseira-riviera', 'pulseira-espinhos'];
    const pecas = pecasDosAcessorios(com({ bracos: { E: fila, D: [] } }), 'nenhuma');
    expect(pecas.map((p) => p.id)).toEqual(fila);
    // o trecho do braço (x, que corre do ombro para a mão) que cada peça ocupa
    const trechos = pecas.map((p) => {
      const caixa = new THREE.Box3();
      for (const { geo } of p.pedacos) {
        geo.computeBoundingBox();
        caixa.union(geo.boundingBox!);
        const d = distancias(geo);
        expect(d.menor, p.id).toBeGreaterThan(-0.0005);
      }
      return [caixa.min.x, caixa.max.x];
    });
    // cada uma acima (mais perto do ombro) da de baixo, sem se sobrepor a ela
    for (let k = 1; k < trechos.length; k++) expect(trechos[k][1], fila[k]).toBeLessThanOrEqual(trechos[k - 1][0] + 0.0004);
    // a primeira fica no pulso, como sempre ficou
    const [sozinha] = pecasDosAcessorios(com({ bracos: { E: ['pulseira-contas'], D: [] } }), 'nenhuma');
    expect(sozinha.pedacos[0].geo.getAttribute('position').count).toBe(pecas[0].pedacos[0].geo.getAttribute('position').count);
  });

  it('as faces olham para fora (a normal de cada triângulo concorda com a dos vértices)', () => {
    const pecas = pecasDosAcessorios(com({ aneis: [{ id: 'anel-solitario', mao: 'E', dedo: 0 }], bracos: { E: ['pulseira-couro', 'pulseira-contas'], D: ['pulseira-corrente'] } }), 'nenhuma');
    for (const peca of pecas) {
      for (const { geo } of peca.pedacos) {
        const pos = geo.getAttribute('position');
        const nor = geo.getAttribute('normal');
        const idx = geo.getIndex();
        const n = idx ? idx.count : pos.count;
        const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i);
        const nv = (i: number) => new THREE.Vector3().fromBufferAttribute(nor, idx ? idx.getX(i) : i);
        let certas = 0;
        let todas = 0;
        for (let t = 0; t < n; t += 3) {
          const face = v(t + 1).sub(v(t)).cross(v(t + 2).sub(v(t)));
          if (face.length() < 1e-14) continue;
          todas++;
          if (face.dot(nv(t).add(nv(t + 1)).add(nv(t + 2))) > 0) certas++;
        }
        expect(certas / todas, peca.id).toBeGreaterThan(0.98);
      }
    }
  });
});
