/**
 * Prepara a arte dos personagens a partir de assets/characters/:
 *  - remove o fundo branco (preenchimento a partir das bordas + sementes para "buracos"
 *    de fundo cercados pelo desenho, ex.: entre o braço e o corpo);
 *  - suaviza a borda do recorte e remove o halo branco;
 *  - gera public/characters/<id>/full.png (corpo inteiro) e portrait.png (retrato quadrado).
 *
 *   npm run prepare:characters
 *   CHECK_DIR=pasta npm run prepare:characters   (também grava prévias sobre fundo escuro)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets', 'characters');
const OUT = join(root, 'public', 'characters');
const CHECK = process.env.CHECK_DIR;

/**
 * portrait: centro (cx, cy) e lado do quadrado, em pixels da imagem original.
 * holes: pontos [x, y] dentro de áreas de fundo cercadas pelo desenho.
 */
const CHARACTERS = {
  marina: { file: 'marina_frente.png', portrait: { cx: 505, cy: 140, side: 340 }, holes: [] },
  ren: { file: 'ren_frente.png', portrait: { cx: 505, cy: 110, side: 260 }, holes: [] },
  tobi: { file: 'tobi_frente.png', portrait: { cx: 500, cy: 115, side: 285 }, holes: [] },
  yukina: { file: 'yukina_frente.png', portrait: { cx: 520, cy: 135, side: 285 }, holes: [] },
};

/**
 * Distância máxima do tom de fundo para um pixel contar como fundo.
 *
 * Ajustável pela linha de comando (`TOL=12 npm run prepare:characters`) para arte de outro fundo.
 */
const TOL = Number(process.env.TOL) || 6;
/** Faixa (em distância de cor) usada para o alfa dos pixels da borda. */
const EDGE = 110;
/** Lado do quadrado do xadrez de transparência, em pixels da arte de origem. */
const SQUARE = Number(process.env.SQUARE) || 16;

/**
 * Os tons do fundo, lidos da moldura da imagem.
 *
 * A arte vem **achatada sobre o quadriculado de transparência** — dois cinzas neutros alternados, e
 * não um fundo chapado. Então o fundo não é uma cor só. Ler os tons da imagem, em vez de cravar
 * 255, é o que faz o recorte continuar valendo se a arte trocar de novo.
 */
