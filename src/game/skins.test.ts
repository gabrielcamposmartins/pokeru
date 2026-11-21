import { describe, expect, it } from 'vitest';
import type { SeatView, TableView } from '../../shared/protocol';
import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  CHIP_PRESETS,
  FACE_PRESETS,
  TABLE_PRESETS,
  type PlayerCosmetics,
} from '../../shared/styles';
import { chipSkin, dealerCardSkin, mainChipSkin, skinsDeApoio, tableSkin } from './skins';

/** Cosméticos distintos por assento, para dar para diferenciar nos asserts. */
function cosmetics(i: number): PlayerCosmetics {
  return {
    face: FACE_PRESETS[i % FACE_PRESETS.length],
    back: BACK_PRESETS[i % BACK_PRESETS.length],
    chip: CHIP_PRESETS[i % CHIP_PRESETS.length],
    table: TABLE_PRESETS[i % TABLE_PRESETS.length],
    character: CHARACTER_PRESETS[i % CHARACTER_PRESETS.length],
    winFx: 'gold',
    auras: ['brilho'],
    frame: 'ouro',
  };
}

function seat(i: number, isBot = false): SeatView {
  return {
    seat: i,
    id: `p${i}`,
    name: `J${i}`,
    isBot,
    avatar: { color: '#fff', icon: '♠' },
    cosmetics: cosmetics(i + 1),
    title: null,
    stack: 1000,
    bet: 0,
    inHand: true,
    folded: false,
    allIn: false,
    cards: [],
    lastAction: null,
    connected: true,
    busted: false,
  };
}

function view(over: Partial<TableView> = {}): TableView {
  return {
    roomId: 'r',
    handNo: 1,
    rounds: null,
    status: 'playing',
    variant: 'holdem',
    maxPlayers: 6,
    seats: [seat(0), seat(1), null, null, null, null],
    board: [],
    pot: 0,
    street: 'preflop',
    dealerSeat: 1,
    sbSeat: 0,
    bbSeat: 1,
    toAct: 0,
    timeLeftMs: null,
    turnTimeMs: 15_000,
    currentBet: 0,
    smallBlind: 10,
    bigBlind: 20,
    mySeat: 0,
    legal: null,
    highlight: [],
    ...over,
  };
}

const MEU_TABLE = TABLE_PRESETS[TABLE_PRESETS.length - 1];
const MEU_CHIP = CHIP_PRESETS[CHIP_PRESETS.length - 1];
const MINHAS_CARTAS = { face: FACE_PRESETS[FACE_PRESETS.length - 1], back: BACK_PRESETS[BACK_PRESETS.length - 1] };

