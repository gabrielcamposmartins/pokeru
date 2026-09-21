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
import { chipSkin, hasOtherHumans, mainChipSkin, openerCardSkin, tableSkin } from './skins';

/** Cosméticos distintos por assento, para dar para diferenciar nos asserts. */
function cosmetics(i: number): PlayerCosmetics {
  return {
    face: FACE_PRESETS[i % FACE_PRESETS.length],
    back: BACK_PRESETS[i % BACK_PRESETS.length],
    chip: CHIP_PRESETS[i % CHIP_PRESETS.length],
    table: TABLE_PRESETS[i % TABLE_PRESETS.length],
    character: CHARACTER_PRESETS[i % CHARACTER_PRESETS.length],
    winFx: 'gold',
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

describe('hasOtherHumans', () => {
  it('só conta humano em outro assento', () => {
    expect(hasOtherHumans(view())).toBe(true);
    expect(hasOtherHumans(view({ seats: [seat(0), seat(1, true), null, null, null, null] }))).toBe(false);
    expect(hasOtherHumans(view({ seats: [seat(0), null, null, null, null, null] }))).toBe(false);
  });
});

describe('mesa segue o dealer', () => {
  it('usa a mesa do dealer quando há outro humano', () => {
    expect(tableSkin(view(), MEU_TABLE)).toBe(cosmetics(2).table);
  });

  it('contra bots a mesa continua sendo a minha', () => {
    const v = view({ seats: [seat(0), seat(1, true), null, null, null, null] });
    expect(tableSkin(v, MEU_TABLE)).toBe(MEU_TABLE);
  });

  it('se eu sou o dealer, é a minha mesa que vale para todos', () => {
    // a mesa do dealer vem do assento dele; do meu lado, é a que eu equipei
    const v = view({ dealerSeat: 0 });
    expect(tableSkin(v, MEU_TABLE)).toBe(cosmetics(1).table);
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

describe('cartas de quem abre a mão', () => {
  it('fora do showdown ninguém abre: null', () => {
    expect(openerCardSkin(view(), null, MINHAS_CARTAS)).toBeNull();
  });

  it('quem abre empresta frente e verso', () => {
    const skin = openerCardSkin(view(), 1, MINHAS_CARTAS);
    expect(skin).toEqual({ face: cosmetics(2).face, back: cosmetics(2).back });
  });

  it('se eu abro, são as minhas', () => {
    expect(openerCardSkin(view(), 0, MINHAS_CARTAS)).toEqual(MINHAS_CARTAS);
  });

  it('contra bots não troca nada', () => {
    const v = view({ seats: [seat(0), seat(1, true), null, null, null, null] });
    expect(openerCardSkin(v, 1, MINHAS_CARTAS)).toBeNull();
  });

  it('assento que saiu da mesa não empresta skin', () => {
    expect(openerCardSkin(view(), 3, MINHAS_CARTAS)).toBeNull();
  });
});
