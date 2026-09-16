/**
 * Sincroniza, para cada assets/characters/falas/<personagem>.jsonc, o <personagem>.json —
 * uma cópia com os mesmos comentários (slot + tradução). Antes de copiar, valida o arquivo
 * (JSONC válido e no schema { personagem, falas }).
 *
 * Observação: com comentários, os .json não são JSON estrito. O Node (com server/jsonc-register.mjs)
 * e o Vite aceitam; ferramentas que exigem JSON estrito vão rejeitá-los.
 *
 *   npm run build:falas
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../shared/jsonc.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'characters', 'falas');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.jsonc'))
  .sort();

for (const file of files) {
  const src = join(dir, file);
  const text = readFileSync(src, 'utf8');
  const data = parseJsonc(text, src);
  const keys = Object.keys(data).sort().join(',');
  if (keys !== 'falas,personagem' || typeof data.personagem !== 'string' || !Array.isArray(data.falas) || !data.falas.every((s) => typeof s === 'string')) {
    throw new Error(`${file}: fora do schema { personagem: string, falas: string[] }`);
  }
  const outName = file.slice(0, -'.jsonc'.length) + '.json';
  writeFileSync(join(dir, outName), text);
  console.log(`✓ ${file} → ${outName} (${data.personagem}: ${data.falas.length} falas, com comentários)`);
}
