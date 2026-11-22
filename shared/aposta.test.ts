import { describe, expect, it } from 'vitest';
import { ACESSORIOS, SEM_ACESSORIOS, type Acessorios } from './acessorios';
import { VALOR_EM_BLINDS, apostaveis, chaveDoItem, devolverAsMaos, podeApostar, tirarDasMaos, valorDaAposta, vestirOndeDer } from './aposta';
import { newDeck, parseCard, sameCard, type Card } from './cards';
import { isFree, rarityOf } from './catalog';
import { Hand, type HandEvent, type PotResult } from './engine';

const cs = (s: string): Card[] => s.split(' ').map(parseCard);
/** O baralho na ordem em que as cartas saem. */
const arrumado = (ordem: Card[]): Card[] => [...newDeck().filter((c) => !ordem.some((o) => sameCard(o, c))), ...[...ordem].reverse()];
/** Mano a mano (o assento 0 é o dealer): as cartas saem para o 1, o 0, o 1, o 0; depois queima e mesa. */
const GANHA_O_0 = arrumado(cs('7c As 2d Ah 4h Kd 9s 3c 5h Jd 6h 8s'));
const GANHA_O_1 = arrumado(cs('As 7c Ah 2d 4h Kd 9s 3c 5h Jd 6h 8s'));

function mano(deck: Card[], pilhas: [number, number] = [1000, 1000], entrada?: { id: string; valor: number }) {
  const eventos: HandEvent[] = [];
  const h = new Hand(
    {
      players: [
        { seat: 0, id: 'a', stack: pilhas[0], ...(entrada ? { entrada } : {}) },
        { seat: 1, id: 'b', stack: pilhas[1] },
      ],
      dealerSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
      deck,
    },
    (e) => eventos.push(e),
  );
  h.start();
  return { h, eventos, potes: (): PotResult[] => h.results };
}

/** Todo mundo passa (ou paga) até a mão acabar. */
function ateOFim(h: Hand) {
  let guarda = 0;
  while (!h.finished && h.toActSeat !== null && guarda++ < 100) {
    const s = h.toActSeat;
    const l = h.legalActions(s)!;
    const r = h.act(s, l.canCheck ? { type: 'check' } : { type: 'call' });
    if (!r.ok) throw new Error(r.error);
  }
}

const fichas = (h: Hand) => h.players.reduce((s, p) => s + p.stack, 0);

