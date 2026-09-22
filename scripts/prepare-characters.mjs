/**
 * Prepara a arte dos personagens a partir de assets/characters/:
 *  - apara a moldura transparente;
 *  - gera public/characters/<id>/full.png (corpo inteiro) e portrait.png (retrato quadrado).
 *
 *   npm run prepare:characters
 *   CHECK_DIR=pasta npm run prepare:characters   (também grava prévias sobre fundo escuro)
 *
 * A arte deve vir **com transparência de verdade**. Houve uma versão exportada achatada sobre o
 * quadriculado de transparência, e o script chegou a ter umas duzentas linhas de heurística para
 * recortá-la: reconstruir o tabuleiro, medir alternância, separar contorno branco de roupa branca.
 * Nada daquilo sobrevive aqui — com alfa no arquivo, não há o que adivinhar. Se algum dia entrar
 * arte achatada de novo, o aviso aparece na hora de rodar (e o recorte antigo está no histórico do
 * git, no commit "v0.8.1").
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

/** portrait: centro (cx, cy) e lado do quadrado, em pixels da imagem original. */
const CHARACTERS = {
  marina: { file: 'marina_frente.png', portrait: { cx: 505, cy: 140, side: 340 } },
  ren: { file: 'ren_frente.png', portrait: { cx: 505, cy: 110, side: 260 } },
  tobi: { file: 'tobi_frente.png', portrait: { cx: 500, cy: 115, side: 285 } },
  yukina: { file: 'yukina_frente.png', portrait: { cx: 520, cy: 135, side: 285 } },
};

/** Abaixo disto o arquivo não tem transparência de verdade — é arte achatada sobre algum fundo. */
const MIN_TRANSPARENTE = 0.15;

/** Que fatia da imagem é transparente. */
function fatiaTransparente(png) {
  let vazios = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] < 10) vazios++;
  return vazios / (png.width * png.height);
}

/**
 * Apara a moldura transparente.
 *
 * A arte chega numa tela fixa com o personagem no meio e sobra em volta. Guardar essa sobra faria o
 * desenho aparecer menor e deslocado em toda tela que dá uma altura para ele — e a altura é como o
 * jogo controla o tamanho. Aparado, o arquivo é o personagem e nada mais.
 */
function trim(png) {
  const { width: w, height: h, data } = png;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
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

/** Recorte quadrado do retrato, nas coordenadas da arte de origem. */
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
  const vazio = fatiaTransparente(src);
  if (vazio < MIN_TRANSPARENTE) {
    console.warn(
      `⚠ ${id}: só ${(vazio * 100).toFixed(1)}% do arquivo é transparente. A arte parece achatada` +
        ' sobre um fundo — exporte com transparência de verdade, senão o fundo entra no jogo.',
    );
  }
  // o retrato sai das coordenadas da arte de origem, então é recortado antes de aparar
  const portrait = crop(src, cfg.portrait);
  const full = trim(src);
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
