/**
 * JSONC — JSON com comentários (`//` e `/* *\/`) e vírgulas finais.
 * Os comentários só são removidos FORA de strings, então textos como
 * "http://exemplo.com" continuam intactos. Funciona no Node e no navegador.
 */

const QUOTE = 34; // "
const BACKSLASH = 92;
const SLASH = 47;
const STAR = 42;
const COMMA = 44;
const NEWLINE = 10;
const CLOSE_BRACKET = 93; // ]
const CLOSE_BRACE = 125; // }
const NL = String.fromCharCode(NEWLINE);

/** Índice logo após o fim da string que começa em `i` (que deve ser uma aspa). */
function skipString(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length) {
    const c = text.charCodeAt(j);
    if (c === BACKSLASH) j += 2;
    else if (c === QUOTE) return j + 1;
    else j++;
  }
  return j;
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Remove comentários `//` e `/* *\/` fora de strings, preservando as quebras de linha. */
export function stripJsonComments(text: string): string {
  const parts: string[] = [];
  let i = 0;
  let from = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === QUOTE) {
      i = skipString(text, i);
      continue;
    }
    if (c === SLASH && text.charCodeAt(i + 1) === SLASH) {
      parts.push(text.slice(from, i));
      while (i < text.length && text.charCodeAt(i) !== NEWLINE) i++;
      from = i;
      continue;
    }
    if (c === SLASH && text.charCodeAt(i + 1) === STAR) {
      parts.push(text.slice(from, i));
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      // mantém as quebras de linha para que erros de parse apontem a linha certa
      for (let k = i; k < stop; k++) if (text.charCodeAt(k) === NEWLINE) parts.push(NL);
      i = from = stop;
      continue;
    }
    i++;
  }
  parts.push(text.slice(from));
  return parts.join('');
}

/** Remove vírgulas finais antes de `]` ou `}` (fora de strings). */
function stripTrailingCommas(text: string): string {
  const parts: string[] = [];
  let i = 0;
  let from = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === QUOTE) {
      i = skipString(text, i);
      continue;
    }
    if (c === COMMA) {
      let j = i + 1;
      while (j < text.length && isSpace(text.charCodeAt(j))) j++;
      const next = text.charCodeAt(j);
      if (next === CLOSE_BRACKET || next === CLOSE_BRACE) {
        parts.push(text.slice(from, i));
        from = i + 1;
      }
    }
    i++;
  }
  parts.push(text.slice(from));
  return parts.join('');
}

/** Faz o parse de um texto JSONC. `source` (ex.: nome do arquivo) aparece nas mensagens de erro. */
export function parseJsonc<T = unknown>(text: string, source?: string): T {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(stripTrailingCommas(stripJsonComments(body))) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SyntaxError(source ? `JSONC inválido em ${source}: ${msg}` : `JSONC inválido: ${msg}`);
  }
}