function bgTones(png) {
  const { width: w, height: h, data } = png;
  const conta = new Map();
  const ver = (x, y) => {
    const i = (y * w + x) * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // só tom neutro entra: assim um desenho que encoste na moldura não vira "fundo"
    if (Math.max(r, g, b) - Math.min(r, g, b) > 2) return;
    const v = Math.round((r + g + b) / 3);
    conta.set(v, (conta.get(v) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) for (const y of [0, 1, 2, h - 3, h - 2, h - 1]) ver(x, y);
  for (let y = 0; y < h; y++) for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) ver(x, y);
  const tons = [];
  for (const [v] of [...conta].sort((a, b) => b[1] - a[1])) {
    if (tons.length >= 2) break;
    // o segundo tom tem de ser o *outro* quadrado, não um vizinho do primeiro
    if (tons.every((t) => Math.abs(t - v) > 6)) tons.push(v);
  }
  return tons;
}

/** Onde começa a grade do xadrez: o primeiro ponto da moldura em que o tom troca. */
function fase(png, tons) {
  const { width: w, data } = png;
  const tomDe = (x, y) => {
    const i = (y * w + x) * 4;
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    return Math.abs(v - tons[0]) < Math.abs(v - tons[1]) ? 0 : 1;
  };
  let x = 0;
  while (x < SQUARE * 3 && tomDe(x, 1) === tomDe(0, 1)) x++;
  let y = 0;
  while (y < SQUARE * 3 && tomDe(1, y) === tomDe(1, 0)) y++;
  return { x: x % SQUARE, y: y % SQUARE };
}

function cutout(png, holes) {
  const { width: w, height: h, data } = png;
  const tons = bgTones(png);
  /** Distância do pixel ao tom de fundo mais próximo. Cor fora do cinza neutro nunca é fundo. */
  const dist = (p) => {
    const i = p * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const croma = Math.max(r, g, b) - Math.min(r, g, b);
    const v = (r + g + b) / 3;
    return Math.max(croma * 4, Math.min(...tons.map((t) => Math.abs(v - t))));
  };

  const isBg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  const push = (p) => {
    if (!isBg[p] && dist(p) <= TOL) {
      isBg[p] = 1;
      queue[qt++] = p;
    }
  };
  // Semeia pela grade do xadrez, não pixel a pixel. O fundo é um tabuleiro regular: quadrados de
  // SQUARE px, tom claro e escuro alternando. Então dá para saber a cor que o fundo *teria* em cada
  // ponto e só aceitar quem bate com ela — e ainda exigir que a vizinhança seja lisa, porque o
  // quadrado é chapado e roupa branca tem textura. É o que impede o recorte de furar a camiseta.
  const grade = fase(png, tons);
  const esperado = (x, y) => tons[(((x - grade.x) / SQUARE) | 0) + (((y - grade.y) / SQUARE) | 0) & 1 ? 1 : 0];
  const liso = (x, y) => {
    let min = 255;
    let max = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = (ny * w + nx) * 4;
        const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return max - min <= 3;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const croma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (croma <= 2 && Math.abs(v - esperado(x, y)) <= TOL && liso(x, y)) push(p);
    }
  }
  for (const [x, y] of holes) push(y * w + x);
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }

  // Tira as manchas soltas: um pedaço de fundo de verdade ou encosta na moldura ou é grande (um
  // quadrado inteiro tem SQUARE² px). O que sobra pequeno e cercado é reflexo chapado em roupa
  // branca que passou pelos filtros — furar a camiseta do personagem é pior que deixar um quadrado.
  const grupo = new Int32Array(w * h).fill(-1);
  const area = [];
  const naBorda = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!isBg[p0] || grupo[p0] >= 0) continue;
    const g = area.length;
    area.push(0);
    naBorda.push(false);
    const fila = [p0];
    grupo[p0] = g;
    while (fila.length) {
      const p = fila.pop();
      const x = p % w;
      const y = (p / w) | 0;
      area[g]++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) naBorda[g] = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && isBg[q] && grupo[q] < 0) {
          grupo[q] = g;
          fila.push(q);
        }
      }
    }
  }
  const MIN_MANCHA = SQUARE * SQUARE * 1.5;
  for (let p = 0; p < w * h; p++) {
    const g = grupo[p];
    if (g >= 0 && !naBorda[g] && area[g] < MIN_MANCHA) isBg[p] = 0;
  }

  // E o contrário: respingos de desenho soltos no fundo. São ruído do JPEG da arte (um pixel que
  // não ficou nem neutro nem liso), e ficariam como pontinhos brancos flutuando em volta do
  // personagem. Só sobrevive ilha de tamanho de desenho.
  const ilha = new Int32Array(w * h).fill(-1);
  const tam = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (isBg[p0] || ilha[p0] >= 0) continue;
    const g = tam.length;
    tam.push(0);
    const fila = [p0];
    ilha[p0] = g;
    while (fila.length) {
      const p = fila.pop();
      const x = p % w;
      const y = (p / w) | 0;
      tam[g]++;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !isBg[q] && ilha[q] < 0) {
          ilha[q] = g;
          fila.push(q);
        }
      }
    }
  }
  const MIN_ILHA = 200;
  for (let p = 0; p < w * h; p++) {
    const g = ilha[p];
    if (g >= 0 && tam[g] < MIN_ILHA) isBg[p] = 1;
  }

  // Auréola: pixels colados no fundo que ficaram por pouco (ruído do JPEG na beirada do desenho).
  // Sozinhos viram respingos brancos na silhueta. Duas passadas de erosão em quem é claro e sem cor
  // resolvem; mais que isso começaria a comer roupa branca de verdade.
  const HALO = tons[1] !== undefined ? Math.min(...tons) - 14 : 200;
  for (let volta = 0; volta < 2; volta++) {
    const marcados = [];
    for (let p = 0; p < w * h; p++) {
      if (isBg[p]) continue;
      const x = p % w;
      const y = (p / w) | 0;
      const colado =
        (x > 0 && isBg[p - 1]) || (x < w - 1 && isBg[p + 1]) || (y > 0 && isBg[p - w]) || (y < h - 1 && isBg[p + w]);
      if (!colado) continue;
      const i = p * 4;
      const croma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (croma <= 14 && v >= HALO) marcados.push(p);
    }
    for (const p of marcados) isBg[p] = 1;
  }

  const out = new PNG({ width: w, height: h });
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (isBg[p]) continue; // transparente
    const x = p % w;
    const y = (p / w) | 0;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && isBg[ny * w + nx]) {
          edge = true;
          break;
        }
      }
    }
    const a = edge ? Math.min(1, dist(p) / EDGE) : 1;
    // o fundo daquele ponto é o tom de quadrado mais perto: é ele que sai da mistura
    const claro = tons.reduce((m, t) => (Math.abs(t - (data[i] + data[i + 1] + data[i + 2]) / 3) < Math.abs(m - (data[i] + data[i + 1] + data[i + 2]) / 3) ? t : m), tons[0]);
    for (let c = 0; c < 3; c++) {
      // "desmistura" o fundo nos pixels semitransparentes da borda
      const v = a > 0.02 ? (data[i + c] - (1 - a) * claro) / a : data[i + c];
      out.data[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    out.data[i + 3] = Math.round(a * 255);
  }
  return out;
}

