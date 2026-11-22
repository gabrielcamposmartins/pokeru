/**
 * A física das coisas jogadas na mesa: fichas e anéis.
 *
 * Tudo o que se joga aqui é um **disco** — uma ficha é um, e um anel, visto de fora, também (o furo
 * não muda como ele quica, rola de lado e assenta). Cada disco é um corpo rígido de verdade: tem
 * peso, gira, bate na mesa pelos pontos da beirada, perde energia a cada batida e escorrega com
 * atrito até parar. É pouco, e é o bastante para uma ficha jogada cair de quina, rodopiar e deitar —
 * em vez de voar numa curva desenhada e pousar no lugar marcado.
 *
 * O que não é: um motor de física geral. Não há pilhas equilibradas nem corpos de outras formas. Um
 * disco se apoia na mesa e nos discos que já estão **deitados embaixo dele** (o que deixa fichas
 * caírem umas sobre as outras e ficarem meio encavaladas); dois discos na mesma altura se empurram
 * de lado, como moedas que se tocam. Cada mesa tem poucas dezenas de corpos, que dormem quando param.
 *
 * As contas são por impulso (a velocidade muda na batida, sem molas): firmes com passos pequenos,
 * e por isso `passo` reparte o tempo do quadro em pedaços de `DT`.
 */
import * as THREE from 'three';

/** O passo da conta (segundos). */
const DT = 1 / 240;
const GRAVIDADE = 9.81;
/** Quanto da batida volta (0 = não quica; a ficha de argila quica pouco). */
const QUIQUE = 0.32;
const ATRITO = 0.42;
/** A resistência ao rolar e ao girar deitado: é o que faz o rodopio acabar. */
const FREIO_DO_GIRO = 1.6;
const FREIO_DO_AR = 0.12;
/**
 * O corpo dorme quando, de uma conferida para a outra (a cada `SONO` segundos), quase não saiu do
 * lugar nem mudou de inclinação. (Medir a velocidade do instante não serve: encostado na mesa o
 * disco treme um nada a cada passo da conta, sem ir a lugar nenhum.)
 */
const QUASE_PARADO = { anda: 0.0004, inclina: 0.012 };
const SONO = 0.2;
/** Os pontos da beirada de cada face em que se confere o contato. */
const PONTOS_DA_BEIRADA = 10;

export interface Disco {
  pos: THREE.Vector3;
  /** A orientação: o eixo do disco é o y dele. */
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  /** A velocidade de giro, no mundo (rad/s). */
  giro: THREE.Vector3;
  raio: number;
  /** Metade da espessura. */
  meia: number;
  /** Dormindo: parou, e só acorda se alguma coisa bater nele. */
  dorme: boolean;
  /** Desde a última conferida do sono (s), e onde ele estava nela. */
  quieto: number;
  onde: THREE.Vector3;
  eixo: THREE.Vector3;
  /** Há quanto tempo existe (s). */
  idade: number;
}

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const eixo = new THREE.Vector3();
const q1 = new THREE.Quaternion();

/** Um disco novo, com a massa de uma ficha (o que importa é a forma: a massa cancela nas contas). */
export function disco(pos: THREE.Vector3, quat: THREE.Quaternion, vel: THREE.Vector3, giro: THREE.Vector3, raio: number, meia: number): Disco {
  return { pos: pos.clone(), quat: quat.clone(), vel: vel.clone(), giro: giro.clone(), raio, meia, dorme: false, quieto: 0, onde: pos.clone(), eixo: new THREE.Vector3(0, 1, 0).applyQuaternion(quat), idade: 0 };
}

export class Mesa {
  readonly discos: Disco[] = [];
  private resto = 0;

  /** `nivel`: a altura do tampo. `dentro`, se dado, diz se um ponto (x, z) ainda é mesa (fora dela, o disco é devolvido para dentro). */
  constructor(
    readonly nivel: number,
    private readonly dentro?: (x: number, z: number) => boolean,
  ) {}

  por(d: Disco): Disco {
    this.discos.push(d);
    return d;
  }

  tirar(d: Disco): void {
    const i = this.discos.indexOf(d);
    if (i >= 0) this.discos.splice(i, 1);
    // (o que estava em cima dele acorda, para cair)
    for (const o of this.discos) if (o.dorme && o.pos.y > d.pos.y && Math.hypot(o.pos.x - d.pos.x, o.pos.z - d.pos.z) < o.raio + d.raio) acordar(o);
  }

  /** Todos parados? */
  get quieta(): boolean {
    return this.discos.every((d) => d.dorme);
  }

