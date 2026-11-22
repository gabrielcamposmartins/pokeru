import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CARTA, RITMO_MAIS_LIGEIRO, abrirCartas, aplicar, criarClipes, deixarCair, descansoDe, desistir, entregarCartas, entrePoses, ganhar, idleAbertas, maoComOBaralho, posarPose, poseDe, poseT, relaxar, relaxoAoAcaso, retanguloDasCartas, sobreORetangulo, virarAPilha, vistoDoLugar } from './animacoes';
import { Boneco, MESA } from './boneco';
import { gerarPersonagem } from './corpo';
import { LADOS, montarEsqueleto, pesar } from './esqueleto';

describe('o esqueleto', () => {
  const esq = montarEsqueleto();

  it('tem os ossos do corpo e dos dois lados, cada um com o pai antes dele', () => {
    expect(esq.ossos.length).toBe(51);
    esq.ossos.forEach((o, i) => expect(o.pai).toBeLessThan(i));
    for (const nome of ['braco', 'antebraco', 'giro', 'mao', 'indicador1', 'minimo3', 'polegar3', 'coxa', 'pe']) {
      const e = esq.ossos[esq.indice[`${nome}.E`]];
      const d = esq.ossos[esq.indice[`${nome}.D`]];
      expect(d.pos[0]).toBeCloseTo(-e.pos[0], 9);
      expect(d.pos[1]).toBeCloseTo(e.pos[1], 9);
    }
  });

  it('pesa a pele: cada vértice obedece a até quatro ossos, somando 1, e a ponta do dedo só ao último osso dele', () => {
    const malha = gerarPersonagem({ corpo: 0.008, mao: 0.003 });
    const { indices, pesos } = pesar(malha, esq);
    const n = malha.pos.length / 3;
    let maisLonge = 0;
    let piorSoma = 0;
    let maiorOsso = 0;
    for (let v = 0; v < n; v++) {
      piorSoma = Math.max(piorSoma, Math.abs(pesos[v * 4] + pesos[v * 4 + 1] + pesos[v * 4 + 2] + pesos[v * 4 + 3] - 1));
      for (let i = 0; i < 4; i++) maiorOsso = Math.max(maiorOsso, indices[v * 4 + i]);
      if (malha.pos[v * 3] > malha.pos[maisLonge * 3]) maisLonge = v;
    }
    expect(piorSoma).toBeLessThan(1e-4);
    expect(maiorOsso).toBeLessThan(esq.ossos.length);
    // o vértice mais à esquerda é a ponta do dedo médio (ou a unha dele)
    expect(indices[maisLonge * 4]).toBe(esq.indice['medio3.E']);
    expect(pesos[maisLonge * 4]).toBeGreaterThan(0.98);
  }, 30_000);
});

describe('o boneco', () => {
  const b = new Boneco(montarEsqueleto());

  it('leva o punho aonde se pede, dos dois lados, com a mão olhando para onde se pede', () => {
    for (const lado of LADOS) {
      const s = lado === 'E' ? 1 : -1;
      b.zerar();
      b.raiz.updateMatrixWorld(true);
      const alvo = new THREE.Vector3(0.14 * s, MESA + 0.05, 0.32);
      const dedos = new THREE.Vector3(-0.3 * s, 0, 1).normalize();
      const q = b.orientar(lado, dedos, new THREE.Vector3(0, -1, 0));
      b.braco(lado, alvo, q);
      expect(b.ancora(lado, 'punho').distanceTo(alvo)).toBeLessThan(1e-4);
      // os dedos (em T-pose, estendidos) apontam para onde foi pedido; o dedo médio vai quase reto
      const rumo = b.junta(lado, 1, 3).sub(b.junta(lado, 1, 1)).normalize();
      expect(rumo.dot(dedos)).toBeGreaterThan(0.99);
    }
  });

  it('acha onde pôr o punho para um ponto da mão cair num lugar', () => {
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    const dedos = new Array(21).fill(20);
    const q = b.orientar('D', new THREE.Vector3(0.2, 0, 1), new THREE.Vector3(0, -1, 0));
    const lugar = new THREE.Vector3(-0.1, MESA + 0.03, 0.4);
    const punho = b.resolver('D', 'pinca', lugar, q, dedos);
    b.dedos('D', dedos);
    b.braco('D', punho, q);
    expect(b.ancora('D', 'pinca').distanceTo(lugar)).toBeLessThan(1e-4);
  });

  it('descansa a mão em cima da mesa, encostada', () => {
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    const dedos = new Array(21).fill(4);
    const q = b.orientar('E', new THREE.Vector3(-0.3, 0, 1), new THREE.Vector3(0, -1, 0));
    const punho = b.apoiar('E', 0.17, 0.31, q, dedos);
    b.dedos('E', dedos);
    b.braco('E', punho, q);
    expect(Math.abs(b.folga('E'))).toBeLessThan(1e-4);
  });
});

