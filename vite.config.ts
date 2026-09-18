import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parseJsonc } from './shared/jsonc.ts';

const host = process.env.TAURI_DEV_HOST;

/** O conteúdo começa com um objeto/array JSON (ignorando comentários e espaços)? */
function looksLikeJson(code: string): boolean {
  const start = code.replace(/^(\s|\/\/[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, '');
  return start.startsWith('{') || start.startsWith('[');
}

/** Comentários (// e /* *\/) em arquivos .jsonc e .json são ignorados. */
function jsonc(): Plugin {
  return {
    name: 'pokeru-jsonc',
    enforce: 'pre',
    transform(code, id) {
      const [file, query] = id.split('?');
      // ?raw / ?url pedem o arquivo como está (o texto com os comentários): não mexe.
      // A checagem do conteúdo é a rede de segurança: o que já virou módulo não é JSON.
      if (query && /(^|&)(raw|url|inline)(&|=|$)/.test(query)) return null;
      if (!looksLikeJson(code)) return null;
      if (file.endsWith('.jsonc')) return { code: `export default ${JSON.stringify(parseJsonc(code, file))};`, map: null };
      // .json com comentários: entrega JSON limpo e deixa o plugin de JSON do Vite seguir normalmente
      if (file.endsWith('.json') && (code.includes('//') || code.includes('/*'))) return { code: JSON.stringify(parseJsonc(code, file)), map: null };
      return null;
    },
  };
}

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [jsonc(), react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/server/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
