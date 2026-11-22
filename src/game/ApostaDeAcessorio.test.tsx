import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SEM_ACESSORIOS, type Acessorios } from '../../shared/acessorios';
import type { LegalActions } from '../../shared/engine';
import type { SeatView, TableView } from '../../shared/protocol';
import { useTable } from '../store/table';
import { BandejaDeAcessorios, BotaoDeAcessorios, ItensNaMesa, OfertaDeAcessorio, PerguntaDeAcessorio, efeitoDaAposta, ondeEsta } from './ApostaDeAcessorio';

/**
 * O menu de apostar um acessório. O que se cobra sem abrir o navegador: a conta do que a aposta faz
 * (é o que a bandeja mostra grande, antes da confirmação — tem de bater com `Hand.stake`), onde a
 * peça está sendo usada, e o que o botão, a pergunta e as etiquetas da mesa desenham.
 */

const MAOS: Acessorios = {
  ...SEM_ACESSORIOS,
  aneis: [
    { id: 'anel-esmeralda', mao: 'E', dedo: 2 },
    { id: 'anel-solitario', mao: 'D', dedo: 0 },
    // (a aliança de início: também se aposta — é a quinta peça destas mãos)
    { id: 'anel-alianca', mao: 'D', dedo: 2 },
  ],
  bracos: { E: ['relogio-classico'], D: ['pulseira-contas'] },
};

const assento = (seat: number, patch: Partial<SeatView> = {}): SeatView =>
  ({ seat, id: `j${seat}`, name: seat === 0 ? 'Jogador' : `Bot ${seat}`, isBot: seat !== 0, cosmetics: { acessorios: seat === 0 ? MAOS : SEM_ACESSORIOS }, stack: 2000, bet: 0, inHand: true, folded: false, allIn: false, cards: [], lastAction: null, connected: true, busted: false, ...patch }) as unknown as SeatView;

const LEGAL: LegalActions = { canFold: true, canCheck: false, canCall: true, callAmount: 0, canRaise: true, minRaiseTo: 0, maxRaiseTo: 0, isBet: false, canStake: true };

/** Uma mesa de blinds 50/100 na minha vez: a aposta está em `aposta`, e eu já pus `minha`. */
function mesa(aposta: number, minha: number, patch: Partial<TableView> = {}, eu: Partial<SeatView> = {}): TableView {
  return {
    roomId: 'r',
    handNo: 1,
    rounds: null,
    status: 'playing',
    variant: 'holdem',
    maxPlayers: 4,
    seats: [assento(0, { bet: minha, ...eu }), assento(1, { bet: aposta }), assento(2)],
    board: [],
    pot: 0,
    street: 'preflop',
    dealerSeat: 2,
    sbSeat: 0,
    bbSeat: 1,
    toAct: 0,
    timeLeftMs: 20_000,
    turnTimeMs: 25_000,
    currentBet: aposta,
    smallBlind: 50,
    bigBlind: 100,
    mySeat: 0,
    legal: LEGAL,
    highlight: [],
    itens: [],
    ...patch,
  } as TableView;
}

describe('o que apostar a peça faz agora', () => {
  it('sem aposta na rodada, abre uma com o valor da peça', () => {
    expect(efeitoDaAposta(mesa(0, 0), 1600)?.titulo).toBe('Aposta 1.600');
  });

  it('com a minha aposta já igualada (o big blind), aumenta para o que eu tinha mais a peça', () => {
    expect(efeitoDaAposta(mesa(100, 100), 1600)?.titulo).toBe('Aumenta para 1.700');
  });

  it('a peça do tamanho exato da aposta só paga', () => {
    expect(efeitoDaAposta(mesa(200, 0), 200)?.titulo).toBe('Paga os 200');
  });

  it('a peça maior que a aposta paga e aumenta', () => {
    const e = efeitoDaAposta(mesa(150, 0), 1600);
    expect(e?.titulo).toBe('Paga 150 e aumenta para 1.600');
    expect(e?.barrada).toBeFalsy();
    // (do small blind: o que já está na frente conta)
    expect(efeitoDaAposta(mesa(100, 50), 1600)?.titulo).toBe('Paga 50 e aumenta para 1.650');
  });

  it('a peça menor que a aposta paga a parte dela, e as fichas completam', () => {
    const e = efeitoDaAposta(mesa(300, 0), 100);
    expect(e?.titulo).toBe('Paga 100 dos 300');
    expect(e?.detalhe).toContain('Mais 200 em fichas');
    expect(e?.detalhe).not.toContain('all-in');
  });

  it('se as fichas que completam são todas as que tenho, avisa do all-in', () => {
    const e = efeitoDaAposta(mesa(900, 0, {}, { stack: 500 }), 200);
    expect(e?.titulo).toBe('Paga 200 dos 900');
    expect(e?.detalhe).toContain('Mais 500 em fichas');
    expect(e?.detalhe).toContain('all-in');
  });

  it('peça maior que a aposta com o aumento fechado: não cabe, e a bandeja diz por quê', () => {
    // tenho fichas de sobra e mesmo assim não posso aumentar: a rodada não foi reaberta
    const e = efeitoDaAposta(mesa(150, 100, { legal: { ...LEGAL, canRaise: false } }), 1600);
    expect(e?.barrada).toBe(true);
    expect(e?.detalhe).toContain('não dá para aumentar');
    // todos os outros all-in: ninguém responderia ao aumento
    const sos = mesa(5000, 0, { legal: { ...LEGAL, canRaise: false } }, { stack: 300 });
    sos.seats = [sos.seats[0], assento(1, { bet: 5000, allIn: true }), assento(2, { folded: true })];
    expect(efeitoDaAposta(sos, 6000)?.barrada).toBe(true);
  });
});