describe('o que se aposta e quanto vale', () => {
  it('só anel, pulseira e relógio — a aliança de início também; esmalte e luva (e o que vem com o jogo), não', () => {
    expect(podeApostar('relogio-esportivo')).toBe(true);
    expect(podeApostar('pulseira-couro')).toBe(true);
    expect(podeApostar('anel-ebano')).toBe(true);
    // a aliança lisa deixou de ser "do jogo": toda conta começa com uma, e quem a aposta e perde fica sem
    expect(podeApostar('anel-alianca')).toBe(true);
    expect(podeApostar('esmalte-vermelho')).toBe(false);
    expect(podeApostar('luva-couro')).toBe(false);
    // o que vem de graça com o jogo é esmalte e luva: não se aposta
    for (const id of ACESSORIOS.filter((a) => isFree(chaveDoItem(a.id))).map((a) => a.id)) expect(podeApostar(id), id).toBe(false);
    expect(podeApostar('nada')).toBe(false);
    // e toda peça que se aposta é anel, pulseira ou relógio
    for (const a of ACESSORIOS) expect(podeApostar(a.id), a.id).toBe(['anel', 'pulseira', 'relogio'].includes(a.tipo));
  });

  it('o valor é em big blinds, pela raridade: a mesma peça vale mais numa mesa mais cara — e a aliança, que é comum, vale 2 big blinds', () => {
    const r = rarityOf('acessorio:relogio-esportivo');
    expect(valorDaAposta('relogio-esportivo', 20)).toBe(VALOR_EM_BLINDS[r] * 20);
    expect(valorDaAposta('relogio-esportivo', 1000)).toBe(VALOR_EM_BLINDS[r] * 1000);
    expect(VALOR_EM_BLINDS.comum).toBe(2);
    expect(valorDaAposta('anel-alianca', 20)).toBe(40);
    expect(valorDaAposta('anel-alianca', 1000)).toBe(2000);
    // o que não se aposta não vale nada
    expect(valorDaAposta('esmalte-vermelho', 20)).toBe(0);
    expect(valorDaAposta('luva-traje', 20)).toBe(0);
    expect(valorDaAposta('nada', 20)).toBe(0);
    // a escada sobe com a raridade
    expect(VALOR_EM_BLINDS.comum).toBeLessThan(VALOR_EM_BLINDS.incomum);
    expect(VALOR_EM_BLINDS.incomum).toBeLessThan(VALOR_EM_BLINDS.raro);
    expect(VALOR_EM_BLINDS.raro).toBeLessThan(VALOR_EM_BLINDS.epico);
    expect(VALOR_EM_BLINDS.epico).toBeLessThan(VALOR_EM_BLINDS.lendario);
  });

  it('a peça sai das mãos e volta para o mesmo lugar', () => {
    const maos: Acessorios = {
      ...SEM_ACESSORIOS,
      aneis: [
        { id: 'anel-ebano', mao: 'E', dedo: 2 },
        { id: 'anel-alianca', mao: 'D', dedo: 2 },
        { id: 'anel-ebano', mao: 'D', dedo: 0 },
      ],
      bracos: { E: ['pulseira-contas', 'relogio-esportivo', 'pulseira-contas'], D: ['pulseira-couro'] },
    };
    // (braços, depois anéis, sem repetir — e a aliança de início entra na lista, como qualquer anel)
    expect(apostaveis(maos)).toEqual(['pulseira-contas', 'relogio-esportivo', 'pulseira-couro', 'anel-ebano', 'anel-alianca']);
    // sai **uma**: são dois anéis de ébano, e cada um é uma aposta — sai o do último dedo em que foi posto
    const sem = tirarDasMaos(maos, 'anel-ebano');
    expect(sem.acessorios.aneis).toEqual([
      { id: 'anel-ebano', mao: 'E', dedo: 2 },
      { id: 'anel-alianca', mao: 'D', dedo: 2 },
    ]);
    expect(sem.onde).toEqual({ dedo: { id: 'anel-ebano', mao: 'D', dedo: 0 } });
    const deVolta = devolverAsMaos(sem.acessorios, 'anel-ebano', sem.onde);
    const ordem = (a: Acessorios) => [...a.aneis].sort((x, y) => (x.mao + x.dedo).localeCompare(y.mao + y.dedo));
    expect(ordem(deVolta)).toEqual(ordem(maos));
    // do braço: a do alto da fila (a pulseira de contas de cima), e volta para o mesmo lugar dela
    const semContas = tirarDasMaos(maos, 'pulseira-contas');
    expect(semContas.acessorios.bracos.E).toEqual(['pulseira-contas', 'relogio-esportivo']);
    expect(semContas.onde).toEqual({ braco: { mao: 'E', i: 2 } });
    expect(devolverAsMaos(semContas.acessorios, 'pulseira-contas', semContas.onde).bracos).toEqual(maos.bracos);
    const semRelogio = tirarDasMaos(maos, 'relogio-esportivo');
    expect(semRelogio.acessorios.bracos).toEqual({ E: ['pulseira-contas', 'pulseira-contas'], D: ['pulseira-couro'] });
    expect(devolverAsMaos(semRelogio.acessorios, 'relogio-esportivo', semRelogio.onde).bracos).toEqual(maos.bracos);
    // (com outro relógio posto enquanto isso, o que volta não toma o lugar dele)
    const comOutro = { ...semRelogio.acessorios, bracos: { ...semRelogio.acessorios.bracos, D: ['relogio-lua'] } };
    expect(devolverAsMaos(comOutro, 'relogio-esportivo', semRelogio.onde)).toBe(comOutro);
  });

  it('quem ganha veste a peça onde houver lugar: o anel num dedo livre, a pulseira no braço com lugar, o relógio só se não tem um', () => {
    expect(vestirOndeDer(SEM_ACESSORIOS, 'anel-rubi')?.aneis).toEqual([{ id: 'anel-rubi', mao: 'E', dedo: 2 }]);
    const cheio: Acessorios = { ...SEM_ACESSORIOS, bracos: { E: Array(5).fill('pulseira-contas'), D: ['relogio-lua'] } };
    expect(vestirOndeDer(cheio, 'pulseira-couro')?.bracos.D).toEqual(['relogio-lua', 'pulseira-couro']);
    expect(vestirOndeDer(cheio, 'relogio-rose')).toBeNull();
    expect(vestirOndeDer({ ...cheio, bracos: { E: [], D: [] } }, 'relogio-rose')?.bracos.E).toEqual(['relogio-rose']);
  });
});

