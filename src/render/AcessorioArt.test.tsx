import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACESSORIOS, findAcessorio } from '../../shared/acessorios';
import { AcessorioArt } from './AcessorioArt';

/**
 * As figurinhas dos acessórios. O que se pode cobrar sem olhar: toda peça tem desenho, todo desenho
 * tem o contorno, e duas figurinhas na mesma tela não dividem os degradês nem o filtro (o `id` de um
 * SVG vale para a página inteira: repetido, a segunda peça pegaria as cores da primeira).
 */
describe('a figurinha de um acessório', () => {
  it('toda peça tem desenho, com o contorno em volta', () => {
    for (const a of ACESSORIOS) {
      const html = renderToStaticMarkup(<AcessorioArt a={a} size={92} />);
      expect(html, a.id).toContain(`aria-label="${a.nome}"`);
      // o filtro do contorno existe e é usado
      const filtro = /<filter id="([^"]+-contorno)"/.exec(html)?.[1];
      expect(filtro, a.id).toBeTruthy();
      expect(html, a.id).toContain(`filter="url(#${filtro})"`);
      // e há o que contornar
      expect(html.length, a.id).toBeGreaterThan(600);
      // toda referência a um degradê, recorte ou filtro aponta para algo que o desenho define
      const definidos = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
      for (const [, ref] of html.matchAll(/url\(#([^)]+)\)/g)) expect(definidos.has(ref), `${a.id}: ${ref}`).toBe(true);
    }
  });

  it('duas figurinhas na mesma tela não dividem ids', () => {
    const a = findAcessorio('relogio-prisma')!;
    const html = renderToStaticMarkup(
      <div>
        <AcessorioArt a={a} size={92} />
        <AcessorioArt a={a} size={92} />
      </div>,
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('o contorno é fino na tela em qualquer tamanho: mais largo no desenho quando a figurinha é pequena', () => {
    const a = findAcessorio('anel-alianca')!;
    const borrao = (size: number) => Number(/stdDeviation="([\d.]+)"/.exec(renderToStaticMarkup(<AcessorioArt a={a} size={size} />))![1]);
    // (em pontos da tela: o borrão do desenho vezes a escala)
    const naTela = (size: number) => (borrao(size) * size) / 100;
    expect(borrao(40)).toBeGreaterThan(borrao(220));
    for (const size of [40, 64, 92, 220]) {
      expect(naTela(size), String(size)).toBeGreaterThan(0.6);
      expect(naTela(size), String(size)).toBeLessThan(1.8);
    }
  });

  it('os três relógios novos têm o que os distingue: a lona, o prisma e os dois metais', () => {
    const desenho = (id: string) => renderToStaticMarkup(<AcessorioArt a={findAcessorio(id)!} size={220} />);
    // o de campo: a trama da lona e os doze algarismos
    const campo = desenho('relogio-campo');
    expect(campo).toMatch(/-trama\)/);
    for (const h of [12, 3, 6, 9, 11]) expect(campo).toContain(`>${h}</text>`);
    // o prismático: muitos gomos, de muitas cores
    const prisma = desenho('relogio-prisma');
    const cores = new Set([...prisma.matchAll(/<polygon points="50,50 [^"]+" fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
    expect(cores.size).toBeGreaterThan(20);
    // o bicolor: o bronze e a prata, os dois, em degradê
    const bronze = desenho('relogio-bronze');
    expect(bronze).toMatch(/-m2\)/);
    expect(bronze.toLowerCase()).toContain('#b5763c');
    expect(bronze.toLowerCase()).toContain('#cfd3dc');
  });
});
