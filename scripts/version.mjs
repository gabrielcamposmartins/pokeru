/**
 * A versão do Pokeru mora em três arquivos (package.json, src-tauri/tauri.conf.json e
 * src-tauri/Cargo.toml) e os três têm de bater com a tag da release — se um ficar para trás, o
 * atualizador automático não enxerga a versão nova. Este script cuida disso:
 *
 *   npm run version:set 0.2.1        troca a versão nos três (e no Cargo.lock)
 *   npm run version:set -- --check   confere se os três estão iguais entre si
 *   node scripts/version.mjs --check v0.2.1   confere se batem com a tag (usado no CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  pkg: join(root, 'package.json'),
  lock: join(root, 'package-lock.json'),
  conf: join(root, 'src-tauri', 'tauri.conf.json'),
  cargo: join(root, 'src-tauri', 'Cargo.toml'),
  cargoLock: join(root, 'src-tauri', 'Cargo.lock'),
};

const read = (f) => readFileSync(f, 'utf8');
const json = (f) => JSON.parse(read(f));

/** Versão em cada arquivo, para comparar. */
export function versions() {
  const cargo = read(files.cargo).match(/^version = "([^"]+)"/m);
  return {
    'package.json': json(files.pkg).version,
    'tauri.conf.json': json(files.conf).version,
    'Cargo.toml': cargo?.[1],
  };
}

function setVersion(next) {
  if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`versão inválida: ${next} (use X.Y.Z)`);
  const current = versions()['package.json'];

  const pkg = json(files.pkg);
  pkg.version = next;
  writeFileSync(files.pkg, JSON.stringify(pkg, null, 2) + '\n');

  // o package-lock guarda a versão duas vezes (raiz e pacote "")
  const lock = json(files.lock);
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  writeFileSync(files.lock, JSON.stringify(lock, null, 2) + '\n');

  const conf = json(files.conf);
  conf.version = next;
  writeFileSync(files.conf, JSON.stringify(conf, null, 2) + '\n');

  writeFileSync(files.cargo, read(files.cargo).replace(/^version = "[^"]+"/m, `version = "${next}"`));
  writeFileSync(
    files.cargoLock,
    read(files.cargoLock).replace(`name = "pokeru"\nversion = "${current}"`, `name = "pokeru"\nversion = "${next}"`),
  );
  console.log(`✓ versão ${current} → ${next} (package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock)`);
}

/** Todos iguais entre si — e, se vier uma tag, iguais a ela também. */
export function check(tag) {
  const found = versions();
  const wanted = tag ? tag.replace(/^v/, '') : found['package.json'];
  const wrong = Object.entries(found).filter(([, v]) => v !== wanted);
  if (wrong.length) {
    console.error(`Versões fora de sincronia (esperado ${wanted}):`);
    for (const [file, v] of Object.entries(found)) console.error(`  ${v === wanted ? '✓' : '✗'} ${file}: ${v}`);
    console.error('\nAjuste com: npm run version:set ' + wanted);
    return false;
  }
  console.log(`✓ versão ${wanted} em ${Object.keys(found).join(', ')}`);
  return true;
}

const arg = process.argv[2];
if (arg === '--check') {
  if (!check(process.argv[3])) process.exit(1);
} else if (arg) {
  setVersion(arg.replace(/^v/, ''));
} else {
  console.log('uso: npm run version:set <X.Y.Z> | npm run version:set -- --check [vX.Y.Z]');
  console.log('atual:', versions());
}