describe('o acessório na aposta', () => {
  it('vale como aposta: o outro paga em fichas; quem ganha leva a peça, e ela não vira ficha', () => {
    const { h, eventos } = mano(GANHA_O_1);
    // o assento 0 (small blind de 10) aposta um relógio que vale 200: aposta de 210
    expect(h.legalActions(0)!.canStake).toBe(true);
    expect(h.stake(0, 'relogio', 200)).toEqual({ ok: true });
    expect(h.currentBet).toBe(210);
    expect(h.bySeat(0)!.stack).toBe(990);
    const acao = eventos.find((e) => e.t === 'action');
    expect(acao).toMatchObject({ seat: 0, action: 'raise', amount: 0, betTo: 210, item: { id: 'relogio', valor: 200 } });
    // o outro paga os 190 que faltam, em fichas
    expect(h.legalActions(1)!.callAmount).toBe(190);
    h.act(1, { type: 'call' });
    ateOFim(h);
    expect(h.finished).toBe(true);
    // o assento 1 ganhou: recebe de volta as fichas dele e o blind do outro — e o relógio
    expect(h.bySeat(1)!.stack).toBe(1010);
    expect(h.bySeat(0)!.stack).toBe(990);
    expect(fichas(h)).toBe(2000);
    expect(h.results[0].itens).toEqual([{ id: 'relogio', valor: 200, de: 0, para: 1 }]);
    expect(h.results[0].amount).toBe(220);
  });

  it('quem apostou e ganhou fica com a peça e com as fichas que pagaram por ela', () => {
    const { h } = mano(GANHA_O_0);
    h.stake(0, 'relogio', 200);
    h.act(1, { type: 'call' });
    ateOFim(h);
    expect(h.bySeat(0)!.stack).toBe(1210);
    expect(h.bySeat(1)!.stack).toBe(790);
    expect(fichas(h)).toBe(2000);
    expect(h.results[0].itens).toEqual([{ id: 'relogio', valor: 200, de: 0, para: 0 }]);
  });

  it('ninguém paga: a peça volta para o dono, que leva só as fichas que havia', () => {
    const { h } = mano(GANHA_O_1);
    h.stake(0, 'relogio', 200);
    h.act(1, { type: 'fold' });
    expect(h.finished).toBe(true);
    // ganhou o big blind do outro; a parte da aposta que ninguém pagou não virou ficha
    expect(h.bySeat(0)!.stack).toBe(1020);
    expect(h.bySeat(1)!.stack).toBe(980);
    expect(h.results[0].itens).toEqual([{ id: 'relogio', valor: 10, de: 0, para: 0 }]);
  });

  it('a aposta inteira sem ninguém pagar devolve a peça na hora', () => {
    // no flop, sem aposta na rodada: o assento 1 aposta o relógio e o outro desiste
    const { h, eventos } = mano(GANHA_O_1);
    h.act(0, { type: 'call' });
    h.act(1, { type: 'check' });
    expect(h.street).toBe('flop');
    expect(h.toActSeat).toBe(1);
    h.stake(1, 'relogio', 200);
    h.act(0, { type: 'fold' });
    expect(eventos.some((e) => e.t === 'itemVolta' && e.seat === 1 && e.item === 'relogio')).toBe(true);
    expect(h.results[0].itens).toBeUndefined();
    expect(h.bySeat(1)!.stack).toBe(1020);
    expect(fichas(h)).toBe(2000);
  });

  it('o acessório que não cobre a aposta é completado com fichas', () => {
    const { h } = mano(GANHA_O_1);
    h.act(0, { type: 'raise', amount: 500 });
    // o assento 1 (big blind de 20) paga os 480 com um anel de 100 e 380 em fichas
    expect(h.stake(1, 'anel', 100)).toEqual({ ok: true });
    expect(h.bySeat(1)!.stack).toBe(600);
    expect(h.bySeat(1)!.total).toBe(500);
    ateOFim(h);
    // ganhou: leva as 500 fichas do outro, e o anel volta
    expect(h.bySeat(1)!.stack).toBe(1500);
    expect(h.bySeat(0)!.stack).toBe(500);
    expect(h.results[0].itens).toEqual([{ id: 'anel', valor: 100, de: 1, para: 1 }]);
  });

  it('fora da vez, ou sem valor, é recusado', () => {
    const { h } = mano(GANHA_O_1);
    expect(h.stake(1, 'relogio', 200).ok).toBe(false);
    expect(h.stake(0, 'relogio', 0).ok).toBe(false);
    expect(h.stake(0, 'relogio', 12.5).ok).toBe(false);
  });

  it('contra uma pilha curta: o pote lateral não paga fichas pelo acessório, e a peça vai com o pote em que está o topo dela', () => {
    const eventos: HandEvent[] = [];
    // três jogadores; o assento 2 tem só 50. Cartas: o 1 tem a melhor mão, depois o 2, depois o 0
    const deck = arrumado(cs('As Kd 2c Ah Ks 7d 4h Qc 9s 3c 5h Jd 6h 8s'));
    const h = new Hand(
      {
        players: [
          { seat: 0, id: 'a', stack: 1000 },
          { seat: 1, id: 'b', stack: 1000 },
          { seat: 2, id: 'c', stack: 50 },
        ],
        dealerSeat: 0,
        smallBlind: 10,
        bigBlind: 20,
        deck,
      },
      (e) => eventos.push(e),
    );
    h.start();
    // o 0 (dealer) age primeiro: aposta um relógio de 300
    expect(h.toActSeat).toBe(0);
    h.stake(0, 'relogio', 300);
    h.act(1, { type: 'call' });
    h.act(2, { type: 'allin' });
    ateOFim(h);
    expect(h.finished).toBe(true);
    // as fichas se conservam: nenhuma foi criada pelo relógio
    expect(fichas(h)).toBe(2050);
    // o 1 ganhou tudo: o pote principal (50 de cada: 100 em fichas, o resto é relógio) e o lateral
    const itens = h.results.flatMap((p) => p.itens ?? []);
    expect(itens).toEqual([{ id: 'relogio', valor: 300, de: 0, para: 1 }]);
    expect(h.bySeat(1)!.stack).toBe(1050);
    expect(h.bySeat(0)!.stack).toBe(1000);
    expect(h.bySeat(2)!.stack).toBe(0);
  });
});

