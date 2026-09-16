/**
 * Faz o Node aceitar comentários (// e /* *\/) em arquivos .jsonc e .json:
 *
 *   node --import ./server/jsonc-register.mjs app.mjs
 *   tsx  --import ./server/jsonc-register.mjs server/index.ts
 *
 * - `import dados from './arquivo.jsonc'` devolve o objeto já sem os comentários;
 * - `import dados from './arquivo.json' with { type: 'json' }` (e `require`) também aceita comentários.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../shared/jsonc.ts';

registerHooks({
  load(url, context, nextLoad) {
    const path = url.split('?')[0];
    if (!path.startsWith('file:')) return nextLoad(url, context);

    if (path.endsWith('.jsonc')) {
      const file = fileURLToPath(path);
      const data = parseJsonc(readFileSync(file, 'utf8'), file);
      return { format: 'module', source: `export default ${JSON.stringify(data)};`, shortCircuit: true };
    }

    if (path.endsWith('.json')) {
      const file = fileURLToPath(path);
      const text = readFileSync(file, 'utf8');
      // JSON comum segue o caminho normal do Node; só intervém quando há comentários
      if (!text.includes('//') && !text.includes('/*')) return nextLoad(url, context);
      return { format: 'json', source: JSON.stringify(parseJsonc(text, file)), shortCircuit: true };
    }

    return nextLoad(url, context);
  },
});
