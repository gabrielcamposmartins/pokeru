/**
 * Confere quais falas ainda não têm áudio e grava a lista em
 * assets/characters/falas/audios-faltando.json (JSON estrito, no schema { personagem, falas }).
 *
 * Onde cada áudio deve estar (veja scripts/falas-lib.mjs):
 *   - falas próprias:  falas/<personagem>/<NNN>_<fala>.wav
 *   - falas comuns:    falas/<personagem>/comum/<NNN>_<fala>.wav
 * Falas comuns ainda soltas na raiz (<NNN>_<Personagem>_<fala>.wav, como a ferramenta de voz gera)
 * contam como geradas, com o aviso para rodar `npm run audios:organizar`.
 *
 * Das falas próprias, só as que o jogo usa são cobradas (all-in e vitória, mais as que o vínculo com
 * o personagem libera — showdown, derrota e a sua vez; veja FALAS_USADAS em src/audio/voice.ts); as
 * outras continuam nos .jsonc, e os áudios delas que já existem não contam como sobra.
 *
 * Um áudio conta como gerado se existe o .wav com o mesmo texto na pasta certa, é um WAV válido e
 * não está mudo. Arquivos que não batem com nenhuma fala (ex.: texto alterado depois de gerar) são
 * listados como sobrando.
 *
 *   npm run audios:faltando
 */
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { COMUM_DIR, FALAS_DIR, checkWav, fileText, listWavs, loadFalas, pad, parseLooseComum, splitNumber } from './falas-lib.mjs';

const OUT = join(FALAS_DIR, 'audios-faltando.json');
/** Falas próprias tocadas no jogo — mesmo que FALAS_USADAS em src/audio/voice.ts. */
const PROPRIAS_USADAS = new Set(['allin', 'win', 'big_win', 'showdown', 'lose', 'turn']);
const { personagens, comum } = loadFalas();

/** Slot de uma fala, pelo comentário ("allin: Tudo ou nada!" → "allin"). */
const slotOf = (comentario) => comentario.split(':')[0].trim();

// ── o que deveria existir ──
const expected = [];
for (const p of personagens) {
  p.falas.forEach(({ fala, comentario }, i) =>
    expected.push({
      personagem: p.personagem,
      fala,
      comentario,
      tipo: 'própria',
      usada: PROPRIAS_USADAS.has(slotOf(comentario)),
      arquivo: `${p.id}/${pad(i + 1)}_${fileText(fala)}.wav`,
      match: `${p.id}|${fileText(fala)}`,
    }),
  );
}
comum.falas.forEach(({ fala, comentario }, i) =>
  personagens.forEach((p) =>
    expected.push({
      personagem: p.personagem,
      fala,
      comentario,
      tipo: 'comum',
      usada: true,
      arquivo: `${p.id}/${COMUM_DIR}/${pad(i + 1)}_${fileText(fala)}.wav`,
      match: `${p.id}/${COMUM_DIR}|${fileText(fala)}`,
    }),
  ),
);
const cobradas = expected.filter((e) => e.usada);

// ── o que existe ──
const found = new Map(); // match → caminho relativo
const loose = [];
for (const rel of listWavs()) {
  const slash = rel.lastIndexOf('/');
  if (slash < 0) {
    const hit = parseLooseComum(rel, personagens, comum);
    if (hit) {
      found.set(`${hit.personagem.id}/${COMUM_DIR}|${fileText(comum.falas[hit.index].fala)}`, rel);
      loose.push(rel);
    }
    continue;
  }
  found.set(`${rel.slice(0, slash)}|${fileText(splitNumber(rel.slice(slash + 1)).rest)}`, rel);
}

// ── comparação ──
const used = new Set(expected.map((e) => found.get(e.match)).filter(Boolean));
const faltando = [];
const problemas = new Map();
let prontos = 0;
for (const e of cobradas) {
  const rel = found.get(e.match);
  if (!rel) {
    faltando.push(e);
    continue;
  }
  const problema = checkWav(join(FALAS_DIR, rel));
  if (problema) {
    problemas.set(e.match, `${rel}: ${problema}`);
    faltando.push(e);
  } else prontos++;
}
const sobrando = listWavs().filter((rel) => !used.has(rel));

// lista para a ferramenta de voz: uma entrada por personagem (voz), só com o que falta
const porPersonagem = new Map();
for (const e of faltando) {
  if (!porPersonagem.has(e.personagem)) porPersonagem.set(e.personagem, []);
  porPersonagem.get(e.personagem).push(e.fala);
}
const lista = [...porPersonagem].map(([personagem, falas]) => ({ personagem, falas }));
writeFileSync(OUT, JSON.stringify(lista, null, 2) + String.fromCharCode(10));

// ── relatório ──
console.log(`Áudios: ${prontos} de ${cobradas.length} gerados, ${faltando.length} faltando.`);
if (faltando.length) {
  console.log('');
  for (const e of faltando) {
    const p = problemas.get(e.match);
    console.log(`  ✗ [${e.tipo}] ${e.personagem.padEnd(7)} ${e.fala}  // ${e.comentario}${p ? `  (${p})` : ''}`);
    console.log(`      → ${e.arquivo}`);
  }
}
if (loose.length) {
  console.log('');
  console.log(`${loose.length} fala(s) comum(ns) ainda na raiz — rode npm run audios:organizar para mover para as pastas.`);
}
if (sobrando.length) {
  console.log('');
  console.log('Arquivos sem fala correspondente (texto mudou depois de gerar?):');
  for (const rel of sobrando) console.log(`  ? ${rel}`);
}
console.log('');
console.log(`Lista gravada em ${relative(process.cwd(), OUT) || OUT} (${lista.length} personagem(ns)).`);
