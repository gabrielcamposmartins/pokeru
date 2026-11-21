/**
 * As unhas: uma plaquinha fina deitada no dorso da ponta de cada dedo.
 *
 * A unha é fina demais para sair da grade que malha o corpo, então ganha a malha dela: um leque de
 * anéis no formato da unha, com cada ponto posto em cima da pele (achada descendo do alto até o
 * campo do corpo mudar de sinal) e levantado da espessura da unha. Na raiz ela nasce debaixo da
 * pele; perto da ponta do dedo ela para de acompanhar a pele e segue reta, passando um pouco do dedo.
 */
import type { Campo, V3 } from './campo';
import type { Malha } from './malha';

export interface Unha {
  /** O fim do dedo, no eixo dele. */
  ponta: V3;
  /** Para onde o dedo aponta, para onde olha o dorso dele, e o lado (os três de tamanho 1). */
  eixo: V3;
  dorso: V3;
  lado: V3;
  /** O comprimento e a largura da unha. */
  comp: number;
  larg: number;
  /** O quanto a beirada da unha passa do fim do dedo. */
  passa: number;
  /** A que distância da ponta do dedo a unha deixa de acompanhar a pele e segue reta. */
  solta: number;
}

const ANEIS = 9;
const GOMOS = 44;
/** A espessura da plaquinha (só se vê na parte que passa do dedo). */
const ESPESSURA = 0.00045;

const soma = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const menos = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const escalar = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vetorial = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unitario(a: V3): V3 {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}
const degrau = (de: number, ate: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - de) / (ate - de)));
  return t * t * (3 - 2 * t);
};

