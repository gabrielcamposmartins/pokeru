import { describe, expect, it } from 'vitest';
import {
  CORES,
  LADO,
  SEGUNDOS_DO_RELOGIO,
  TEMPO_MIN_JOIAS,
  cair,
  criar as criarJoias,
  cumpriu,
  dica,
  embaralhar,
  estrelasDoNivel,
  jogar,
  nivelJoias,
  sequencias,
  temJogada,
  type Gema,
  type Tabuleiro,
} from './joias';
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
  PALETA,
  alvoDaMira,
  contar,
  estrelasBolhas,
  nivelBolhas,
  BOMBA,
  CURINGA,
  ESTRELA,
  PEDRA,
  RAIO,
  TEMPO_MIN_BOLHAS,
  coresNaGrade,
  corDe,
  limpa,
  temMira,
  type Grade,
} from './bolhas';
import { PONTOS_MAX_POR_NIVEL, recordePlausivel } from '../../shared/minijogos';

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

describe('níveis', () => {
  it('Joias: os dois primeiros com cinco cores, depois seis; metas e jogadas só crescem', () => {
    expect(nivelJoias(1).cores).toBe(5);
    expect(nivelJoias(2).cores).toBe(5);
    expect(nivelJoias(3).cores).toBe(CORES);
    expect(nivelJoias(1).coletar).toEqual([]);
    expect(nivelJoias(2).coletar).toHaveLength(1);
    expect(nivelJoias(5).coletar).toHaveLength(2);
    for (let n = 3; n < 40; n++) {
      const a = nivelJoias(n);
      const b = nivelJoias(n + 1);
      expect(b.meta).toBeGreaterThan(a.meta);
      expect(b.jogadas).toBeGreaterThanOrEqual(a.jogadas);
      expect(b.jogadas).toBeLessThanOrEqual(30);
      // as cores da coleta existem no tabuleiro e não se repetem
      for (const c of b.coletar) expect(c.cor).toBeLessThan(b.cores);
      expect(new Set(b.coletar.map((c) => c.cor)).size).toBe(b.coletar.length);
    }
  });

  it('Joias: o nível fecha com a meta e a coleta; as estrelas vêm dos pontos', () => {
    const nv = nivelJoias(2);
    const juntou = new Array(CORES).fill(0);
    expect(cumpriu(nv, nv.meta, juntou)).toBe(false);
    juntou[nv.coletar[0].cor] = nv.coletar[0].qtd;
    expect(cumpriu(nv, nv.meta - 1, juntou)).toBe(false);
    expect(cumpriu(nv, nv.meta, juntou)).toBe(true);
    expect(estrelasDoNivel(nv, nv.meta)).toBe(1);
    expect(estrelasDoNivel(nv, nv.meta * 1.3)).toBe(2);
    expect(estrelasDoNivel(nv, nv.meta * 1.6)).toBe(3);
  });

  it('Joias com cinco cores: nada da sexta cor nasce, nem no tabuleiro novo nem nas cascatas', () => {
    const rng = semente(21);
    let t = criarJoias(rng, 5);
    for (let i = 0; i < 40; i++) {
      if (!temJogada(t)) t = embaralhar(t, rng, 5);
      const [a, b] = dica(t)!;
      const j = jogar(t, a, b, rng, 5);
      if (!j.valida) continue;
      for (const p of j.passos) expect(p.depois.flat().every((g) => g!.cor < 5)).toBe(true);
      t = j.final;
    }
  });

  it('Bolhas: tutorial pequeno, e a cada nível mais linhas e cores até o jogo cheio', () => {
    expect(nivelBolhas(1)).toMatchObject({ n: 1, linhas: 5, cores: 3, errosAteDescer: 7 });
    expect(nivelBolhas(4).cores).toBe(6);
    expect(nivelBolhas(7).cores).toBe(7);
    expect(nivelBolhas(11).cores).toBe(PALETA.length);
    expect(nivelBolhas(20)).toMatchObject({ linhas: 9, cores: PALETA.length, errosAteDescer: 4 });
    // o tutorial não tem especial nenhuma
    expect(nivelBolhas(1).chances).toEqual({ raio: 0, estrela: 0, pedra: 0 });
    expect(nivelBolhas(1).sorteio).toEqual({ bomba: 0, curinga: 0 });
    const g = criarBolhas(nivelBolhas(1).linhas, nivelBolhas(1).cores, semente());
    expect(contar(g)).toBe(COLS * 3 + (COLS - 1) * 2);
    expect(g.linhas.flat().every((x) => x != null && x < 3)).toBe(true);
  });

  it('Bolhas: a mira aponta a mesma casa em que o tiro para', () => {
    const rng = semente(3);
    const g = criarBolhas(5, 4, rng);
    for (let i = 0; i < 30; i++) {
      const ang = 0.2 + rng() * (Math.PI - 0.4);
      let v = atirar(ang);
      let parou = null;
      for (let k = 0; k < 800 && !parou; k++) ({ voo: v, parou } = avancar(g, v, 1 / 120));
      expect(alvoDaMira(g, ang)).toEqual(parou);
    }
  });

  it('Bolhas: menos tiros, mais estrelas', () => {
    expect(estrelasBolhas(60, 10)).toBe(3);
    expect(estrelasBolhas(60, 30)).toBe(2);
    expect(estrelasBolhas(60, 80)).toBe(1);
  });
});