describe('bot não empresta skin', () => {
  // a mesa da fila nasce com tres bots: se o botao do dealer emprestasse a skin deles, o feltro
  // trocaria de cor a cada mao, com um estilo sorteado
  const comBots = view({ seats: [seat(0), seat(1, true), seat(2, true), null, null, null] });

  it('o botão num bot não muda o feltro nem a stack principal', () => {
    expect(tableSkin({ ...comBots, dealerSeat: 1 }, MEU_TABLE)).toBe(MEU_TABLE);
    expect(mainChipSkin({ ...comBots, dealerSeat: 2 }, MEU_CHIP)).toBe(MEU_CHIP);
  });

  it('a aposta de um bot sai com as minhas fichas', () => {
    expect(chipSkin(comBots, 1, MEU_CHIP)).toBe(MEU_CHIP);
  });

  it('o botão num bot não troca o baralho', () => {
    expect(dealerCardSkin({ ...comBots, dealerSeat: 1 }, MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
  });

  it('numa mesa mista, o bot continua de fora', () => {
    // eu (0), gente (1) e um bot (2): a skin de quem e' gente vale, a do bot nao
    const mista = view({ seats: [seat(0), seat(1), seat(2, true), null, null, null] });
    expect(tableSkin({ ...mista, dealerSeat: 1 }, MEU_TABLE)).toBe(cosmetics(2).table);
    expect(tableSkin({ ...mista, dealerSeat: 2 }, MEU_TABLE)).toBe(MEU_TABLE);
    expect(chipSkin(mista, 1, MEU_CHIP)).toBe(cosmetics(2).chip);
    expect(chipSkin(mista, 2, MEU_CHIP)).toBe(MEU_CHIP);
  });
});

describe('mesa segue o dealer', () => {
  it('usa a mesa do dealer quando o dealer é gente', () => {
    expect(tableSkin(view(), MEU_TABLE)).toBe(cosmetics(2).table);
  });

  it('contra bots a mesa continua sendo a minha', () => {
    const v = view({ seats: [seat(0), seat(1, true), null, null, null, null] });
    expect(tableSkin(v, MEU_TABLE)).toBe(MEU_TABLE);
  });

  it('se eu sou o dealer, é a minha mesa que vale — a do perfil, não a cópia do servidor', () => {
    // a cópia do servidor pode estar um passo atrás de uma troca que eu acabei de fazer no Estúdio
    const v = view({ dealerSeat: 0 });
    expect(tableSkin(v, MEU_TABLE)).toBe(MEU_TABLE);
  });

  it('contra bots é a minha mesa a partida inteira, ande o botão para onde andar', () => {
    const soBots = view({ seats: [seat(0), seat(1, true), seat(2, true), null, null, null] });
    for (const dealerSeat of [0, 1, 2, null]) {
      expect(tableSkin({ ...soBots, dealerSeat }, MEU_TABLE), `botão em ${dealerSeat}`).toBe(MEU_TABLE);
      expect(mainChipSkin({ ...soBots, dealerSeat }, MEU_CHIP), `botão em ${dealerSeat}`).toBe(MEU_CHIP);
    }
  });

  it('com gente na mesa, a mesa troca quando o botão passa de um para o outro', () => {
    // eu (0), duas pessoas (1 e 2) e um bot (3)
    const v = view({ seats: [seat(0), seat(1), seat(2), seat(3, true), null, null] });
    expect(tableSkin({ ...v, dealerSeat: 1 }, MEU_TABLE)).toBe(cosmetics(2).table);
    expect(tableSkin({ ...v, dealerSeat: 2 }, MEU_TABLE)).toBe(cosmetics(3).table);
    expect(tableSkin({ ...v, dealerSeat: 3 }, MEU_TABLE)).toBe(MEU_TABLE);
    expect(tableSkin({ ...v, dealerSeat: 0 }, MEU_TABLE)).toBe(MEU_TABLE);
    expect(mainChipSkin({ ...v, dealerSeat: 2 }, MEU_CHIP)).toBe(cosmetics(3).chip);
  });

  it('sem dealer definido cai na minha', () => {
    expect(tableSkin(view({ dealerSeat: null }), MEU_TABLE)).toBe(MEU_TABLE);
  });
});

describe('fichas', () => {
  it('a aposta de cada um sai com as fichas dele', () => {
    expect(chipSkin(view(), 1, MEU_CHIP)).toBe(cosmetics(2).chip);
  });

  it('as minhas apostas usam as fichas que eu equipei', () => {
    expect(chipSkin(view(), 0, MEU_CHIP)).toBe(MEU_CHIP);
  });

  it('assento vazio cai nas minhas', () => {
    expect(chipSkin(view(), 4, MEU_CHIP)).toBe(MEU_CHIP);
  });

  it('a stack principal é a do dealer', () => {
    expect(mainChipSkin(view(), MEU_CHIP)).toBe(cosmetics(2).chip);
  });

  it('contra bots a stack principal continua minha', () => {
    const v = view({ seats: [seat(0), seat(1, true), null, null, null, null] });
    expect(mainChipSkin(v, MEU_CHIP)).toBe(MEU_CHIP);
  });
});

describe('cartas da rodada seguem o dealer', () => {
  it('com gente, o baralho é o do dealer: frente e verso', () => {
    expect(dealerCardSkin(view(), MINHAS_CARTAS)).toEqual({ face: cosmetics(2).face, back: cosmetics(2).back });
  });

  it('o baralho troca junto com o botão (e com a mesa)', () => {
    const v = view({ seats: [seat(0), seat(1), seat(2), null, null, null] });
    expect(dealerCardSkin({ ...v, dealerSeat: 2 }, MINHAS_CARTAS).back).toBe(cosmetics(3).back);
    expect(tableSkin({ ...v, dealerSeat: 2 }, MEU_TABLE)).toBe(cosmetics(3).table);
    expect(dealerCardSkin({ ...v, dealerSeat: 1 }, MINHAS_CARTAS).back).toBe(cosmetics(2).back);
  });

  it('com o botão comigo, num bot, ou sem botão, são as minhas', () => {
    const mista = view({ seats: [seat(0), seat(1), seat(2, true), null, null, null] });
    expect(dealerCardSkin({ ...mista, dealerSeat: 0 }, MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
    expect(dealerCardSkin({ ...mista, dealerSeat: 2 }, MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
    expect(dealerCardSkin({ ...mista, dealerSeat: null }, MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
  });

  it('contra bots é sempre o meu baralho', () => {
    const soBots = view({ seats: [seat(0), seat(1, true), seat(2, true), null, null, null] });
    for (const dealerSeat of [0, 1, 2]) expect(dealerCardSkin({ ...soBots, dealerSeat }, MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
  });
});

describe('as cartas da rodada são do dealer', () => {
  it('o baralho (frente e verso) é o do dealer, quando ele é gente', () => {
    expect(dealerCardSkin(view(), MINHAS_CARTAS)).toEqual({ face: cosmetics(2).face, back: cosmetics(2).back });
  });

  it('com o botão comigo, é o meu — o do perfil', () => {
    expect(dealerCardSkin(view({ dealerSeat: 0 }), MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
  });

  it('não depende de quem está na vez, de quem abre nem de quem ganha: só do botão', () => {
    // três pessoas, o botão no assento 2: seja quem for agindo (ou mostrando as cartas), o baralho é o dele
    const tres = view({ seats: [seat(0), seat(1), seat(2), null, null, null], dealerSeat: 2 });
    for (const toAct of [0, 1, 2, null]) {
      for (const street of ['preflop', 'river', 'showdown'] as const) {
        expect(dealerCardSkin({ ...tres, toAct, street }, MINHAS_CARTAS)).toEqual({ face: cosmetics(3).face, back: cosmetics(3).back });
      }
    }
  });

  it('assento do dealer vazio: fica o meu', () => {
    expect(dealerCardSkin(view({ dealerSeat: 3 }), MINHAS_CARTAS)).toBe(MINHAS_CARTAS);
  });
});

describe('as skins na página de apoio', () => {
  const mine = { table: TABLE_PRESETS[0], chip: CHIP_PRESETS[0], cards: { face: FACE_PRESETS[0], back: BACK_PRESETS[0] } };

  it('de cada um: bot também empresta a mesa, o baralho e as fichas', () => {
    const v = view({ seats: [seat(0), seat(1, true), null, null, null, null], dealerSeat: 1 });
    expect(tableSkin(v, mine.table)).toBe(mine.table);
    skinsDeApoio('de-cada-um');
    try {
      expect(tableSkin(v, mine.table)).toBe(v.seats[1]!.cosmetics.table);
      expect(dealerCardSkin(v, mine.cards).back).toBe(v.seats[1]!.cosmetics.back);
      expect(chipSkin(v, 1, mine.chip)).toBe(v.seats[1]!.cosmetics.chip);
      expect(mainChipSkin(v, mine.chip)).toBe(v.seats[1]!.cosmetics.chip);
    } finally {
      skinsDeApoio('regra');
    }
  });

  it('minhas: nem gente empresta', () => {
    const v = view({ dealerSeat: 1 });
    expect(tableSkin(v, mine.table)).toBe(v.seats[1]!.cosmetics.table);
    skinsDeApoio('minhas');
    try {
      expect(tableSkin(v, mine.table)).toBe(mine.table);
      expect(chipSkin(v, 1, mine.chip)).toBe(mine.chip);
      expect(dealerCardSkin(v, mine.cards)).toBe(mine.cards);
    } finally {
      skinsDeApoio('regra');
    }
  });
});
