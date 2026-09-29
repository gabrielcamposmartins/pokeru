import { describe, expect, it } from 'vitest';
import { CORES, LADO, cair, criar as criarJoias, dica, embaralhar, jogar, sequencias, temJogada, type Gema, type Tabuleiro } from './joias';
import {
  COLS,
  R,
  anguloPara,
  atirar,
  avancar,
  centro,
  colunasDa,
  criar as criarBolhas,
  empurrar,
  encaixe,
  grupo,
  pousar,
  soltas,
  vizinhas,
  ATIRADOR,
  type Grade,
} from './bolhas';

/** Um sorteio repetível. */
function semente(s = 7) {
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Um tabuleiro de joias a partir de linhas de dígitos (a cor de cada casa). */
function tab(linhas: string[]): Tabuleiro {
  let id = 1000;
  return linhas.map((l) => [...l].map((ch) => ({ id: id++, cor: Number(ch) }) as Gema));
}

// um fundo sem nenhum alinhamento: as cores giram de casa em casa
const FUNDO = Array.from({ length: LADO }, (_, r) => Array.from({ length: LADO }, (_, c) => String((r * 2 + c) % 4 + 2)).join(''));

describe('joias', () => {
  it('o tabuleiro novo não tem alinhamento pronto e tem jogada', () => {
    for (let s = 1; s < 20; s++) {
      const t = criarJoias(semente(s));
      expect(sequencias(t)).toEqual([]);
      expect(temJogada(t)).toBe(true);
      expect(t.flat().every((g) => g && g.cor >= 0 && g.cor < CORES)).toBe(true);
    }
  });

  it('uma troca que não alinha nada é inválida', () => {
    const t = tab(FUNDO);
    expect(jogar(t, { r: 0, c: 0 }, { r: 0, c: 1 }).valida).toBe(false);
    // casas que não são vizinhas também não
    expect(jogar(t, { r: 0, c: 0 }, { r: 2, c: 0 }).valida).toBe(false);
  });

  it('alinhar três some com elas, e o tabuleiro fica cheio de novo', () => {
    const linhas = FUNDO.slice();
    // linha 0: 0 0 _ 0 → trocar a casa 2 com a de baixo (que é 0) alinha quatro? não: põe três
    linhas[0] = '00' + linhas[0].slice(2);
    linhas[1] = linhas[1].slice(0, 2) + '0' + linhas[1].slice(3);
    const t = tab(linhas);
    const j = jogar(t, { r: 0, c: 2 }, { r: 1, c: 2 }, semente());
    expect(j.valida).toBe(true);
    if (!j.valida) return;
    expect(j.passos[0].limpas).toHaveLength(3);
    expect(j.passos[0].porCor[0]).toBe(3);
    expect(j.final.flat().every((g) => g)).toBe(true);
    expect(sequencias(j.final)).toEqual([]);
  });

  it('quatro em linha deixam uma joia listrada, que leva a linha inteira quando some', () => {
    const linhas = FUNDO.slice();
    linhas[3] = '000' + linhas[3].slice(3);
    linhas[3] = linhas[3].slice(0, 3) + '5' + linhas[3].slice(4);
    linhas[4] = linhas[4].slice(0, 3) + '0' + linhas[4].slice(4);
    const t = tab(linhas);
    const j = jogar(t, { r: 3, c: 3 }, { r: 4, c: 3 }, semente());
    expect(j.valida).toBe(true);
    if (!j.valida) return;
    const listrada = j.passos[0].comBuracos[3][3];
    expect(listrada?.especial).toBe('linha-h');
    expect(j.passos[0].limpas).toHaveLength(3);

    // a listrada some junto com um alinhamento: a linha dela vai inteira
    const u = tab(FUNDO);
    u[5][0] = { id: 1, cor: 0, especial: 'linha-h' };
    u[5][1] = { id: 2, cor: 0 };
    u[6][2] = { id: 3, cor: 0 };
    const k = jogar(u, { r: 5, c: 2 }, { r: 6, c: 2 }, semente());
    expect(k.valida).toBe(true);
    if (!k.valida) return;
    const naLinha5 = k.passos[0].limpas.filter((p) => p.r === 5);
    expect(naLinha5).toHaveLength(LADO);
  });

  it('a estrela trocada com uma joia leva todas daquela cor', () => {
    const t = tab(FUNDO);
    t[0][0] = { id: 1, cor: -1, especial: 'estrela' };
    const cor = t[0][1]!.cor;
    const quantas = t.flat().filter((g) => g!.cor === cor).length;
    const j = jogar(t, { r: 0, c: 0 }, { r: 0, c: 1 }, semente());
    expect(j.valida).toBe(true);
    if (!j.valida) return;
    // todas daquela cor + a estrela
    expect(j.passos[0].limpas).toHaveLength(quantas + 1);
    expect(j.passos[0].porCor[cor]).toBe(quantas);
  });

  it('a queda preenche os buracos de baixo para cima e marca de onde nasce cada joia nova', () => {
    const t = tab(FUNDO);
    t[7][0] = null;
    t[6][0] = null;
    const antes = t[5][0]!.id;
    const n = cair(t, semente());
    expect(n[7][0]!.id).toBe(antes);
    expect(n[0][0]!.nasce).toBe(2);
    expect(n[1][0]!.nasce).toBe(2);
    expect(n[2][0]!.nasce).toBeUndefined();
  });

  it('uma partida inteira: toda jogada da dica vale e o tabuleiro nunca fica com buraco nem alinhamento parado', () => {
    const rng = semente(11);
    let t = criarJoias(rng);
    for (let i = 0; i < 60; i++) {
      const d = dica(t);
      if (!d) t = embaralhar(t, rng);
      const [a, b] = dica(t)!;
      const j = jogar(t, a, b, rng);
      expect(j.valida).toBe(true);
      if (!j.valida) return;
      t = j.final;
      expect(t.flat().every((g) => g)).toBe(true);
      expect(sequencias(t)).toEqual([]);
    }
  });

  it('sem jogada, embaralhar devolve um tabuleiro jogável com as mesmas joias', () => {
    const t = criarJoias(semente(3));
    const e = embaralhar(t, semente(9));
    expect(temJogada(e)).toBe(true);
    expect(sequencias(e)).toEqual([]);
    expect(e.flat().map((g) => g!.id).sort()).toEqual(t.flat().map((g) => g!.id).sort());
    expect(dica(e)).not.toBeNull();
  });
});

describe('bolhas', () => {
  it('as linhas se alternam: cheia, deslocada com uma a menos', () => {
    const g = criarBolhas(4, 5, semente());
    expect(g.linhas.map((l) => l.length)).toEqual([COLS, COLS - 1, COLS, COLS - 1]);
    expect(centro(g, 1, 0).x).toBe(2 * R);
  });

  it('vizinhança é simétrica e as vizinhas encostam', () => {
    const g = criarBolhas(6, 5, semente());
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < colunasDa(g, r); c++)
        for (const v of vizinhas(g, r, c)) {
          expect(vizinhas(g, v.r, v.c)).toContainEqual({ r, c });
          const a = centro(g, r, c);
          const b = centro(g, v.r, v.c);
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * R, 5);
        }
  });

  it('empurrar desce tudo uma linha sem tirar nenhuma bolha do lugar (na tela)', () => {
    const g = criarBolhas(3, 5, semente());
    const n = empurrar(g, 5, semente(2));
    expect(n.linhas.length).toBe(4);
    expect(n.linhas[1]).toEqual(g.linhas[0]);
    expect(centro(n, 1, 0).x).toBe(centro(g, 0, 0).x);
    expect(n.linhas[0].length).toBe(colunasDa(n, 0));
  });

  it('três da mesma cor estouram, e o que ficou pendurado nelas cai', () => {
    // linha 0: A A . . ; a linha 1 tem uma bolha B presa só pela casa (0,2)
    const g: Grade = { par: 0, linhas: [[0, 0, null, null, null, null, null, null, null, null, null], new Array(COLS - 1).fill(null)] };
    g.linhas[1][2] = 1; // presa em (0,2) e (0,3) — que estão vazias: só fica presa se (0,2) existir
    const r0 = pousar(g, { r: 0, c: 2 }, 0);
    // (0,0),(0,1),(0,2) estouram; a B em (1,2) estava presa só em (0,2) → cai
    expect(r0.estouradas).toHaveLength(3);
    expect(r0.caidas.map((q) => q.casa)).toEqual([{ r: 1, c: 2 }]);
    expect(soltas(r0.grade)).toEqual([]);
  });

  it('duas da mesma cor só grudam', () => {
    const g: Grade = { par: 0, linhas: [[0, null, null, null, null, null, null, null, null, null, null]] };
    const r0 = pousar(g, { r: 0, c: 1 }, 0);
    expect(r0.estouradas).toEqual([]);
    expect(grupo(r0.grade, 0, 0)).toHaveLength(2);
  });

  it('o tiro reto para cima sobe, bate e encaixa colado numa bolha', () => {
    const g = criarBolhas(3, 5, semente());
    let v = atirar(Math.PI / 2);
    let parou = null;
    for (let i = 0; i < 200 && !parou; i++) ({ voo: v, parou } = avancar(g, v, 1 / 60));
    expect(parou).not.toBeNull();
    expect(parou!.r).toBe(3);
    expect(vizinhas(g, parou!.r, parou!.c).some((q) => g.linhas[q.r]?.[q.c] != null)).toBe(true);
  });

  it('a bolha bate na parede e volta', () => {
    const g: Grade = { par: 0, linhas: [] };
    let v = atirar((20 * Math.PI) / 180);
    let tabelou = false;
    for (let i = 0; i < 120; i++) {
      const antes = v.vx;
      v = avancar(g, v, 1 / 60).voo;
      if (Math.sign(v.vx) !== Math.sign(antes)) tabelou = true;
      expect(v.x).toBeGreaterThanOrEqual(R - 0.001);
    }
    expect(tabelou).toBe(true);
  });

  it('o encaixe no teto vazio vai para a linha 0, na coluna mais perto', () => {
    const g: Grade = { par: 0, linhas: [] };
    expect(encaixe(g, 5 * 2 * R + R + 3, R)).toEqual({ r: 0, c: 5 });
  });

  it('centenas de tiros ao acaso: toda bolha para numa casa vazia e presa, e nada fica solto', () => {
    const rng = semente(5);
    let g = criarBolhas(6, 4, rng);
    for (let tiro = 0; tiro < 300; tiro++) {
      let v = atirar(0.2 + rng() * (Math.PI - 0.4));
      let parou = null;
      for (let i = 0; i < 600 && !parou; i++) ({ voo: v, parou } = avancar(g, v, 1 / 60));
      expect(parou).not.toBeNull();
      expect(g.linhas[parou!.r]?.[parou!.c] ?? null).toBeNull();
      const res = pousar(g, parou!, Math.floor(rng() * 4));
      g = res.grade;
      expect(soltas(g)).toEqual([]);
      if (g.linhas.length > 12) g = criarBolhas(6, 4, rng);
    }
  });

  it('a mira nunca aponta para baixo', () => {
    expect(anguloPara(ATIRADOR.x + 100, ATIRADOR.y + 50)).toBeGreaterThan(0);
    expect(anguloPara(ATIRADOR.x - 100, ATIRADOR.y + 50)).toBeLessThan(Math.PI);
    expect(anguloPara(ATIRADOR.x, 0)).toBeCloseTo(Math.PI / 2);
  });
});
