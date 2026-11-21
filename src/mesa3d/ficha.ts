/**
 * A ficha da mesa 3D: um sólido de revolução com o relevo de uma ficha de cassino, e não um
 * cilindro com um adesivo em cima — o miolo (onde vai o valor) rebaixado, a beirada plana em volta
 * dele, a quina arredondada e a lateral. É o relevo que pega a luz: o degrau do miolo e a quina
 * ganham brilho de um lado e sombra do outro, e a ficha se lê como objeto.
 *
 * O desenho continua sendo o do estilo (src/render/Chip.tsx, o mesmo da ficha 2D): a face é posta
 * de cima, reta, até a quina — os blocos da borda descem por ela —, e a lateral dá a volta com os
 * mesmos blocos, no mesmo ângulo (veja `texturaDaLateral`, em aparencia.ts).
 *
 * Três grupos, na ordem dos materiais de `materiaisDaFicha`: a lateral (0), a face de cima (1) e a
 * de baixo (2).
 */
import * as THREE from 'three';
import { FICHA } from '../personagem/animacoes';

/** As medidas do relevo (as frações são do raio da ficha; as alturas, em metros). */
export const RELEVO_DA_FICHA = {
  /** Quantos gomos a volta tem. */
  gomos: 32,
  /** A altura do sólido: um nada menos que o passo da pilha, para a junta entre duas fichas aparecer. */
  alto: FICHA.alto * 0.94,
  /** Onde o miolo rebaixado acaba e onde o degrau chega à beirada (o anel do desenho fica em 0,62–0,64 do raio). */
  miolo: 0.635,
  degrau: 0.675,
  /** O quanto o miolo fica abaixo da beirada. */
  fundo: 0.00038,
  /** Onde a quina arredondada começa, e o quanto ela desce até a lateral. */
  quina: 0.89,
  cai: 0.00065,
};

/** Um anel do perfil: o raio (fração), a altura (a contar do topo, para baixo), a normal (para fora, para cima) e a parte. */
interface Anel {
  r: number;
  y: number;
  nr: number;
  ny: number;
  parte: 0 | 1 | 2;
}

/** O perfil da ficha, do meio da face de cima, por fora, até o meio da face de baixo. */
export function perfilDaFicha(): Anel[] {
  const { alto, miolo, degrau, fundo, quina, cai } = RELEVO_DA_FICHA;
  const R = FICHA.raio;
  const aneis: Anel[] = [];
  const poe = (parte: 0 | 1 | 2, r: number, y: number, nr: number, ny: number) => {
    const n = Math.hypot(nr, ny);
    aneis.push({ r, y, nr: nr / n, ny: ny / n, parte });
  };
  // a face de cima: o miolo, o degrau (com a normal dele: é uma quina viva), a beirada e a quina arredondada
  poe(1, 0, fundo, 0, 1);
  poe(1, miolo, fundo, 0, 1);
  const subida = [fundo, (degrau - miolo) * R];
  poe(1, miolo, fundo, -subida[0], subida[1]);
  poe(1, degrau, 0, -subida[0], subida[1]);
  poe(1, degrau, 0, 0, 1);
  poe(1, quina, 0, 0, 1);
  // (um quarto de elipse: a normal de cada ponto é a da elipse)
  const largo = (1 - quina) * R;
  for (let k = 1; k <= 3; k++) {
    const a = (k / 3) * (Math.PI / 2);
    poe(1, quina + (1 - quina) * Math.sin(a), cai * (1 - Math.cos(a)), cai * Math.sin(a), largo * Math.cos(a));
  }
  // a lateral
  poe(0, 1, cai, 1, 0);
  poe(0, 1, alto - cai, 1, 0);
  // a face de baixo: a quina (mais simples: ninguém a vê de perto) e o fundo liso
  poe(2, 1, alto - cai, 1, 0);
  poe(2, quina + (1 - quina) * Math.SQRT1_2, alto - cai * (1 - Math.SQRT1_2), cai * Math.SQRT1_2, -largo * Math.SQRT1_2);
  poe(2, quina, alto, 0, -1);
  poe(2, 0, alto, 0, -1);
  return aneis;
}

/** A geometria da ficha, deitada (o eixo é o y), com o meio na origem. */
export function geometriaDaFicha(): THREE.BufferGeometry {
  const { gomos, alto } = RELEVO_DA_FICHA;
  const R = FICHA.raio;
  const aneis = perfilDaFicha();
  const porAnel = gomos + 1;
  const pos = new Float32Array(aneis.length * porAnel * 3);
  const nor = new Float32Array(aneis.length * porAnel * 3);
  const uv = new Float32Array(aneis.length * porAnel * 2);
  aneis.forEach((a, i) => {
    for (let j = 0; j <= gomos; j++) {
      // (o ângulo vai de +x para +z: é o sentido em que o desenho da face põe os blocos da borda)
      const t = (j / gomos) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const k = i * porAnel + j;
      pos[k * 3] = a.r * R * c;
      pos[k * 3 + 1] = alto / 2 - a.y;
      pos[k * 3 + 2] = a.r * R * s;
      nor[k * 3] = a.nr * c;
      nor[k * 3 + 1] = a.ny;
      nor[k * 3 + 2] = a.nr * s;
      if (a.parte === 0) {
        uv[k * 2] = j / gomos;
        uv[k * 2 + 1] = 1 - (a.y - aneis.find((x) => x.parte === 0)!.y) / (alto - 2 * aneis.find((x) => x.parte === 0)!.y);
      } else {
        // a face, de cima: o desenho reto, com o lado de lá (−z) no alto dele; por baixo, espelhado
        uv[k * 2] = 0.5 + ((a.parte === 1 ? 1 : -1) * a.r * c) / 2;
        uv[k * 2 + 1] = 0.5 - (a.r * s) / 2;
      }
    }
  });
  const idx: number[] = [];
  const grupos: { parte: number; de: number; quantos: number }[] = [];
  for (let i = 0; i + 1 < aneis.length; i++) {
    // (entre uma parte e a outra não há faixa: o anel é repetido, com as coordenadas da textura de cada uma)
    if (aneis[i].parte !== aneis[i + 1].parte) continue;
    const de = idx.length;
    for (let j = 0; j < gomos; j++) {
      const a = i * porAnel + j;
      const b = (i + 1) * porAnel + j;
      if (aneis[i].r > 0) idx.push(a, a + 1, b + 1);
      if (aneis[i + 1].r > 0) idx.push(a, b + 1, b);
    }
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.parte === aneis[i].parte) ultimo.quantos += idx.length - de;
    else grupos.push({ parte: aneis[i].parte, de, quantos: idx.length - de });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  for (const g of grupos) geo.addGroup(g.de, g.quantos, g.parte);
  return geo;
}