export function malharUnha(campo: Campo, u: Unha): Malha {
  /** A pele embaixo do ponto que fica `a` metros além da ponta do dedo (negativo = para trás) e `b` para o lado. */
  const pele = (a: number, b: number): { p: V3; n: V3 } => {
    for (let tenta = 0; tenta < 8; tenta++, b *= 0.85) {
      const alto = soma(soma(soma(u.ponta, u.eixo, a), u.lado, b), u.dorso, 0.0085);
      const em = (h: number): V3 => soma(alto, u.dorso, -h);
      const d = (h: number) => {
        const q = em(h);
        return campo(q[0], q[1], q[2]);
      };
      // desce do alto até entrar na pele, e depois afina o ponto
      let fora = 0;
      let dentro = -1;
      for (let h = 0.0004; h < 0.017; h += 0.0004) {
        if (d(h) < 0) {
          dentro = h;
          break;
        }
        fora = h;
      }
      if (dentro < 0) continue;
      for (let i = 0; i < 12; i++) {
        const meio = (fora + dentro) / 2;
        if (d(meio) < 0) dentro = meio;
        else fora = meio;
      }
      const p = em((fora + dentro) / 2);
      const e = 0.0003;
      const n = unitario([campo(p[0] + e, p[1], p[2]) - campo(p[0] - e, p[1], p[2]), campo(p[0], p[1] + e, p[2]) - campo(p[0], p[1] - e, p[2]), campo(p[0], p[1], p[2] + e) - campo(p[0], p[1], p[2] - e)]);
      return { p, n };
    }
    return { p: soma(u.ponta, u.eixo, a), n: u.dorso };
  };

  /**
   * Um ponto da unha: `s` vai de -1 (a raiz) a 1 (a beirada), `w` de -1 a 1 (de um lado ao outro).
   * A unha estreita um pouco para a beirada, e é mais alta no meio do que nos lados.
   */
  const ponto = (s: number, w: number): V3 => {
    const a = u.passa - u.comp + ((s + 1) * u.comp) / 2;
    const b = ((w * u.larg) / 2) * (1 - 0.3 * Math.max(s, 0) ** 2);
    // debaixo da pele na raiz, e subindo até a espessura cheia
    const alto = -0.00015 + 0.0005 * degrau(-1, -0.3, s) - 0.00022 * w ** 4 * (1 - 0.6 * Math.max(s, 0));
    const ate = -u.solta;
    if (a <= ate) {
      const q = pele(a, b);
      return soma(q.p, q.n, alto);
    }
    // daqui para a frente a unha segue reta, na direção em que a pele vinha
    const q = pele(ate, b);
    const antes = pele(ate - 0.0006, b);
    return soma(soma(q.p, q.n, alto), unitario(menos(q.p, antes.p)), a - ate);
  };

  /** O contorno da unha: quadrado de cantos redondos na raiz, mais oval na beirada. */
  const contorno = (ang: number): [number, number] => {
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const n = c > 0 ? 2.3 : 3.2;
    const r = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(sn), n), -1 / n);
    return [c * r, sn * r];
  };

  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const poe = (p: V3, n: V3) => {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0], n[1], n[2]);
    return pos.length / 3 - 1;
  };
  /** A normal da face de cima num ponto: pela inclinação da própria unha, virada para o dorso. */
  const normalEm = (s: number, w: number): V3 => {
    const e = 0.03;
    const n = unitario(vetorial(menos(ponto(s + e, w), ponto(s - e, w)), menos(ponto(s, w + e), ponto(s, w - e))));
    return escalar(n, u.dorso) < 0 ? [-n[0], -n[1], -n[2]] : n;
  };
  /** Um triângulo, com os cantos na ordem que o deixa virado para `fora`. */
  const face = (a: number, b: number, c: number, fora: V3) => {
    const pa: V3 = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const pb: V3 = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
    const pc: V3 = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    if (escalar(vetorial(menos(pb, pa), menos(pc, pa)), fora) >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };

  // a face de cima: o centro e os anéis em volta
  const meio = ponto(0, 0);
  const centro = poe(meio, normalEm(0, 0));
  const anel: number[][] = [];
  for (let i = 1; i <= ANEIS; i++) {
    const linha: number[] = [];
    for (let k = 0; k < GOMOS; k++) {
      const [s, w] = contorno((k / GOMOS) * Math.PI * 2);
      linha.push(poe(ponto((s * i) / ANEIS, (w * i) / ANEIS), normalEm((s * i) / ANEIS, (w * i) / ANEIS)));
    }
    anel.push(linha);
  }
  for (let k = 0; k < GOMOS; k++) {
    const k1 = (k + 1) % GOMOS;
    face(centro, anel[0][k], anel[0][k1], u.dorso);
    for (let i = 0; i + 1 < ANEIS; i++) {
      face(anel[i][k], anel[i + 1][k], anel[i + 1][k1], u.dorso);
      face(anel[i][k], anel[i + 1][k1], anel[i][k1], u.dorso);
    }
  }

  // a face de baixo: a de cima descida da espessura da unha, virada para a palma
  const deCima = pos.length / 3;
  const porBaixo = (v: number) => {
    const nv: V3 = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]];
    return poe(soma([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], nv, -ESPESSURA), [-nv[0], -nv[1], -nv[2]]);
  };
  const baixo: number[] = [];
  for (let v = 0; v < deCima; v++) baixo.push(porBaixo(v));
  const paraBaixo: V3 = [-u.dorso[0], -u.dorso[1], -u.dorso[2]];
  for (let k = 0; k < GOMOS; k++) {
    const k1 = (k + 1) % GOMOS;
    face(baixo[centro], baixo[anel[0][k]], baixo[anel[0][k1]], paraBaixo);
    for (let i = 0; i + 1 < ANEIS; i++) {
      face(baixo[anel[i][k]], baixo[anel[i + 1][k]], baixo[anel[i + 1][k1]], paraBaixo);
      face(baixo[anel[i][k]], baixo[anel[i + 1][k1]], baixo[anel[i][k1]], paraBaixo);
    }
  }

  // a parede da beirada: liga a face de cima à de baixo
  const borda = anel[ANEIS - 1];
  const emCima: number[] = [];
  const embaixo: number[] = [];
  const paraFora: V3[] = [];
  for (let k = 0; k < GOMOS; k++) {
    const v = borda[k];
    const w = baixo[v];
    const p: V3 = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const nv: V3 = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]];
    const raio = menos(p, meio);
    const fora = unitario(soma(raio, nv, -escalar(raio, nv)));
    paraFora.push(fora);
    emCima.push(poe(p, fora));
    embaixo.push(poe([pos[w * 3], pos[w * 3 + 1], pos[w * 3 + 2]], fora));
  }
  for (let k = 0; k < GOMOS; k++) {
    const k1 = (k + 1) % GOMOS;
    face(emCima[k], embaixo[k], embaixo[k1], paraFora[k]);
    face(emCima[k], embaixo[k1], emCima[k1], paraFora[k]);
  }

  const n = pos.length / 3;
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), ar: new Float32Array(n).fill(1), unha: new Float32Array(n).fill(1), idx: new Uint32Array(idx) };
}