describe('as animações', () => {
  const b = new Boneco(montarEsqueleto());
  const clipes = criarClipes(b);

  it('são as vinte pedidas', () => {
    expect(clipes.map((c) => c.id)).toEqual(['fichas', 'virar', 'virar-pilha', 'olhar', 'baralho', 'entregar', 'entregar-mesa', 'abrir', 'desistir', 'ganhar', 'girar', 'check-nos', 'check-dedos', 'check-palma', 'tirar', 'idle-plana', 'idle-sobrepostas', 'idle-batucando', 'idle-concha', 'idle-abertas']);
  });

  it('em nenhum instante a mão entra na mesa, e nada sai do lugar (sem números inválidos)', () => {
    for (const c of clipes) {
      for (let i = 0; i <= 40; i++) {
        const objs = aplicar(b, c, (c.dur * i) / 40);
        for (const lado of LADOS) {
          expect(b.folga(lado), `${c.id} em ${i}/40`).toBeGreaterThan(-2e-4);
          // o braço alcança: o punho chega aonde a animação pede
          expect(b.faltou[lado], `${c.id} em ${i}/40: fora do alcance`).toBeLessThan(1e-3);
          const p = b.ancora(lado, 'punho');
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        }
        for (const o of objs) {
          expect(Number.isFinite(o.pos.x + o.pos.y + o.pos.z + o.quat.x + o.quat.w), c.id).toBe(true);
          expect(o.pos.y, `${c.id}: ${o.tipo} abaixo da mesa`).toBeGreaterThan(MESA - 1e-4);
        }
      }
    }
  });

  it('recomeçam de onde terminam (sem tranco na emenda)', () => {
    for (const c of clipes) {
      aplicar(b, c, 0);
      const antes = LADOS.map((l) => [b.ancora(l, 'punho'), b.ancora(l, 'dedos'), b.ancora(l, 'pinca')]).flat();
      aplicar(b, c, c.dur - 1e-6);
      const depois = LADOS.map((l) => [b.ancora(l, 'punho'), b.ancora(l, 'dedos'), b.ancora(l, 'pinca')]).flat();
      antes.forEach((p, i) => expect(p.distanceTo(depois[i]), c.id).toBeLessThan(0.002));
    }
  });

  it('passam de uma para a outra sem tranco e sem a mão entrar na mesa', () => {
    const poses = [poseT(b), ...clipes.map((c) => poseDe(c, c.dur * 0.37))];
    const inicios = [poseT(b), ...clipes.map((c) => poseDe(c, 0))];
    for (const de of poses) {
      for (const para of inicios) {
        // a passagem começa na pose de antes e termina no começo da animação nova
        for (const lado of LADOS) {
          expect(entrePoses(de, para, 0).maos[lado].punho.distanceTo(de.maos[lado].punho)).toBeLessThan(1e-9);
          expect(entrePoses(de, para, 1).maos[lado].punho.distanceTo(para.maos[lado].punho)).toBeLessThan(1e-9);
        }
        for (const u of [0.25, 0.5, 0.75]) {
          posarPose(b, entrePoses(de, para, u));
          for (const lado of LADOS) {
            expect(b.folga(lado)).toBeGreaterThan(-2e-4);
            const p = b.ancora(lado, 'dedos');
            expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          }
        }
      }
    }
  });

  it('as fichas vão com a mão e ficam onde foram pousadas', () => {
    const c = clipes[0];
    const noMeio = aplicar(b, c, 1.5).filter((o) => o.tipo === 'ficha');
    const levadas = noMeio.slice(-5);
    for (const f of levadas) expect(f.pos.distanceTo(b.ancora('D', 'pinca3'))).toBeLessThan(0.03);
    const noFim = aplicar(b, c, 3.5).filter((o) => o.tipo === 'ficha').slice(-5);
    expect(noFim[0].pos.z).toBeCloseTo(0.53, 3);
    expect(noFim[0].pos.y).toBeLessThan(MESA + 0.004);
  });
});