describe('entrar na mão apostando um acessório', () => {
  it('é o all-in de quem ficou sem fichas: os outros pagam o valor dele para ver', () => {
    const { h, eventos } = mano(GANHA_O_0, [0, 1000], { id: 'relogio', valor: 320 });
    expect(h.bySeat(0)!.allIn).toBe(true);
    expect(h.currentBet).toBe(320);
    expect(eventos.some((e) => e.t === 'action' && e.seat === 0 && e.action === 'allin' && e.item?.id === 'relogio')).toBe(true);
    // a vez é do outro (o big blind): paga 300 a mais, ou desiste
    expect(h.toActSeat).toBe(1);
    expect(h.legalActions(1)!.callAmount).toBe(300);
    h.act(1, { type: 'call' });
    expect(h.finished).toBe(true);
    // ganhou: o relógio volta e ele sai da mão com as 320 fichas do outro
    expect(h.bySeat(0)!.stack).toBe(320);
    expect(h.bySeat(1)!.stack).toBe(680);
    expect(h.results[0].itens).toEqual([{ id: 'relogio', valor: 320, de: 0, para: 0 }]);
  });

  it('perdeu: o outro fica com o relógio, e com as próprias fichas de volta', () => {
    const { h } = mano(GANHA_O_1, [0, 1000], { id: 'relogio', valor: 320 });
    h.act(1, { type: 'call' });
    expect(h.bySeat(0)!.stack).toBe(0);
    expect(h.bySeat(1)!.stack).toBe(1000);
    expect(h.results[0].itens).toEqual([{ id: 'relogio', valor: 320, de: 0, para: 1 }]);
  });

  it('o outro desiste: ele leva o blind e fica com o relógio', () => {
    const { h } = mano(GANHA_O_1, [0, 1000], { id: 'relogio', valor: 320 });
    h.act(1, { type: 'fold' });
    expect(h.finished).toBe(true);
    expect(h.bySeat(0)!.stack).toBe(20);
    expect(h.bySeat(1)!.stack).toBe(980);
    expect(h.results[0].itens?.[0]).toMatchObject({ de: 0, para: 0 });
  });
});

