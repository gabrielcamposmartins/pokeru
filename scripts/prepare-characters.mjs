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
  marina: { file: 'marina_frente.png', portrait: { cx: 188, cy: 140, side: 240 }, holes: [] },
  ren: { file: 'ren_frente.png', portrait: { cx: 205, cy: 118, side: 224 }, holes: [] },
  tobi: { file: 'tobi_frente.png', portrait: { cx: 212, cy: 128, side: 232 }, holes: [] },
  yukina: { file: 'yukina_frente.png', portrait: { cx: 282, cy: 125, side: 232 }, holes: [] },
};

/** Distância máxima da cor do fundo para um pixel contar como fundo. */
const TOL = 26;
/** Faixa (em distância de cor) usada para o alfa dos pixels da borda. */
const EDGE = 110;

function cutout(png, holes) {
  const { width: w, height: h, data } = png;
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, p) => s + data[p * 4 + c], 0) / corners.length);
  const dist = (p) => Math.max(Math.abs(data[p * 4] - bg[0]), Math.abs(data[p * 4 + 1] - bg[1]), Math.abs(data[p * 4 + 2] - bg[2]));

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
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
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
    for (let c = 0; c < 3; c++) {
      // "desmistura" o branco do fundo nos pixels semitransparentes
      const v = a > 0.02 ? (data[i + c] - (1 - a) * bg[c]) / a : data[i + c];
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
  const full = cutout(src, cfg.holes);
  const portrait = crop(full, cfg.portrait);
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'full.png'), PNG.sync.write(full));
  writeFileSync(join(dir, 'portrait.png'), PNG.sync.write(portrait));
  if (CHECK) {
    mkdirSync(CHECK, { recursive: true });
    writeFileSync(join(CHECK, `${id}-full.png`), PNG.sync.write(onDark(full)));
    writeFileSync(join(CHECK, `${id}-portrait.png`), PNG.sync.write(onDark(portrait)));
  }
  console.log(`✓ ${id}: ${src.width}x${src.height} → full.png + portrait.png (${cfg.portrait.side}px)`);
}