describe('a entrega de cartas para qualquer ponto da mesa', () => {
  const b = new Boneco(montarEsqueleto());
  const cima = (o: { quat: THREE.Quaternion }) => new THREE.Vector3(0, 1, 0).applyQuaternion(o.quat).y;
  const ao = (o: { quat: THREE.Quaternion }) => new THREE.Vector3(0, 0, 1).applyQuaternion(o.quat);
  // diante dos dois vizinhos (quase ao lado), do outro lado da mesa, numa ponta distante, e as do próprio dealer
  const alvos: [number, number][] = [
    [0.93, 0.5],
    [-0.93, 0.5],
    [0.62, 1.02],
    [-1.7, 0.9],
    [0.04, 0.47],
    [-0.04, 0.47],
  ];

  it('cada carta para no alvo dela, deitada de costas, e o braço alcança de onde solta', () => {
    const c = entregarCartas(b, alvos.map((alvo) => ({ alvo })));
    for (let i = 0; i <= 120; i++) {
      aplicar(b, c, (c.dur * i) / 120);
      for (const lado of LADOS) {
        expect(b.faltou[lado], 'fora do alcance em ' + i + '/120').toBeLessThan(1e-3);
        expect(b.folga(lado)).toBeGreaterThan(-2e-4);
      }
    }
    const cartas = aplicar(b, c, c.dur).filter((o) => o.tipo === 'carta');
    expect(cartas.length).toBe(alvos.length);
    cartas.forEach((o, i) => {
      expect(o.n).toBe(i);
      expect(o.pousada).toBe(true);
      expect(o.pos.x).toBeCloseTo(alvos[i][0], 4);
      expect(o.pos.z).toBeCloseTo(alvos[i][1], 4);
      expect(o.pos.y).toBeLessThan(MESA + CARTA.alto * 3);
      expect(cima(o)).toBeGreaterThan(0.999);
    });
  });

  it('as cartas saem uma a uma, no ritmo pedido (e nunca mais ligeiro do que os dedos aguentam)', () => {
    const calma = entregarCartas(b, alvos.map((alvo) => ({ alvo })));
    const ligeira = entregarCartas(b, alvos.map((alvo) => ({ alvo })), { cada: 1 });
    const demais = entregarCartas(b, alvos.map((alvo) => ({ alvo })), { cada: 0.2 });
    expect(ligeira.dur).toBeLessThan(calma.dur - 2);
    expect(demais.dur).toBeGreaterThan((alvos.length - 1) * RITMO_MAIS_LIGEIRO);
    // a meio da entrega calma, as primeiras já pousaram e as últimas ainda estão no baralho
    const meio = aplicar(b, calma, calma.dur / 2).filter((o) => o.tipo === 'carta');
    expect(meio.length).toBeGreaterThan(1);
    expect(meio.length).toBeLessThan(alvos.length);
    expect(meio[0].pousada).toBe(true);
  });

  it('com o jeito de deitar dito, a carta para virada assim', () => {
    const c = entregarCartas(b, [
      { alvo: [0.6, 0.9], giro: Math.PI / 2 },
      { alvo: [-0.6, 0.9], giro: -0.4 },
    ]);
    const cartas = aplicar(b, c, c.dur).filter((o) => o.tipo === 'carta');
    expect(Math.atan2(ao(cartas[0]).x, ao(cartas[0]).z)).toBeCloseTo(Math.PI / 2, 4);
    expect(Math.atan2(ao(cartas[1]).x, ao(cartas[1]).z)).toBeCloseTo(-0.4, 4);
  });

  it('as cartas da mesa são abertas: viram no ar e pousam de frente para cima, no lugar e no rumo delas', () => {
    const onde: [number, number][] = [
      [0.075, 0.74],
      [0, 0.74],
      [-0.075, 0.74],
    ];
    const c = abrirCartas(b, onde, 0.3);
    const cartas = aplicar(b, c, c.dur).filter((o) => o.tipo === 'carta');
    expect(cartas.length).toBe(3);
    cartas.forEach((o, i) => {
      expect(o.aberta).toBe(true);
      expect(o.pos.x).toBeCloseTo(onde[i][0], 4);
      expect(o.pos.z).toBeCloseTo(onde[i][1], 4);
      // de frente para cima: o verso (o lado de cima da carta de costas) olha para baixo
      expect(cima(o)).toBeLessThan(-0.999);
    });
    // a meio do voo da primeira, ela ainda não está nem de costas nem de frente
    const voando = aplicar(b, c, 1.5).filter((o) => o.tipo === 'carta')[0];
    expect(voando.pousada).toBe(false);
    expect(Math.abs(cima(voando))).toBeLessThan(0.98);
  });

  it('um ponto da mesa visto de um lugar: à frente de quem olha é z, à esquerda dele é x', () => {
    // sentado no lado de +z da mesa, olhando para −z (o meio dela)
    const lugar = { x: 0, z: 0.74, giro: Math.PI };
    const [x, z] = vistoDoLugar(lugar, [0, 0]);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0.74, 9);
    // um ponto no lado de −x do mundo fica à esquerda dele (x positivo): ele olha para −z
    expect(vistoDoLugar(lugar, [-0.5, 0])[0]).toBeCloseTo(0.5, 9);
    // e de um lugar na ponta de −x da mesa, olhando para +x: o que está em +z do mundo fica à direita dele
    const [x2, z2] = vistoDoLugar({ x: -1.29, z: 0, giro: Math.PI / 2 }, [0, 0.3]);
    expect(z2).toBeCloseTo(1.29, 9);
    expect(x2).toBeCloseTo(-0.3, 9);
  });
});