describe('fichas não nascem de acessório', () => {
  it('mãos ao acaso, com apostas de acessório no meio, conservam as fichas', () => {
    let semente = 7;
    const acaso = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 300; n++) {
      const pilhas = [0, 1, 2, 3].map(() => 40 + Math.floor(acaso() * 1500));
      const h = new Hand({ players: pilhas.map((stack, seat) => ({ seat, id: 's' + seat, stack })), dealerSeat: n % 4, smallBlind: 10, bigBlind: 20 });
      const antes = pilhas.reduce((s, v) => s + v, 0);
      h.start();
      let guarda = 0;
      let peca = 0;
      while (!h.finished && h.toActSeat !== null && guarda++ < 400) {
        const s = h.toActSeat;
        const l = h.legalActions(s)!;
        const x = acaso();
        if (l.canStake && x < 0.25) {
          const r = h.stake(s, 'peca' + peca++, 20 * (1 + Math.floor(acaso() * 16)));
          if (r.ok) continue;
        }
        if (x < 0.4) h.act(s, l.canCheck ? { type: 'check' } : { type: 'fold' });
        else if (x < 0.8) h.act(s, l.canCheck ? { type: 'check' } : { type: 'call' });
        else if (l.canRaise && x < 0.93) h.act(s, { type: 'raise', amount: l.minRaiseTo });
        else h.act(s, { type: 'allin' });
      }
      expect(h.finished, `mão ${n}`).toBe(true);
      expect(fichas(h), `mão ${n}`).toBe(antes);
      for (const p of h.players) expect(p.stack, `mão ${n}`).toBeGreaterThanOrEqual(0);
      // toda peça apostada, ou voltou na hora, ou saiu no fim para alguém
      const noFim = h.results.flatMap((r) => r.itens ?? []);
      expect(new Set(noFim.map((i) => i.id)).size).toBe(noFim.length);
    }
  });
});
