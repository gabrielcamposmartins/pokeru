/**
 * Move os áudios das falas comuns gerados na raiz de assets/characters/falas
 * (<NNN>_<Personagem>_<fala>.wav) para a pasta do personagem:
 *   <personagem>/comum/<NNN>_<fala>.wav   (NNN = posição da fala em comum.jsonc)
 *
 * O personagem e a fala são reconhecidos pelo nome do arquivo (o número gerado pela ferramenta
 * não importa). Se o destino já existe, o arquivo fica onde está — use --substituir para trocar.
 *
 *   npm run audios:organizar
 *   npm run audios:organizar -- --substituir
 */
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { COMUM_DIR, FALAS_DIR, fileText, listWavs, loadFalas, pad, parseLooseComum } from './falas-lib.mjs';

const replace = process.argv.includes('--substituir');
const { personagens, comum } = loadFalas();
const loose = listWavs().filter((rel) => !rel.includes('/'));

let moved = 0;
const kept = [];
for (const name of loose) {
  const hit = parseLooseComum(name, personagens, comum);
  if (!hit) {
    kept.push(`${name} (não corresponde a nenhuma fala comum de um personagem)`);
    continue;
  }
  const fala = comum.falas[hit.index].fala;
  const destRel = `${hit.personagem.id}/${COMUM_DIR}/${pad(hit.index + 1)}_${fileText(fala)}.wav`;
  const dest = join(FALAS_DIR, destRel);
  if (existsSync(dest)) {
    if (!replace) {
      kept.push(`${name} (já existe ${destRel}; use --substituir)`);
      continue;
    }
    rmSync(dest);
  }
  mkdirSync(join(FALAS_DIR, hit.personagem.id, COMUM_DIR), { recursive: true });
  renameSync(join(FALAS_DIR, name), dest);
  moved++;
  console.log(`  → ${name}  ⇒  ${destRel}`);
}

console.log(`${moved} áudio(s) movido(s) para as pastas dos personagens.`);
if (kept.length) {
  console.log('Ficaram na raiz:');
  for (const k of kept) console.log(`  ? ${k}`);
}