describe('desistir da mão', () => {
  const b = new Boneco(montarEsqueleto());
  const c = desistir(b);

  it('a esquerda fica em descanso, de palma para baixo, do começo ao fim', () => {
    const repouso = poseDe(c, 0).maos.E;
    for (let i = 0; i <= 40; i++) {
      const e = poseDe(c, (c.dur * i) / 40).maos.E;
      expect(e.punho.distanceTo(repouso.punho)).toBeLessThan(0.002);
      expect(e.palma.y).toBeLessThan(-0.99);
    }
  });

  it('a direita junta as duas cartas e as lança: elas terminam juntas no meio da mesa, de costas', () => {
    const noComeco = aplicar(b, c, 0).filter((o) => o.tipo === 'carta');
    expect(noComeco.length).toBe(2);
    expect(noComeco[0].pos.distanceTo(noComeco[1].pos)).toBeGreaterThan(0.07);
    // juntas, debaixo dos dedos, antes do lance
    const juntas = aplicar(b, c, 1.17).filter((o) => o.tipo === 'carta');
    expect(juntas[0].pos.distanceTo(juntas[1].pos)).toBeLessThan(0.012);
    expect(b.ancora('D', 'dedos').setY(0).distanceTo(juntas[1].pos.clone().setY(0))).toBeLessThan(0.006);
    // e no fim, no monte: longe de onde estavam, perto uma da outra, deitadas
    const noFim = aplicar(b, c, c.dur).filter((o) => o.tipo === 'carta');
    for (const o of noFim) {
      expect(o.pousada).toBe(true);
      expect(o.pos.z).toBeGreaterThan(0.85);
      expect(o.pos.y).toBeLessThan(MESA + CARTA.alto * 2);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(o.quat).y).toBeGreaterThan(0.999);
    }
    expect(noFim[0].pos.distanceTo(noFim[1].pos)).toBeLessThan(0.15);
    // a mão volta ao descanso
    expect(poseDe(c, c.dur).maos.D.punho.distanceTo(poseDe(c, 0).maos.D.punho)).toBeLessThan(1e-6);
  });

  it('as cartas e o monte podem estar em outro lugar', () => {
    const outra = desistir(b, {
      cartas: [
        [0.0, 0.42],
        [-0.07, 0.43],
      ],
      alvo: [0.3, 0.9],
    });
    const noFim = aplicar(b, outra, outra.dur).filter((o) => o.tipo === 'carta');
    for (const o of noFim) expect(Math.hypot(o.pos.x - 0.3, o.pos.z - 0.9)).toBeLessThan(0.08);
    for (let i = 0; i <= 60; i++) {
      aplicar(b, outra, (outra.dur * i) / 60);
      expect(b.faltou.D).toBeLessThan(1e-3);
    }
  });
});

