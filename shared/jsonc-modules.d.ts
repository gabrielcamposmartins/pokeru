/** Permite `import dados from './arquivo.jsonc'` (Node via server/jsonc-register.mjs, Vite via plugin). */
declare module '*.jsonc' {
  const value: unknown;
  export default value;
}
