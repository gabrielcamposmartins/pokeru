import { describe, expect, it } from 'vitest';
import { MINIJOGOS } from './minijogos';
import { ID_GERAL, PONTOS_POR_QUADRO, QUADROS, montarRanking, type ContaRanking } from './ranking';
import { recordePlausivel } from './minijogos';

const conta = (id: string, name: string, matchWins: number, recordes: ContaRanking['recordes'] = {}): ContaRanking => ({
  id,
  name,
  character: 'marina',
  matchWins,
  matches: matchWins * 2,
  recordes,
});

const quadro = (r: ReturnType<typeof montarRanking>, id: string) => r.quadros.find((q) => q.id === id)!;

describe('ranking', () => {
  it('tem o geral primeiro, o poker e um quadro por minijogo (um minijogo novo entra sozinho)', () => {
    const r = montarRanking([], null);
    expect(r.quadros.map((q) => q.id)).toEqual([ID_GERAL, 'poker', ...MINIJOGOS]);
    expect(QUADROS).toHaveLength(1 + MINIJOGOS.length);
  });

  it('o poker ordena por partidas ganhas em primeiro; quem não tem nenhuma fica de fora', () => {
    const r = montarRanking([conta('a', 'Ana', 3), conta('b', 'Bia', 9), conta('c', 'Caio', 0)], 'c');
    const p = quadro(r, 'poker');
    expect(p.linhas.map((l) => [l.pos, l.name, l.valor])).toEqual([
      [1, 'Bia', 9],
      [2, 'Ana', 3],
    ]);
    expect(p.linhas[0].detalhe).toBe('18 partidas');
    expect(p.eu).toBeNull();
  });

  it('empate divide a posição, e a ordem do empate é pelo nome', () => {
    const r = montarRanking([conta('a', 'Zé', 5), conta('b', 'Ana', 5), conta('c', 'Caio', 2)], null);
    expect(quadro(r, 'poker').linhas.map((l) => [l.pos, l.name])).toEqual([
      [1, 'Ana'],
      [1, 'Zé'],
      [3, 'Caio'],
    ]);
  });

  it('cada minijogo ordena pelo recorde', () => {
    const r = montarRanking([conta('a', 'Ana', 0, { joias: 5000 }), conta('b', 'Bia', 0, { joias: 9000, bolhas: 100 })], null);
    expect(quadro(r, 'joias').linhas.map((l) => l.name)).toEqual(['Bia', 'Ana']);
    expect(quadro(r, 'bolhas').linhas.map((l) => l.name)).toEqual(['Bia']);
  });

  it('o geral dá a cada quadro a fração do líder: quem vai bem em tudo passa quem só brilha num', () => {
    const r = montarRanking(
      [
        conta('a', 'Ana', 10, {}), // só poker, e lidera: 1000
        conta('b', 'Bia', 5, { joias: 8000, bolhas: 4000 }), // metade no poker e lidera os dois minijogos: 500 + 1000 + 1000
      ],
      'a',
    );
    const g = quadro(r, ID_GERAL);
    expect(g.linhas[0]).toMatchObject({ name: 'Bia', valor: 2500, partes: { poker: 500, joias: 1000, bolhas: 1000 } });
    expect(g.linhas[1]).toMatchObject({ name: 'Ana', valor: PONTOS_POR_QUADRO, partes: { poker: 1000 } });
    expect(g.eu?.pos).toBe(2);
  });

  it('manda só as primeiras linhas, e a sua posição vem à parte quando fica de fora', () => {
    const contas = Array.from({ length: 80 }, (_, i) => conta(`c${i}`, `J${String(i).padStart(2, '0')}`, 100 - i));
    const r = montarRanking(contas, 'c70', new Date(), 50);
    const p = quadro(r, 'poker');
    expect(p.linhas).toHaveLength(50);
    expect(p.eu).toMatchObject({ id: 'c70', pos: 71 });
  });

  it('o recorde plausível: dentro do teto do nível, com números inteiros', () => {
    expect(recordePlausivel('joias', 12_000, 3)).toBe(true);
    expect(recordePlausivel('joias', 10_000_000, 1)).toBe(false);
    expect(recordePlausivel('xadrez', 100, 1)).toBe(false);
    expect(recordePlausivel('bolhas', 0, 1)).toBe(false);
    expect(recordePlausivel('bolhas', 100.5, 1)).toBe(false);
    expect(recordePlausivel('bolhas', 100, 0)).toBe(false);
  });
});