describe('as mãos largadas', () => {
  const b = new Boneco(montarEsqueleto());
  const clipes = criarClipes(b);
  const clipe = (id: string) => clipes.find((c) => c.id === id)!;
  /** A folga de cada ponta de dedo (os quatro e o polegar) até a mesa. */
  const pontas = (lado: 'E' | 'D') => [0, 4, 8, 12, 16].map((i) => b.esferasNoMundo(lado)[i]).map((e) => e.p.y - e.r - MESA);

  it('no descanso relaxado, as pontas dos quatro dedos pousam na mesa: nenhuma fica no ar, nenhuma entra', () => {
    let semente = 11;
    const acaso = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 8; i++) {
      for (const lado of LADOS) {
        const r = relaxoAoAcaso(b, lado, acaso);
        const pose = poseDe(clipe('idle-plana'), 0);
        // (sem a respiração do clipe: a mão no descanso de sempre)
        pose.maos[lado] = descansoDe(b, lado);
        relaxar(pose.maos[lado], r, descansoDe(b, lado));
        posarPose(b, pose);
        const [i1, i2, i3, i4] = pontas(lado);
        for (const folga of [i1, i2, i3, i4]) {
          expect(folga).toBeGreaterThan(-0.0006);
          expect(folga).toBeLessThan(0.0008);
        }
        expect(b.folga(lado)).toBeGreaterThan(-0.0006);
      }
    }
  });

  it('deixar cair não muda os dedos que já estão pousados, e desce os que estão no ar', () => {
    const pose = poseDe(clipe('idle-plana'), 0);
    posarPose(b, pose);
    const levantados = [...pose.maos.E.f];
    for (let k = 0; k < 4; k++) levantados[k * 3] = -14;
    b.dedos('E', levantados);
    b.osso('mao.E').updateWorldMatrix(false, true);
    expect(Math.min(...pontas('E').slice(0, 4))).toBeGreaterThan(0.005);
    const caidos = deixarCair(b, 'E', levantados);
    for (const folga of pontas('E').slice(0, 4)) expect(Math.abs(folga)).toBeLessThan(0.0006);
    // (e de novo: já pousados, ficam onde estão)
    const deNovo = deixarCair(b, 'E', caidos);
    deNovo.forEach((v, k) => expect(v).toBeCloseTo(caidos[k], 0));
  });

  it('batucando, o punho fica apoiado na mesa (e não um palmo no ar), com as pontas dos dedos encostadas', () => {
    aplicar(b, clipe('idle-batucando'), 0);
    const espalmada = b.ancora('E', 'punho').y;
    expect(b.ancora('D', 'punho').y - espalmada).toBeLessThan(0.004);
    expect(b.folga('D')).toBeGreaterThan(-0.0006);
  });

  it('uma sobre a outra: os dedos da de cima caem até encostar na de baixo ou na mesa, sem entrar em nenhuma', () => {
    aplicar(b, clipe('idle-sobrepostas'), 0);
    const baixo = b.esferasNoMundo('E');
    const cima = b.esferasNoMundo('D');
    // cada ponta de dedo da mão de cima está encostada em alguma coisa (a mesa, ou a outra mão)
    for (const i of [0, 4, 8, 12]) {
      const e = cima[i];
      const folga = Math.min(e.p.y - e.r - MESA, ...baixo.map((o) => e.p.distanceTo(o.p) - e.r - o.r));
      expect(folga).toBeLessThan(0.002);
      expect(folga).toBeGreaterThan(-0.0025);
    }
    // e nenhum dedo ficou esticado: todos dobram em alguma junta
    const f = poseDe(clipe('idle-sobrepostas'), 0).maos.D.f;
    for (let k = 0; k < 4; k++) expect(f[k * 3] + f[k * 3 + 1] + f[k * 3 + 2]).toBeGreaterThan(20);
  });

  it('esperando com o baralho, a mão que o segura descansa na mesa', () => {
    const noAr = maoComOBaralho(b);
    const pousada = maoComOBaralho(b, undefined, true);
    expect(pousada.mao.punho.y).toBeLessThan(noAr.mao.punho.y - 0.02);
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posarPose(b, { ...poseDe(clipe('idle-plana'), 0), maos: { ...poseDe(clipe('idle-plana'), 0).maos, E: pousada.mao } });
    expect(b.folga('E')).toBeGreaterThan(-0.0006);
    expect(b.folga('E')).toBeLessThan(0.003);
  });
});