  /** Anda `dt` segundos (repartidos em passos de conta). Devolve quantas batidas fortes houve na mesa (para o som). */
  passo(dt: number): number {
    this.resto += Math.min(dt, 0.05);
    let batidas = 0;
    while (this.resto >= DT) {
      this.resto -= DT;
      batidas += this.umPasso();
    }
    return batidas;
  }

  /** A altura do apoio debaixo de um ponto, para um disco: o tampo, ou o alto de um disco deitado que está embaixo. */
  private apoio(de: Disco, x: number, z: number, y: number): number {
    let alto = this.nivel;
    for (const o of this.discos) {
      if (o === de) continue;
      // só serve de chão quem está deitado e claramente abaixo deste ponto
      const topo = o.pos.y + o.meia;
      if (topo <= alto || topo > y + o.meia) continue;
      if (Math.abs(v4.set(0, 1, 0).applyQuaternion(o.quat).y) < 0.93) continue;
      if (o.pos.y > de.pos.y - (o.meia + de.meia) * 0.6) continue;
      if (Math.hypot(x - o.pos.x, z - o.pos.z) <= o.raio) alto = topo;
    }
    return alto;
  }

  private umPasso(): number {
    let batidas = 0;
    for (const d of this.discos) {
      if (d.dorme) continue;
      d.idade += DT;
      d.vel.y -= GRAVIDADE * DT;
      d.vel.multiplyScalar(1 - FREIO_DO_AR * DT);

      // a inércia no mundo: um disco gira mais fácil em volta de um diâmetro do que em volta do eixo
      const perto = 0.25 * d.raio * d.raio + (d.meia * d.meia) / 3;
      const noEixo = 0.5 * d.raio * d.raio;
      eixo.set(0, 1, 0).applyQuaternion(d.quat);
      /** I⁻¹·v, com I = perto·(1 − e eᵀ) + noEixo·(e eᵀ). */
      const inversa = (v: THREE.Vector3, sai: THREE.Vector3) => {
        const ao = v.dot(eixo);
        return sai.copy(v).addScaledVector(eixo, -ao).multiplyScalar(1 / perto).addScaledVector(eixo, ao / noEixo);
      };

      // os pontos de contato: a beirada das duas faces que entrou no apoio
      const contatos: { r: THREE.Vector3; chegando: number; jn: number; jx: number; jz: number }[] = [];
      let fundo = 0;
      for (let face = -1; face <= 1; face += 2) {
        for (let k = 0; k < PONTOS_DA_BEIRADA; k++) {
          const a = (k / PONTOS_DA_BEIRADA) * Math.PI * 2 + (face > 0 ? 0.3 : 0);
          // r: do centro ao ponto, no mundo
          v1.set(Math.cos(a) * d.raio, face * d.meia, Math.sin(a) * d.raio).applyQuaternion(d.quat);
          const py = d.pos.y + v1.y;
          const entra = this.apoio(d, d.pos.x + v1.x, d.pos.z + v1.z, py) - py;
          if (entra <= 0) continue;
          fundo = Math.max(fundo, entra);
          contatos.push({ r: v1.clone(), chegando: v2.copy(d.giro).cross(v1).add(d.vel).y, jn: 0, jx: 0, jz: 0 });
        }
      }
      const tocou = contatos.length > 0;
      // As batidas, por impulsos somados e conferidos várias vezes: cada ponto empurra só para fora, e o
      // conjunto chega ao mesmo resultado em qualquer ordem — um disco que cai deitado fica deitado, em
      // vez de levar um tranco do primeiro ponto conferido.
      for (let volta = 0; volta < 8 && tocou; volta++) {
        for (const c of contatos) {
          // o impulso normal (a normal é para cima); a batida forte devolve um pouco da velocidade
          v3.set(0, 1, 0);
          const k1 = 1 + inversa(v4.copy(c.r).cross(v3), v4).cross(c.r).dot(v3);
          const vn = v2.copy(d.giro).cross(c.r).add(d.vel).y;
          const volta0 = c.chegando < -0.35 ? -QUIQUE * c.chegando : 0;
          const antes = c.jn;
          c.jn = Math.max(0, antes + (volta0 - vn) / k1);
          const dj = c.jn - antes;
          if (dj !== 0) {
            d.vel.y += dj;
            d.giro.add(inversa(v4.copy(c.r).cross(v3).multiplyScalar(dj), v4));
          }
          // o atrito, contra o escorregão do ponto, até o limite que o aperto dá
          for (const lado of [0, 1] as const) {
            v3.set(lado === 0 ? 1 : 0, 0, lado === 0 ? 0 : 1);
            const kt = 1 + inversa(v4.copy(c.r).cross(v3), v4).cross(c.r).dot(v3);
            const vt = v2.copy(d.giro).cross(c.r).add(d.vel).dot(v3);
            const era = lado === 0 ? c.jx : c.jz;
            const limite = ATRITO * c.jn;
            const agora = Math.max(-limite, Math.min(limite, era - vt / kt));
            const dt2 = agora - era;
            if (lado === 0) c.jx = agora;
            else c.jz = agora;
            if (dt2 !== 0) {
              d.vel.addScaledVector(v3, dt2);
              d.giro.add(inversa(v4.copy(c.r).cross(v3).multiplyScalar(dt2), v4));
            }
          }
        }
      }
      for (const c of contatos) if (c.chegando < -0.6) {
        batidas++;
        break;
      }
      if (tocou) {
        // não afunda: sobe o que entrou (quase tudo: o resto some nos passos seguintes, sem tranco)
        d.pos.y += fundo * 0.8;
        // encostado, o giro e o rolar gastam-se depressa — mais ainda quando já está deitado
        const deitado = Math.abs(eixo.y) > 0.995;
        d.giro.multiplyScalar(1 - (deitado ? 9 : FREIO_DO_GIRO) * DT);
        d.vel.x *= 1 - (deitado ? 2.5 : 0.8) * DT;
        d.vel.z *= 1 - (deitado ? 2.5 : 0.8) * DT;
      }

      // os vizinhos na mesma altura empurram de lado, como moedas que se tocam
      for (const o of this.discos) {
        if (o === d) continue;
        if (Math.abs(o.pos.y - d.pos.y) > (o.meia + d.meia) * 0.9) continue;
        const dx = d.pos.x - o.pos.x;
        const dz = d.pos.z - o.pos.z;
        const dist = Math.hypot(dx, dz);
        const junto = d.raio + o.raio;
        // (só os que estão deitados: de quina, o disco ocupa menos)
        if (dist >= junto * 0.96 || dist < 1e-6) continue;
        if (Math.abs(eixo.y) < 0.8 || Math.abs(v4.set(0, 1, 0).applyQuaternion(o.quat).y) < 0.8) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const aperto = junto * 0.96 - dist;
        const parte = o.dorme ? 1 : 0.5;
        d.pos.x += nx * aperto * 0.5 * parte;
        d.pos.z += nz * aperto * 0.5 * parte;
        const chegando = d.vel.x * nx + d.vel.z * nz;
        if (chegando < 0) {
          d.vel.x -= nx * chegando * 1.2;
          d.vel.z -= nz * chegando * 1.2;
        }
      }

      // anda
      d.pos.addScaledVector(d.vel, DT);
      const w = d.giro.length();
      if (w > 1e-6) {
        q1.setFromAxisAngle(v4.copy(d.giro).multiplyScalar(1 / w), w * DT);
        d.quat.premultiply(q1).normalize();
      }
      // a beirada da mesa segura (ninguém quer uma ficha no chão)
      if (this.dentro && !this.dentro(d.pos.x, d.pos.z)) {
        d.pos.addScaledVector(d.vel, -DT);
        d.vel.x *= -0.3;
        d.vel.z *= -0.3;
      }
      // dorme quando para: de tempos em tempos confere se saiu do lugar
      d.quieto += DT;
      if (d.quieto >= SONO) {
        d.quieto = 0;
        eixo.set(0, 1, 0).applyQuaternion(d.quat);
        if (tocou && d.pos.distanceTo(d.onde) < QUASE_PARADO.anda && eixo.distanceTo(d.eixo) < QUASE_PARADO.inclina) {
          d.dorme = true;
          d.vel.set(0, 0, 0);
          d.giro.set(0, 0, 0);
          // deitado no tampo, assenta de vez: reto e na altura certa (o tremor da conta o deixava um fio abaixo)
          if (Math.abs(eixo.y) > 0.999 && this.apoio(d, d.pos.x, d.pos.z, d.pos.y) === this.nivel && d.pos.y < this.nivel + d.meia + 0.0006) {
            q1.setFromUnitVectors(eixo, v4.set(0, Math.sign(eixo.y), 0));
            d.quat.premultiply(q1).normalize();
            d.pos.y = this.nivel + d.meia;
          }
        }
        d.onde.copy(d.pos);
        d.eixo.copy(eixo);
      }
      // (uma rede: o que ficou vivo tempo demais dorme onde está)
      if (d.idade > 6) d.dorme = true;
    }
    return batidas;
  }
}

/** Acorda um disco (alguma coisa mexeu no que o segurava). */
export function acordar(d: Disco): void {
  d.dorme = false;
  d.quieto = 0;
  d.onde.set(Infinity, 0, 0);
  d.idade = Math.min(d.idade, 3);
}