function crop(png, { cx, cy, side }) {
  const out = new PNG({ width: side, height: side });
  const x0 = Math.round(cx - side / 2);
  const y0 = Math.round(cy - side / 2);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) continue;
      const si = (sy * png.width + sx) * 4;
      png.data.copy(out.data, (y * side + x) * 4, si, si + 4);
    }
  }
  return out;
}

/**
 * Apara a moldura transparente.
 *
 * A arte chega numa tela fixa (1024x1536) com o personagem no meio e sobra em volta. Guardar essa
 * sobra faria o desenho aparecer menor e deslocado em toda tela que dá uma altura para ele — e a
 * altura é o que o jogo controla. Aparado, o arquivo é o personagem e nada mais, e cada tela
 * continua mandando na altura como antes.
 */
function trim(png) {
  const { width: w, height: h, data } = png;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return png;
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  for (let y = 0; y < out.height; y++) {
    const si = ((y0 + y) * w + x0) * 4;
    data.copy(out.data, y * out.width * 4, si, si + out.width * 4);
  }
  return out;
}

/** Prévia sobre fundo escuro (para conferir o recorte). */
function onDark(png) {
  const out = new PNG({ width: png.width, height: png.height });
  const bg = [42, 22, 70];
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(png.data[i + c] * a + bg[c] * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

for (const [id, cfg] of Object.entries(CHARACTERS)) {
  const src = PNG.sync.read(readFileSync(join(SRC, cfg.file)));
  const inteiro = cutout(src, cfg.holes);
  // o retrato é recortado ANTES de aparar: as coordenadas são as da arte de origem
  const portrait = crop(inteiro, cfg.portrait);
  const full = trim(inteiro);
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'full.png'), PNG.sync.write(full));
  writeFileSync(join(dir, 'portrait.png'), PNG.sync.write(portrait));
  if (CHECK) {
    mkdirSync(CHECK, { recursive: true });
    writeFileSync(join(CHECK, `${id}-full.png`), PNG.sync.write(onDark(full)));
    writeFileSync(join(CHECK, `${id}-portrait.png`), PNG.sync.write(onDark(portrait)));
  }
  console.log(`✓ ${id}: ${src.width}x${src.height} → full.png ${full.width}x${full.height} + portrait.png ${portrait.width}px`);
}