describe('as mãos e as cartas abertas (no jogo elas são 2D, por cima das mãos)', () => {
  const b = new Boneco(montarEsqueleto());
  const fora = retanguloDasCartas();
  /** O quanto alguma mão fica em cima das cartas, de `desde` até o fim do clipe. */
  const emCima = (c: ReturnType<typeof idleAbertas>, desde = 0) => {
    let pior = -Infinity;
    for (let t = desde; t <= c.dur + 1e-9; t += 0.04) {
      aplicar(b, c, t);
      for (const lado of LADOS) pior = Math.max(pior, sobreORetangulo(b, lado, fora));
    }
    return pior;
  };

  it('o descanso de quem tem cartas abertas fica fora delas, com folga, e a mão continua na mesa', () => {
    const c = idleAbertas(b);
    expect(emCima(c)).toBeLessThan(-0.008);
    aplicar(b, c, 0);
    for (const lado of LADOS) expect(Math.abs(b.folga(lado))).toBeLessThan(0.002);
  });

  it('ao virar as cartas, elas só contam como abertas quando as mãos já saíram de cima', () => {
    const c = virarAPilha(b, undefined, 'virar-pilha', 'virar', fora);
    let abertas = NaN;
    for (let t = 0; t <= c.dur; t += 0.01) {
      if (c.objetos!(t, b).every((o) => o.aberta)) {
        abertas = t;
        break;
      }
    }
    expect(abertas).toBeGreaterThan(2.34);
    expect(abertas).toBeLessThan(c.dur);
    expect(emCima(c, abertas)).toBeLessThan(0.003);
  });

  it('ganhar o pote com as cartas abertas na frente: nenhuma mão passa por cima delas', () => {
    expect(emCima(ganhar(b, fora, 'ganhar-abertas'))).toBeLessThan(0.003);
  });
});
