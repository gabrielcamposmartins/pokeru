import { describe, expect, it } from 'vitest';
import { levelColor } from './Level';

/**
 * A cor do nível é da **dezena**, e é isso que faz o número dizer algo de longe. Se a conta da
 * dezena escorregar, dois níveis vizinhos passam a parecer a mesma coisa.
 */
describe('cor do nível', () => {
  it('muda a cada dezena, não a cada número', () => {
    expect(levelColor(0)).toBe(levelColor(9));
    expect(levelColor(10)).toBe(levelColor(19));
    expect(levelColor(9)).not.toBe(levelColor(10));
    expect(levelColor(89)).not.toBe(levelColor(90));
  });

  it('vai do 0 ao 100 sem cair fora da lista', () => {
    const cores = new Set(Array.from({ length: 101 }, (_, n) => levelColor(n)));
    expect(cores.size).toBe(11);
    for (const c of cores) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('nível acima de 100 ou quebrado não inventa cor', () => {
    expect(levelColor(320)).toBe(levelColor(100));
    expect(levelColor(-5)).toBe(levelColor(0));
    expect(levelColor(12.7)).toBe(levelColor(12));
  });
});