describe('onde a peça está sendo usada', () => {
  it('diz o pulso e o dedo', () => {
    expect(ondeEsta(MAOS, 'relogio-classico')).toBe('Pulso esquerdo');
    expect(ondeEsta(MAOS, 'pulseira-contas')).toBe('Pulso direito');
    expect(ondeEsta(MAOS, 'anel-esmeralda')).toBe('Anelar esquerdo');
    expect(ondeEsta(MAOS, 'anel-solitario')).toBe('Indicador direito');
    expect(ondeEsta(MAOS, 'anel-rubi')).toBe('');
    expect(ondeEsta({ ...MAOS, bracos: { E: ['pulseira-contas'], D: ['pulseira-contas'] } }, 'pulseira-contas')).toBe('Nos dois pulsos');
    // (duas iguais no mesmo braço, uma abaixo e outra acima do relógio)
    expect(ondeEsta({ ...MAOS, bracos: { E: ['pulseira-contas', 'relogio-classico', 'pulseira-contas'], D: [] } }, 'pulseira-contas')).toBe('2 no braço esquerdo');
  });
});

/** A bandeja desenhada com uma mesa (as lojas não entram: quem as lê é o botão). */
const bandeja = (view: TableView, over: { naVez?: boolean; escolhida?: string | null } = {}) =>
  renderToStaticMarkup(<BandejaDeAcessorios view={view} naVez={over.naVez ?? true} escolhida={over.escolhida ?? null} aoEscolher={() => {}} aoCancelar={() => {}} aoApostar={() => {}} aoFechar={() => {}} />);
/** Os cartões das peças, um pedaço de HTML por cartão. */
const cartoes = (html: string) => html.split('<button').filter((b) => b.includes('cartao-peca'));

