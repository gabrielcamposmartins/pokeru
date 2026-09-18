/**
 * Compila o servidor (server/ + shared/) para dist-server/ e deixa lá um package.json marcando
 * CommonJS — a raiz do projeto é ESM (`type: module`), mas o servidor compilado sai em CJS para
 * rodar com `node` puro, sem tsx nem carregadores.
 *
 *   npm run server:build   &&   npm run server:start
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-server');

execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.server.json'], {
  cwd: root,
  stdio: 'inherit',
});

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const pkg = {
  name: 'pokersoul-server',
  version: rootPkg.version,
  private: true,
  type: 'commonjs',
  main: 'server/index.js',
  scripts: { start: 'node server/index.js' },
  // a única dependência do servidor em produção
  dependencies: { ws: rootPkg.dependencies.ws },
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log('✓ servidor compilado em dist-server/ (node dist-server/server/index.js)');
