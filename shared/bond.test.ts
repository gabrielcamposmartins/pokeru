import { describe, expect, it } from 'vitest';
import { GIFTS, itemKey, rarityOf, rarityRank, RARIDADES } from './catalog';
import {
  BOND_GOSTOS,
  BOND_MAX,
  EMPTY_BOND,
  GIFT_POINTS,
  HEARTS,
  HEART_COST,
  HEART_GIFT_RARITY,
  addBond,
  bondBlocked,
  bondCap,
  giftFits,
  giftPoints,
  giftRarityFor,
  payGift,
  questHearts,
  questsFor,
} from './bond';
import { CHARACTER_PRESETS } from './styles';

/**
 * A tranca do vínculo: jogar enche o coração, a missão abre, o presente acelera.
 *
 * O que estes testes protegem é a promessa feita ao jogador — que nada do que ele jogou se perde
 * enquanto o coração espera — e a escada dos presentes, que o servidor cobra.
 */

describe('teto dos pontos', () => {
  it('sem coração aberto, a barra enche só o primeiro', () => {
    expect(bondCap(0)).toBe(HEART_COST[0]);
    expect(bondCap(1)).toBe(HEART_COST[0] + HEART_COST[1]);
    expect(bondCap(HEARTS)).toBe(BOND_MAX);
    // acima do último coração não há mais teto que o total
    expect(bondCap(99)).toBe(BOND_MAX);
  });

  it('os pontos param no teto, mas os contadores continuam subindo', () => {
    let st = EMPTY_BOND;
    for (let i = 0; i < 20; i++) st = addBond(st, 'matchWin', bondCap(0));
    expect(st.points).toBe(bondCap(0));
    expect(st.matches).toBe(20);
  });

  it('o coração trancado é o que está cheio esperando a missão', () => {
    expect(bondBlocked(bondCap(0) - 1, 0)).toBe(false);
    expect(bondBlocked(bondCap(0), 0)).toBe(true);
    // com o primeiro aberto, o mesmo ponto deixa de travar
    expect(bondBlocked(bondCap(0), 1)).toBe(false);
    // vínculo completo não tranca nada
    expect(bondBlocked(BOND_MAX, HEARTS)).toBe(false);
  });
});

describe('as missões abrem os corações', () => {
  it('coração nenhum abre com a ficha zerada', () => {
    expect(questHearts(EMPTY_BOND)).toBe(0);
  });

  it('cumprir a missão do primeiro abre um coração, e só um', () => {
    expect(questHearts({ ...EMPTY_BOND, hands: 10 })).toBe(1);
    expect(questHearts({ ...EMPTY_BOND, hands: 29, matches: 5 })).toBe(1);
    expect(questHearts({ ...EMPTY_BOND, hands: 30, matches: 2 })).toBe(2);
  });

  it('todos os cinco são alcançáveis, e a escada só sobe', () => {
    const forte = { ...EMPTY_BOND, hands: 1000, wins: 500, matches: 100 };
    expect(questHearts(forte)).toBe(HEARTS);
    for (let h = 2; h <= HEARTS; h++) {
      for (const q of questsFor(h)) {
        const antes = questsFor(h - 1).find((a) => a.counter === q.counter);
        if (antes) expect(q.need, `${h}/${q.counter}`).toBeGreaterThan(antes.need);
      }
    }
  });

  it('parar num coração não deixa pular para o seguinte', () => {
    // mãos de sobra, mas sem as partidas que o segundo pede
    expect(questHearts({ ...EMPTY_BOND, hands: 900, wins: 400, matches: 1 })).toBe(1);
  });

  it('a barra trava no teto do que as missões abriram', () => {
    const st = { ...EMPTY_BOND, hands: 10 };
    let pts = EMPTY_BOND;
    for (let i = 0; i < 50; i++) pts = addBond(pts, 'matchWin', bondCap(questHearts(st)));
    expect(pts.points).toBe(bondCap(1));
  });
});

describe('presentes: altura e pontos', () => {
  it('cada coração pede um degrau mais alto que o anterior', () => {
    expect(HEART_GIFT_RARITY).toHaveLength(HEARTS);
    expect(HEART_GIFT_RARITY[0]).toBe('comum');
    for (let i = 1; i < HEARTS; i++) {
      expect(rarityRank(HEART_GIFT_RARITY[i]), `${i}`).toBeLessThan(rarityRank(HEART_GIFT_RARITY[i - 1]));
    }
  });

  it('existe presente para todo degrau da escada, senão um coração ficaria sem alimento', () => {
    const degraus = new Set(GIFTS.map((g) => rarityOf(itemKey('gift', g.id))));
    for (const r of HEART_GIFT_RARITY) expect(degraus.has(r), r).toBe(true);
  });

  it('o presente pequeno é recusado, e o grande vale em qualquer coração', () => {
    // flor é comum: serve no primeiro coração e em mais nenhum
    expect(giftFits('flor', 0)).toBe(true);
    expect(giftFits('flor', 1)).toBe(false);
    // kimono é lendário: serve em todos
    for (let u = 0; u < HEARTS; u++) expect(giftFits('kimono', u), `${u}`).toBe(true);
  });

  it('acima do último coração a exigência não estoura a escada', () => {
    expect(giftRarityFor(HEARTS)).toBe(HEART_GIFT_RARITY[HEARTS - 1]);
    expect(giftRarityFor(-5)).toBe(HEART_GIFT_RARITY[0]);
  });

  it('quanto mais alto o degrau, mais pontos ele rende', () => {
    const ordem = RARIDADES.map((r) => GIFT_POINTS[r.id]);
    for (let i = 1; i < ordem.length; i++) expect(ordem[i], RARIDADES[i].id).toBeLessThan(ordem[i - 1]);
  });

  it('o presente predileto do personagem rende mais que o mesmo presente a outro', () => {
    // fone é da Marina; Ren recebe o mesmo fone e se anima menos
    expect(giftPoints('marina', 'fone')).toBeGreaterThan(giftPoints('ren', 'fone'));
    expect(giftPoints('ren', 'livro')).toBeGreaterThan(giftPoints('marina', 'livro'));
  });

  it('todo personagem tem gostos, e todos apontam para presentes que existem', () => {
    for (const c of CHARACTER_PRESETS) {
      const gostos = BOND_GOSTOS[c.id];
      expect(gostos, c.id).toBeTruthy();
      expect(gostos.length, c.id).toBeGreaterThan(0);
      for (const id of gostos) expect(GIFTS.some((g) => g.id === id), `${c.id}/${id}`).toBe(true);
    }
  });
});

describe('estoque de presentes', () => {
  it('dar um presente tira um do estoque e limpa o que zerou', () => {
    const antes = { flor: 2, cha: 1 };
    expect(payGift(antes, 'flor')).toEqual({ flor: 1, cha: 1 });
    expect(payGift(antes, 'cha')).toEqual({ flor: 2 });
    // e não mexe no estoque antigo
    expect(antes).toEqual({ flor: 2, cha: 1 });
  });

  it('dar o que não se tem não inventa dívida', () => {
    expect(payGift({ flor: 1 }, 'joia')).toEqual({ flor: 1 });
  });
});
