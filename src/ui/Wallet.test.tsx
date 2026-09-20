import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChipSvg } from '../render/Chip';
import { WalletPill } from './Wallet';

describe('barra de fichas', () => {
  it('mostra o saldo formatado e o botão de conseguir mais', () => {
    const html = renderToStaticMarkup(
      <WalletPill amount={60000} onPlus={() => {}}>
        <ChipSvg value={100} size={30} />
      </WalletPill>,
    );
    expect(html).toContain('60.000');
    expect(html).toContain('wallet-pill-plus');
    expect(html).toContain('<svg'); // a ficha desenhada
  });

  it('sem o "+" (moeda que ainda não tem loja), a pílula é só o número', () => {
    const html = renderToStaticMarkup(
      <WalletPill amount={0}>
        <ChipSvg value={100} size={30} />
      </WalletPill>,
    );
    expect(html).toContain('>0<');
    expect(html).not.toContain('wallet-pill-plus');
  });
});