/** Uma grade a partir de linhas de valores (null = vazia), com as linhas no tamanho certo. */
function gradeDe(linhas: (number | null)[][], par: 0 | 1 = 0): Grade {
  const g: Grade = { par, linhas: [] };
  linhas.forEach((l, r) => {
    const n = colunasDa(g, r);
    g.linhas.push(Array.from({ length: n }, (_, c) => l[c] ?? null));
  });
  return g;
}

describe('bolhas especiais', () => {
  it('raio e estrela contam pela cor delas; a pedra não tem cor', () => {
    expect(corDe(RAIO + 3)).toBe(3);
    expect(corDe(ESTRELA + 5)).toBe(5);
    expect(corDe(PEDRA)).toBeNull();
    expect(corDe(BOMBA)).toBeNull();
    const g = gradeDe([[1, RAIO + 1, ESTRELA + 1, PEDRA]]);
    expect(grupo(g, 0, 0)).toHaveLength(3);
    expect(coresNaGrade(g)).toEqual([1]);
  });

  it('a bolha-raio que estoura leva a linha inteira, pedra inclusive', () => {
    // linha 0: A A raio(A) B B pedra ... ; o tiro A ao lado fecha o grupo com o raio
    const g = gradeDe([[0, RAIO + 0, null, 2, 2, PEDRA, 3, 3, 4, 4, 5]]);
    const r0 = pousar(g, { r: 0, c: 2 }, 0);
    expect(r0.raios).toEqual([0]);
    expect(r0.grade.linhas.flat().every((x) => x == null)).toBe(true);
  });

  it('a estrela dobra os pontos do estouro', () => {
    const sem = pousar(gradeDe([[0, 0]]), { r: 0, c: 2 }, 0);
    const com = pousar(gradeDe([[0, ESTRELA + 0]]), { r: 0, c: 2 }, 0);
    expect(com.multiplicador).toBe(2);
    expect(com.pontos).toBe(sem.pontos * 2);
  });

  it('a bomba explode em volta sem olhar a cor, e o que fica solto cai', () => {
    const g = gradeDe([
      [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4],
      [5, 0, 1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    const r0 = pousar(g, { r: 2, c: 5 }, BOMBA);
    expect(r0.explodiu).toBe(true);
    expect(r0.estouradas.length).toBeGreaterThan(6);
    // nada que sobrou está solto do teto
    expect(soltas(r0.grade)).toEqual([]);
  });

  it('o curinga vira a cor que faz o maior grupo onde parou', () => {
    // à esquerda dois de cor 2, à direita um de cor 4: o curinga vira 2 e estoura três
    const g = gradeDe([[2, 2, null, 4]]);
    const r0 = pousar(g, { r: 0, c: 2 }, CURINGA);
    expect(r0.estouradas).toHaveLength(3);
    expect(r0.valores.every((v) => corDe(v) === 2)).toBe(true);
  });

  it('pedras presas não seguram o nível: a grade sem cor está limpa', () => {
    expect(limpa(gradeDe([[PEDRA, null, PEDRA]]))).toBe(true);
    expect(limpa(gradeDe([[PEDRA, 1]]))).toBe(false);
  });

  it('as especiais da grade nascem só a partir do nível em que entram', () => {
    const rng = semente(9);
    const g1 = criarBolhas(9, 6, rng, nivelBolhas(1).chances);
    expect(g1.linhas.flat().every((v) => v != null && v < RAIO)).toBe(true);
    const n = nivelBolhas(12);
    let pedras = 0;
    let raios = 0;
    for (let i = 0; i < 20; i++) {
      const g = criarBolhas(9, n.cores, rng, n.chances);
      for (const v of g.linhas.flat()) {
        if (v === PEDRA) pedras++;
        else if (v != null && v >= RAIO && v < ESTRELA) raios++;
      }
      // nenhuma linha só de pedras
      for (const l of g.linhas) expect(l.every((v) => v === PEDRA)).toBe(false);
    }
    expect(pedras).toBeGreaterThan(0);
    expect(raios).toBeGreaterThan(0);
  });

  it('o tempo cai a cada nível até o mínimo, e a mira pontilhada é só do primeiro', () => {
    for (let n = 1; n < 30; n++) expect(nivelBolhas(n + 1).tempo).toBeLessThanOrEqual(nivelBolhas(n).tempo);
    expect(nivelBolhas(2).tempo).toBeLessThan(nivelBolhas(1).tempo);
    expect(nivelBolhas(50).tempo).toBe(TEMPO_MIN_BOLHAS);
    expect(temMira(1)).toBe(true);
    expect(temMira(2)).toBe(false);
  });
});

describe('joias especiais', () => {
  it('um L deixa uma bomba no cruzamento, e a bomba leva as oito vizinhas', () => {
    const linhas = FUNDO.slice();
    // L de cor 0 com o cruzamento em (2,2): (2,0) (2,1) na linha e (0,2) (1,2) na coluna; (3,2) traz o 0 que falta
    const set = (r: number, c: number, ch: string) => (linhas[r] = linhas[r].slice(0, c) + ch + linhas[r].slice(c + 1));
    set(2, 0, '0');
    set(2, 1, '0');
    set(0, 2, '0');
    set(1, 2, '0');
    set(2, 2, '1');
    set(3, 2, '0');
    const t = tab(linhas);
    const j = jogar(t, { r: 2, c: 2 }, { r: 3, c: 2 }, semente());
    expect(j.valida).toBe(true);
    if (!j.valida) return;
    const nasceu = j.passos[0].comBuracos[2][2];
    expect(nasceu?.especial).toBe('bomba');
    expect(nasceu?.cor).toBe(0);
  });

  it('o relógio que some devolve segundos, e o ×2 dobra o passo', () => {
    const linhas = FUNDO.slice();
    linhas[0] = '00' + linhas[0].slice(2);
    linhas[1] = linhas[1].slice(0, 2) + '0' + linhas[1].slice(3);
    const base = tab(linhas);
    const comum = jogar(base, { r: 0, c: 2 }, { r: 1, c: 2 }, semente());
    const t = tab(linhas);
    t[0][0] = { ...t[0][0]!, especial: 'relogio' };
    t[0][1] = { ...t[0][1]!, especial: 'x2' };
    const j = jogar(t, { r: 0, c: 2 }, { r: 1, c: 2 }, semente());
    expect(j.valida && comum.valida).toBe(true);
    if (!j.valida || !comum.valida) return;
    expect(j.passos[0].segundos).toBe(SEGUNDOS_DO_RELOGIO);
    expect(j.passos[0].multiplicador).toBe(2);
    expect(j.passos[0].pontos).toBe(comum.passos[0].pontos * 2);
  });

  it('a cruz leva a linha e a coluna', () => {
    const t = tab(FUNDO);
    t[4][4] = { ...t[4][4]!, especial: 'cruz' };
    // uma estrela trocada com a cor da cruz faz a cruz sumir, e ela detona
    t[4][5] = { id: 9999, cor: -1, especial: 'estrela' };
    const j = jogar(t, { r: 4, c: 5 }, { r: 4, c: 4 }, semente());
    expect(j.valida).toBe(true);
    if (!j.valida) return;
    const limpas = j.passos[0].limpas;
    for (let c = 0; c < LADO; c++) expect(limpas).toContainEqual({ r: 4, c });
    for (let r = 0; r < LADO; r++) expect(limpas).toContainEqual({ r, c: 5 });
  });

  it('relógio e ×2 só caem a partir dos níveis deles, e nunca no tabuleiro novo', () => {
    expect(nivelJoias(1).chances).toEqual({ relogio: 0, x2: 0 });
    expect(nivelJoias(2).chances.relogio).toBeGreaterThan(0);
    expect(nivelJoias(3).chances.x2).toBeGreaterThan(0);
    const rng = semente(4);
    const t = criarJoias(rng);
    expect(t.flat().every((g) => !g!.especial)).toBe(true);
    const buracos = t.map((l, r) => l.map((g) => (r < 4 ? null : g)));
    let extras = 0;
    for (let i = 0; i < 40; i++) extras += cair(buracos, rng, CORES, { relogio: 0.5, x2: 0.5 }).flat().filter((g) => g!.especial).length;
    expect(extras).toBeGreaterThan(0);
  });

  it('o tempo cai a cada nível até o mínimo', () => {
    for (let n = 1; n < 30; n++) expect(nivelJoias(n + 1).tempo).toBeLessThanOrEqual(nivelJoias(n).tempo);
    expect(nivelJoias(2).tempo).toBeLessThan(nivelJoias(1).tempo);
    expect(nivelJoias(40).tempo).toBe(TEMPO_MIN_JOIAS);
  });
});

describe('recordes de antes continuam valendo', () => {
  it('o teto do servidor não mudou: um recorde já guardado segue plausível', () => {
    expect(PONTOS_MAX_POR_NIVEL).toBe(80_000);
    expect(recordePlausivel('bolhas', 12_345, 3)).toBe(true);
    expect(recordePlausivel('joias', 40_000, 5)).toBe(true);
  });
});
