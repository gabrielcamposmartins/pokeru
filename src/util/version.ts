/**
 * A versão do app, cravada no build a partir do package.json (veja `define` em vite.config.ts).
 *
 * Existe para o rodapé do menu não divergir da release: quando a versão morava escrita à mão no
 * JSX, ela ficou três releases para trás sem ninguém notar.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
