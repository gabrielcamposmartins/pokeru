import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findItem, padoPrice } from '../../shared/catalog';
import { ItemCard } from './Store';

/**
 * A vitrine. O que ela precisa acertar: não oferecer o que já é seu, mostrar o preço nas moedas
 * que a conta **tem** (padocoin só com Discord vinculado) e não deixar clicar no que não dá.
 */

const ren = findItem('character:ren')!;
const marina = findItem('character:marina')!;

const card = (over: Partial<Parameters<typeof ItemCard>[0]> = {}) =>
  renderToStaticMarkup(<ItemCard item={ren} owned={false} chips={99_999} pado={null} canShop {...over} />);

/** Só os botões de compra: o da arte (que abre o item de perto) nunca trava, e não é sobre ele. */
const botoesDeCompra = (html: string) =>
  html
    .split('<button')
    .slice(1)
    .filter((b) => !b.includes('shop-ver'));

describe('cartão da loja', () => {
  it('mostra o nome e o preço em fichas', () => {
    const html = card();
    expect(html).toContain('Ren');
    expect(html).toContain('15.000');
  });

  it('sem Discord vinculado, o padocoin não aparece', () => {
    const html = card({ pado: null });
    expect(html).not.toContain(padoPrice(ren.chips).toLocaleString('pt-BR'));
  });

  it('com Discord vinculado, aparecem as duas moedas', () => {
    const html = card({ pado: 50_000 });
    expect(html).toContain('15.000');
    expect(html).toContain(padoPrice(ren.chips).toLocaleString('pt-BR'));
  });

  it('o que já é seu não tem botão de compra', () => {
    const html = card({ owned: true });
    expect(html).toContain('Seu');
    expect(html).not.toContain('15.000');
  });

  it('o que vem com o jogo diz isso', () => {
    const html = card({ item: marina, owned: true });
    expect(html).toContain('Já vem com o jogo');
  });

  it('sem saldo o botão fica travado, e diz o que falta', () => {
    const html = card({ chips: 1000 });
    expect(html).toContain('disabled');
    expect(html).toContain('faltam 14.000 fichas');
  });

  it('padocoin insuficiente trava só o botão dele', () => {
    const html = card({ chips: 99_999, pado: 10 });
    // o de fichas segue clicável; o de padocoin, não
    const botoes = botoesDeCompra(html);
    expect(botoes[0]).not.toContain('disabled');
    expect(botoes[1]).toContain('disabled');
  });

  it('sem conta no servidor não dá para comprar nada', () => {
    const html = card({ canShop: false, pado: 9999 });
    for (const b of botoesDeCompra(html)) expect(b).toContain('disabled');
  });

  it('a arte abre o item de perto, e isso nunca trava', () => {
    // olhar não é comprar: mesmo sem conta no servidor, o jogador pode ver o que está à venda
    expect(card({ canShop: false }).split('<button')[1]).toContain('shop-ver');
  });
});
