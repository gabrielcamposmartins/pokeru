import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { parseJsonc, stripJsonComments } from './jsonc';
import marina from '../assets/characters/falas/marina.jsonc';
import ren from '../assets/characters/falas/ren.jsonc';
import tobi from '../assets/characters/falas/tobi.jsonc';
import yukina from '../assets/characters/falas/yukina.jsonc';
import marinaJson from '../assets/characters/falas/marina.json';
import renJson from '../assets/characters/falas/ren.json';
import tobiJson from '../assets/characters/falas/tobi.json';
import yukinaJson from '../assets/characters/falas/yukina.json';
import comum from '../assets/characters/falas/comum.jsonc';
import comumJson from '../assets/characters/falas/comum.json';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

describe('jsonc', () => {
  it('ignora comentários // e /* */ fora de strings', () => {
    const text = [
      '// comentário no topo',
      '{',
      '  "a": 1, // um',
      '  /* bloco',
      '     em várias linhas */',
      '  "b": "x // isto não é comentário",',
      '  "c": "http://exemplo.com/*nada*/",',
      '  "d": [1, 2,], // vírgula final',
      '}',
    ].join(NL);
    expect(parseJsonc(text)).toEqual({ a: 1, b: 'x // isto não é comentário', c: 'http://exemplo.com/*nada*/', d: [1, 2] });
  });

  it('respeita aspas escapadas dentro de strings', () => {
    const text = `{ "s": "diz ${BS}"oi${BS}" // continua na string" } // fim`;
    expect(parseJsonc(text)).toEqual({ s: 'diz "oi" // continua na string' });
  });

  it('preserva o número de linhas (erros apontam a linha certa)', () => {
    const text = ['{', '/* a', 'b', 'c */', '"x": 1 // y', '}'].join(NL);
    expect(stripJsonComments(text).split(NL).length).toBe(text.split(NL).length);
  });

  it('indica o arquivo quando o JSONC é inválido', () => {
    expect(() => parseJsonc('{ "a": }', 'teste.jsonc')).toThrow(/teste\.jsonc/);
  });

  it('importa as falas de cada personagem (plugin do Vite)', () => {
    const data = [marina, ren, tobi, yukina] as { personagem: string; falas: string[] }[];
    expect(data.map((p) => [p.personagem, p.falas.length])).toEqual([
      ['Marina', 16],
      ['Ren', 16],
      ['Tobi', 16],
      ['Yukina', 16],
    ]);
    // cada arquivo segue o schema: só "personagem" e "falas"
    for (const p of data) expect(Object.keys(p).sort()).toEqual(['falas', 'personagem']);
  });

  it('os .json de falas têm os mesmos dados (comentários ignorados pelo Vite)', () => {
    expect([marinaJson, renJson, tobiJson, yukinaJson, comumJson]).toEqual([marina, ren, tobi, yukina, comum]);
  });

  it('importa as falas comuns (chamadas de jogada + nomes das mãos)', () => {
    const p = comum as { personagem: string; falas: string[] };
    expect(Object.keys(p).sort()).toEqual(['falas', 'personagem']);
    expect(p.personagem).toBe('Todos');
    expect(p.falas).toHaveLength(19);
    expect(p.falas.slice(0, 4)).toEqual(['チェック。', 'ベット。', 'コール。', 'レイズ！']);
  });

  it('o Node puro importa .json com comentários com o hook de registro', () => {
    const code = "import f from './assets/characters/falas/marina.json' with { type: 'json' }; console.log(JSON.stringify([f.personagem, f.falas.length]));";
    const out = execFileSync(process.execPath, ['--import', './server/jsonc-register.mjs', '--input-type=module', '-e', code], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(JSON.parse(out.trim().split(NL).pop()!)).toEqual(['Marina', 16]);
  }, 20_000);

  it('o Node puro importa .jsonc com o hook de registro', () => {
    const code = "import f from './assets/characters/falas/yukina.jsonc'; console.log(JSON.stringify([f.personagem, f.falas.length]));";
    const out = execFileSync(process.execPath, ['--import', './server/jsonc-register.mjs', '--input-type=module', '-e', code], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(JSON.parse(out.trim().split(NL).pop()!)).toEqual(['Yukina', 16]);
    // abre um processo Node: com a máquina carregada pode passar dos 5 s padrão
  }, 20_000);
});
