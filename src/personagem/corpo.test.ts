import { describe, expect, it } from 'vitest';
import { ALTURA, PONTOS, campoDoCorpo, gerarPersonagem } from './corpo';

// malha grossa: o teste confere a forma geral, não o acabamento
const GROSSA = { corpo: 0.008, mao: 0.003 };

describe('o corpo-base do personagem', () => {
  const malha = gerarPersonagem(GROSSA);
  const n = malha.pos.length / 3;
  const caixa = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < 3; c++) {
      caixa.min[c] = Math.min(caixa.min[c], malha.pos[v * 3 + c]);
      caixa.max[c] = Math.max(caixa.max[c], malha.pos[v * 3 + c]);
    }
  }

  it('tem a altura certa, com os pés no chão', () => {
    expect(caixa.max[1]).toBeGreaterThan(ALTURA - 0.01);
    expect(caixa.max[1]).toBeLessThan(ALTURA + 0.01);
    expect(caixa.min[1]).toBeGreaterThan(-0.005);
    expect(caixa.min[1]).toBeLessThan(0.02);
  });

  it('está em T-pose: a envergadura é mais ou menos a altura, e os dois lados são iguais', () => {
    expect(caixa.max[0]).toBeCloseTo(-caixa.min[0], 6);
    expect(caixa.max[0] * 2).toBeGreaterThan(ALTURA - 0.04);
    expect(caixa.max[0] * 2).toBeLessThan(ALTURA + 0.08);
  });

  it('é esguio: cabe em menos de 35 cm de frente a trás', () => {
    expect(caixa.max[2] - caixa.min[2]).toBeLessThan(0.35);
  });

  it('a malha é sã: índices válidos, normais de tamanho 1 e faces viradas para fora', () => {
    expect(malha.idx.length % 3).toBe(0);
    let viradas = 0;
    for (let t = 0; t < malha.idx.length; t += 3) {
      const [a, b, c] = [malha.idx[t] * 3, malha.idx[t + 1] * 3, malha.idx[t + 2] * 3];
      expect(Math.max(a, b, c)).toBeLessThan(n * 3);
      const u = [malha.pos[b] - malha.pos[a], malha.pos[b + 1] - malha.pos[a + 1], malha.pos[b + 2] - malha.pos[a + 2]];
      const w = [malha.pos[c] - malha.pos[a], malha.pos[c + 1] - malha.pos[a + 1], malha.pos[c + 2] - malha.pos[a + 2]];
      const face = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (face[0] * malha.nor[a] + face[1] * malha.nor[a + 1] + face[2] * malha.nor[a + 2] < 0) viradas++;
    }
    expect(viradas / (malha.idx.length / 3)).toBeLessThan(0.001);
    for (let v = 0; v < n; v++) {
      const tamanho = Math.hypot(malha.nor[v * 3], malha.nor[v * 3 + 1], malha.nor[v * 3 + 2]);
      expect(Math.abs(tamanho - 1)).toBeLessThan(1e-3);
      expect(Number.isFinite(malha.pos[v * 3] + malha.pos[v * 3 + 1] + malha.pos[v * 3 + 2])).toBe(true);
    }
  });

  it('tem os quatro dedos soltos uns dos outros', () => {
    const campo = campoDoCorpo();
    // um corte atravessando a mão a 13 cm do punho: entra e sai de quatro dedos
    const x = PONTOS.punho[0] + 0.13;
    const y = PONTOS.punho[1] - 0.002;
    let dedos = 0;
    let dentro = false;
    for (let z = -0.07; z < 0.09; z += 0.0004) {
      const agora = campo(x, y, z) < 0;
      if (agora && !dentro) dedos++;
      dentro = agora;
    }
    expect(dedos).toBe(4);
  });

  it('tem dez unhas, todas na ponta dos dedos', () => {
    let naUnha = 0;
    for (let v = 0; v < n; v++) {
      if (malha.unha[v] !== 1) continue;
      naUnha++;
      // do nó dos dedos para a frente (o polegar é o mais recuado)
      expect(Math.abs(malha.pos[v * 3])).toBeGreaterThan(PONTOS.punho[0] + 0.07);
    }
    // cinco de cada lado, todas com a mesma quantidade de vértices
    expect(naUnha).toBeGreaterThan(0);
    expect(naUnha % 10).toBe(0);
  });

  it('sai igual toda vez', () => {
    const outra = gerarPersonagem(GROSSA);
    expect(outra.pos.length).toBe(malha.pos.length);
    expect(outra.idx.length).toBe(malha.idx.length);
    expect(Array.from(outra.pos.slice(0, 300))).toEqual(Array.from(malha.pos.slice(0, 300)));
  });
});
