/**
 * Monta o `latest.json` que o app consulta para se atualizar.
 *
 * O atualizador do Tauri lê esse arquivo na última release do GitHub, compara a versão com a que
 * está rodando e, se for mais nova, baixa o instalador e confere a assinatura (`.sig`) com a chave
 * pública de src-tauri/tauri.conf.json. Sem assinatura válida, ele recusa o pacote.
 *
 *   npm run app:build      (com TAURI_SIGNING_PRIVATE_KEY definido — gera o .sig)
 *   npm run release:json   (escreve src-tauri/target/release/bundle/latest.json)
 *
 * O arquivo sai com um bloco por plataforma encontrada no bundle: dá para rodar em cada sistema e
 * juntar os blocos numa release só.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'src-tauri', 'target', 'release', 'bundle');
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
const repo = process.env.RELEASE_REPO || 'gabrielcamposmartins/pokeru';
const tag = process.env.RELEASE_TAG || `v${version}`;

/** Onde procurar o instalador de cada plataforma, na ordem de preferência. */
const TARGETS = [
  { platform: 'windows-x86_64', dir: 'nsis', ext: '.exe' },
  { platform: 'darwin-x86_64', dir: 'macos', ext: '.app.tar.gz' },
  { platform: 'darwin-aarch64', dir: 'macos', ext: '.app.tar.gz' },
  { platform: 'linux-x86_64', dir: 'appimage', ext: '.AppImage' },
];

/**
 * SHA-256 de cada pacote, para as notas da release.
 *
 * Enquanto o instalador não tiver certificado de assinatura de código, o Windows avisa que
 * "protegeu seu computador" (SmartScreen) — e a única coisa que dá para oferecer a quem baixa é
 * poder conferir que o arquivo é o mesmo que saiu daqui. Sai impresso pronto para colar.
 */
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const hashes = [];

const platforms = {};
for (const t of TARGETS) {
  const dir = join(bundle, t.dir);
  if (!existsSync(dir)) continue;
  const file = readdirSync(dir).find((f) => f.endsWith(t.ext) && f.includes(version));
  if (!file) continue;
  const sig = join(dir, `${file}.sig`);
  if (!existsSync(sig)) {
    console.warn(`! ${file} está sem .sig — assine o build (TAURI_SIGNING_PRIVATE_KEY) ou ele não serve para atualizar`);
    continue;
  }
  platforms[t.platform] = {
    signature: readFileSync(sig, 'utf8').trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`,
  };
  console.log(`✓ ${t.platform}: ${file}`);
  hashes.push([file, sha256(join(dir, file))]);
}

// os pacotes que não vão para o atualizador (o .msi) também entram na lista de conferência
for (const extra of ['msi', 'deb', 'rpm', 'dmg']) {
  const dir = join(bundle, extra);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.sig') || !file.includes(version)) continue;
    if (hashes.some(([f]) => f === file)) continue;
    hashes.push([file, sha256(join(dir, file))]);
  }
}

if (!Object.keys(platforms).length) {
  console.error('Nenhum instalador assinado encontrado em src-tauri/target/release/bundle.');
  process.exit(1);
}

const notes = process.env.RELEASE_NOTES || `Pokeru ${version}`;
const out = join(bundle, 'latest.json');
writeFileSync(out, JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n');
console.log(`\n${out}`);

if (hashes.length) {
  const largura = Math.max(...hashes.map(([f]) => f.length));
  console.log('\nSHA-256 (para as notas da release):\n');
  for (const [file, hash] of hashes) console.log(`${file.padEnd(largura)}  ${hash}`);
}