describe('a bandeja dos acessórios', () => {
  it('mostra um cartão por peça que se aposta — a aliança de início entre elas —, com raridade, lugar e valor em fichas e em blinds', () => {
    const html = bandeja(mesa(100, 0));
    // (o relógio, a pulseira, os dois anéis de pedra e a aliança lisa, que deixou de ser "do jogo")
    expect(cartoes(html)).toHaveLength(5);
    const alianca = cartoes(html).find((c) => c.includes('Aliança lisa'))!;
    expect(alianca).toContain('r-comum');
    expect(alianca).toContain('Comum');
    expect(alianca).toContain('Anelar direito');
    expect(alianca).toContain('200');
    expect(alianca).toContain('2 BB');
    const relogio = cartoes(html).find((c) => c.includes('Relógio clássico'))!;
    expect(relogio).toContain('r-lendario');
    expect(relogio).toContain('Lendário');
    expect(relogio).toContain('Pulso esquerdo');
    expect(relogio).toContain('1.600');
    expect(relogio).toContain('16 BB');
    expect(cartoes(html).find((c) => c.includes('Esmeralda'))).toContain('Anelar esquerdo');
  });

  it('na vez, sem escolha: os cartões se oferecem e nada de botão de apostar', () => {
    const html = bandeja(mesa(100, 0));
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).toContain('Escolha uma peça');
    expect(html).not.toContain('class="confirma');
    expect(html).not.toContain('apostar"');
  });

  it('com uma peça escolhida: o efeito em destaque, o risco, e a confirmação em dois botões', () => {
    const html = bandeja(mesa(150, 0), { escolhida: 'relogio-classico' });
    expect(cartoes(html).filter((c) => c.includes('aria-pressed="true"'))).toHaveLength(1);
    expect(html).toContain('<strong class="efeito">Paga 150 e aumenta para 1.600</strong>');
    expect(html).toContain('Se perder a mão, a peça fica com quem ganhou.');
    expect(html).toContain('Cancelar');
    expect(html).toContain('<span>Apostar Relógio clássico</span>');
  });

  it('a peça que não cabe (aumento fechado) diz por quê e não tem o botão de apostar', () => {
    const html = bandeja(mesa(150, 100, { legal: { ...LEGAL, canRaise: false } }), { escolhida: 'relogio-classico' });
    expect(html).toContain('confirma r-lendario barrada');
    expect(html).toContain('Cancelar');
    expect(html).not.toContain('<span>Apostar Relógio clássico</span>');
  });

  it('fora da vez: todos os cartões apagados, e a frase da espera', () => {
    const html = bandeja(mesa(100, 0, { toAct: 1, legal: null }), { naVez: false });
    expect(cartoes(html).every((c) => c.includes('aria-disabled="true"'))).toBe(true);
    expect(html).toContain('Dá para apostar na sua vez.');
    expect(html).not.toContain('class="confirma');
  });

  it('na vez, só o que o servidor deixa apostar se oferece — pelo valor que ele diz', () => {
    const html = bandeja(mesa(100, 0, { apostaveis: [{ id: 'relogio-classico', valor: 3200 }] }));
    const [livres, travados] = [cartoes(html).filter((c) => c.includes('aria-disabled="false"')), cartoes(html).filter((c) => c.includes('aria-disabled="true"'))];
    expect(livres).toHaveLength(1);
    expect(livres[0]).toContain('Relógio clássico');
    expect(livres[0]).toContain('3.200');
    // (as outras quatro, a aliança entre elas, ficam apagadas)
    expect(travados).toHaveLength(4);
    expect(travados.some((c) => c.includes('Aliança lisa'))).toBe(true);
  });

  it('as peças apostadas aparecem em "Na mesa", com de quem são e quanto valem', () => {
    const html = bandeja(
      mesa(100, 0, {
        itens: [
          { seat: 0, id: 'pulseira-contas', valor: 200, emJogo: 200, naAposta: true },
          { seat: 1, id: 'anel-sinete', valor: 600, emJogo: 600, naAposta: false },
        ],
      }),
    );
    const naMesa = html.slice(html.indexOf('class="na-mesa"'));
    expect(naMesa).toContain('Na mesa');
    expect(naMesa).toContain('Contas de jade');
    expect(naMesa).toContain('>sua<');
    expect(naMesa).toContain('Sinete');
    expect(naMesa).toContain('de Bot 1');
    expect(naMesa).toContain('>600<');
  });

  it('com mais de quatro peças, os cartões vão em duas fileiras, compactos — e a aliança de início conta como peça', () => {
    const com = (acessorios: Acessorios) => {
      const view = mesa(100, 0);
      view.seats = [assento(0, { cosmetics: { acessorios } as never }), view.seats[1], view.seats[2]];
      return bandeja(view);
    };
    const cheio: Acessorios = { ...MAOS, aneis: [...MAOS.aneis, { id: 'anel-rubi', mao: 'E', dedo: 0 }, { id: 'anel-safira', mao: 'E', dedo: 1 }] };
    expect(com(cheio)).toMatch(/class="pecas[^"]*muitas/);
    // as mãos de sempre têm cinco peças agora que a aliança se aposta: já são duas fileiras
    expect(cartoes(bandeja(mesa(100, 0)))).toHaveLength(5);
    expect(bandeja(mesa(100, 0))).toMatch(/class="pecas[^"]*muitas/);
    // sem a aliança são quatro, e quatro cabem numa fileira só
    const quatro: Acessorios = { ...MAOS, aneis: MAOS.aneis.filter((x) => x.id !== 'anel-alianca') };
    expect(cartoes(com(quatro))).toHaveLength(4);
    expect(com(quatro)).not.toMatch(/class="pecas[^"]*muitas/);
  });
});

describe('o botão dos acessórios', () => {
  beforeEach(() => useTable.setState({ display: null }));

  it('sem mesa, não aparece', () => {
    expect(renderToStaticMarkup(<BotaoDeAcessorios />)).toBe('');
  });
});

describe('a pergunta de quando as fichas acabam', () => {
  beforeEach(() => useTable.setState({ display: null, ofertaAte: null }));

  it('sem oferta, não desenha nada', () => {
    expect(renderToStaticMarkup(<OfertaDeAcessorio />)).toBe('');
  });

  it('mostra um cartão por peça, com raridade, lugar e valor, o relógio e a saída', () => {
    const html = renderToStaticMarkup(
      <PerguntaDeAcessorio
        itens={[
          { id: 'relogio-classico', valor: 1600 },
          { id: 'pulseira-contas', valor: 200 },
        ]}
        bigBlind={100}
        maos={MAOS}
        faltaMs={7500}
        aoResponder={() => {}}
      />,
    );
    expect(html).toContain('Suas fichas acabaram');
    expect(html.match(/cartao-peca escolha/g)).toHaveLength(2);
    expect(html).toContain('Relógio clássico');
    expect(html).toContain('Lendário');
    expect(html).toContain('Pulso esquerdo');
    expect(html).toContain('1.600');
    expect(html).toContain('16 BB');
    // metade do tempo: a barra pela metade, e os segundos arredondados para cima
    expect(html).toContain('width:50%');
    expect(html).toContain('Não, obrigado (8s)');
  });
});

describe('as peças em cima da mesa', () => {
  it('sem peças, nada; com peças, de quem é cada uma e quanto vale', () => {
    expect(renderToStaticMarkup(<ItensNaMesa itens={[]} nomes={() => ''} />)).toBe('');
    const html = renderToStaticMarkup(<ItensNaMesa itens={[{ seat: 1, id: 'anel-sinete', valor: 600, emJogo: 600, naAposta: true }]} nomes={() => 'Ren'} />);
    expect(html).toContain('Sinete de Ren — vale 600');
    expect(html).toContain('>600<');
  });
});
