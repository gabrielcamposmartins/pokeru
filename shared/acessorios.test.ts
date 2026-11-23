import { describe, expect, it } from 'vitest';
import {
  ACESSORIOS,
  ESMALTE_PADRAO,
  LUVA_PADRAO,
  MAX_ANEIS,
  MAX_PULSEIRAS,
  SEM_ACESSORIOS,
  TIPOS_DE_ACESSORIO,
  acessoriosDoTipo,
  alternarAnel,
  bracoDoRelogio,
  cabeNoBraco,
  chaveDosAcessorios,
  emUso,
  findAcessorio,
  moverNoBraco,
  porLuva,
  porNoBraco,
  pulseirasNoBraco,
  sanitizeAcessorios,
  tirarDoBraco,
  vezesEmUso,
} from './acessorios';
import { DE_INICIO, FREE_KEYS, PRECO_DO_ACESSORIO, SO_DE_ROLETA, clampAcessorios, clampCosmetics, eDeInicio, estaAVenda, findItem, isFree, itemKey, itemsOfKind, marcaDePerdido, quantasTem, rarityOf, seConta } from './catalog';
import { ROULETTES, dropsOf } from './roulette';
import { sanitizeCosmetics } from './styles';

describe('os acessórios das mãos', () => {
  it('há de todos os tipos, cada um com id próprio', () => {
    expect(new Set(ACESSORIOS.map((a) => a.id)).size).toBe(ACESSORIOS.length);
    for (const t of TIPOS_DE_ACESSORIO) expect(acessoriosDoTipo(t.id).length, t.nome).toBeGreaterThanOrEqual(4);
    // os anéis têm pedras de formatos diferentes
    const pedras = new Set(acessoriosDoTipo('anel').map((a) => (a.tipo === 'anel' ? a.pedra : '')));
    expect(pedras.size).toBeGreaterThanOrEqual(8);
  });

  it('estão todos no catálogo; o que vem com o jogo é a unha natural, as mãos nuas e a luva do traje — o anel liso é de início, não de graça', () => {
    expect(itemsOfKind('acessorio').map((i) => i.id)).toEqual(ACESSORIOS.map((a) => a.id));
    const gratis = ACESSORIOS.filter((a) => isFree(itemKey('acessorio', a.id))).map((a) => a.id);
    expect(gratis.sort()).toEqual([ESMALTE_PADRAO, 'luva-traje', LUVA_PADRAO].sort());
    // a aliança lisa saiu dessa lista: toda conta começa com uma, mas ela tem preço e pode ser perdida numa aposta
    expect(DE_INICIO).toEqual([itemKey('acessorio', 'anel-alianca')]);
    expect(ACESSORIOS.filter((a) => eDeInicio(itemKey('acessorio', a.id))).map((a) => a.id)).toEqual(['anel-alianca']);
    expect(FREE_KEYS).not.toContain(itemKey('acessorio', 'anel-alianca'));
    // todo mundo começa de mãos nuas, mesmo que o traje tenha luva
    expect(LUVA_PADRAO).toBe('luva-nenhuma');
    expect(SEM_ACESSORIOS.luvas).toEqual({ E: 'luva-nenhuma', D: 'luva-nenhuma' });
    expect(sanitizeAcessorios(undefined).luvas).toEqual({ E: 'luva-nenhuma', D: 'luva-nenhuma' });
  });

  it('todo acessório pago sai de uma roleta, metade de cada — 28 nas Flores (com as luvas de motorista, a peça a mais) e 27 no Dragão', () => {
    const pagos = ACESSORIOS.filter((a) => !isFree(itemKey('acessorio', a.id)));
    const [flores, dragao] = ROULETTES.map((r) => dropsOf(r).filter((d) => d.kind === 'acessorio'));
    expect(flores.length + dragao.length).toBe(pagos.length);
    expect(pagos).toHaveLength(55);
    expect(flores).toHaveLength(28);
    expect(dragao).toHaveLength(27);
    // e em cada degrau também: a mesma conta — a aliança lisa (comum, no Dragão) fechou o par do relógio de campo (nas Flores).
    // Só o raro tem uma a mais nas Flores: as luvas de motorista, que ainda não têm par no Dragão
    const conta = (l: typeof flores, r: string) => l.filter((d) => rarityOf(d.key) === r).length;
    for (const r of ['lendario', 'epico', 'incomum', 'comum'] as const) expect(conta(flores, r), r).toBe(conta(dragao, r));
    expect(conta(flores, 'raro')).toBe(conta(dragao, 'raro') + 1);
    expect(flores.map((d) => d.key)).toContain('acessorio:luva-motorista');
    expect(conta(flores, 'lendario')).toBe(4);
    expect(conta(flores, 'comum')).toBe(5);
    expect(dragao.map((d) => d.key)).toContain('acessorio:anel-alianca');
    expect(flores.map((d) => d.key)).not.toContain('acessorio:anel-alianca');
  });

  it('cada tipo de acessório se divide entre as duas roletas (no máximo um de diferença)', () => {
    const [flores, dragao] = ROULETTES.map((r) => dropsOf(r).filter((d) => d.kind === 'acessorio'));
    const doTipo = (l: typeof flores, tipo: string) => l.filter((d) => findAcessorio(d.key.slice('acessorio:'.length))?.tipo === tipo).length;
    // (os esmaltes já pendiam para as Flores antes: sete a cinco; os que a loja vende ficam ao meio)
    for (const tipo of ['anel', 'pulseira', 'relogio', 'luva']) expect(Math.abs(doTipo(flores, tipo) - doTipo(dragao, tipo)), tipo).toBeLessThanOrEqual(1);
  });

  it('há três relógios novos: o de campo (comum), o prismático (raro) e o cronógrafo de bronze e prata (lendário)', () => {
    const degrau = (id: string) => rarityOf(itemKey('acessorio', id));
    const relogio = (id: string) => {
      const a = findAcessorio(id);
      if (a?.tipo !== 'relogio') throw new Error(`${id} não é um relógio`);
      return a;
    };
    expect(degrau('relogio-campo')).toBe('comum');
    expect(relogio('relogio-campo')).toMatchObject({ caixa: 'redonda', fosca: true, correia: 'lona' });
    expect(degrau('relogio-prisma')).toBe('raro');
    expect(relogio('relogio-prisma')).toMatchObject({ caixa: 'oitavada', visor: 'prisma' });
    expect(degrau('relogio-bronze')).toBe('lendario');
    const bronze = relogio('relogio-bronze');
    expect(bronze).toMatchObject({ correia: 'bicolor', visor: 'cronografo' });
    // bicolor: o segundo metal é outro, e a pulseira alterna os dois
    expect(bronze.metal2).toBeTruthy();
    expect(bronze.metal2).not.toBe(bronze.metal);
    expect(bronze.corDaCorreia).toBe(bronze.metal);
  });
});

describe('o que a loja vende', () => {
  const chave = (id: string) => itemKey('acessorio', id);
  const vendidos = ACESSORIOS.filter((a) => estaAVenda(chave(a.id))).map((a) => a.id);

  it('anel, pulseira e relógio se compram — menos os lendários e as exceções; a aliança de início também está na prateleira', () => {
    for (const a of ACESSORIOS) {
      const key = chave(a.id);
      const deveria = ['anel', 'pulseira', 'relogio'].includes(a.tipo) && rarityOf(key) !== 'lendario' && !isFree(key) && !SO_DE_ROLETA.includes(key);
      expect(estaAVenda(key), a.id).toBe(deveria);
    }
    expect([...vendidos].sort()).toEqual(
      [
        // (a aliança lisa: quem a perdeu numa aposta compra outra)
        'anel-alianca',
        'anel-perola', 'anel-sinete', 'anel-coracao', 'anel-onix', 'anel-gota', 'anel-ebano', 'anel-serpente',
        'pulseira-contas', 'pulseira-couro', 'pulseira-perolas', 'pulseira-cordao', 'pulseira-riviera', 'pulseira-espinhos', 'pulseira-terco',
        'relogio-esportivo', 'relogio-rose', 'relogio-noturno', 'relogio-joia', 'relogio-digital', 'relogio-lua', 'relogio-mergulho', 'relogio-campo', 'relogio-prisma',
      ].sort(),
    );
  });

  it('as joias ficam de fora: os anéis de pedra preciosa, o terço de madrepérola e o relógio clássico são lendários; a corrente e as argolas, raras e só de roleta', () => {
    for (const id of ['anel-safira', 'anel-rubi', 'anel-solitario', 'anel-esmeralda', 'anel-trinca', 'pulseira-terco-madreperola', 'relogio-classico']) {
      expect(rarityOf(chave(id)), id).toBe('lendario');
      expect(estaAVenda(chave(id)), id).toBe(false);
    }
    for (const id of ['pulseira-corrente', 'pulseira-argolas']) {
      expect(rarityOf(chave(id)), id).toBe('raro');
      expect(estaAVenda(chave(id)), id).toBe(false);
    }
    // o lendário novo também não se vende, mesmo fora da lista: é a regra do degrau que o barra
    expect(SO_DE_ROLETA).not.toContain(chave('relogio-bronze'));
    expect(estaAVenda(chave('relogio-bronze'))).toBe(false);
    // e toda exceção é uma peça que existe
    for (const key of SO_DE_ROLETA) expect(findItem(key), key).toBeTruthy();
  });

  it('esmalte e luva continuam só de roleta, e o que vem com o jogo não se vende; a aliança de início se vende, pelo preço de comum', () => {
    for (const a of ACESSORIOS.filter((x) => x.tipo === 'esmalte' || x.tipo === 'luva')) expect(estaAVenda(chave(a.id)), a.id).toBe(false);
    for (const a of ACESSORIOS.filter((x) => isFree(chave(x.id)))) expect(estaAVenda(chave(a.id)), a.id).toBe(false);
    // a aliança deixou de ser "do jogo": tem preço e está à venda
    expect(isFree(chave('anel-alianca'))).toBe(false);
    expect(estaAVenda(chave('anel-alianca'))).toBe(true);
    expect(rarityOf(chave('anel-alianca'))).toBe('comum');
    expect(findItem(chave('anel-alianca'))!.chips).toBe(PRECO_DO_ACESSORIO.comum);
    expect(findItem(chave('anel-alianca'))!.chips).toBe(1000);
  });

  it('o que se vende continua saindo de roleta', () => {
    const naRoleta = new Set(ROULETTES.flatMap((r) => dropsOf(r).map((d) => d.key)));
    for (const id of vendidos) expect(naRoleta.has(chave(id)), id).toBe(true);
  });

  it('o preço do acessório é o do degrau dele', () => {
    expect(PRECO_DO_ACESSORIO).toEqual({ comum: 1000, incomum: 2000, raro: 4000, epico: 8000, lendario: 12_000 });
    for (const a of ACESSORIOS) {
      const key = chave(a.id);
      expect(findItem(key)!.chips, a.id).toBe(isFree(key) ? 0 : PRECO_DO_ACESSORIO[rarityOf(key)]);
    }
    expect(findItem(chave('pulseira-contas'))!.chips).toBe(1000);
    expect(findItem(chave('anel-ebano'))!.chips).toBe(2000);
    expect(findItem(chave('relogio-prisma'))!.chips).toBe(4000);
    expect(findItem(chave('relogio-mergulho'))!.chips).toBe(8000);
    // (o lendário não se vende: o preço dele só serve ao reembolso de repetido)
    expect(findItem(chave('anel-safira'))!.chips).toBe(12_000);
  });
});

describe('o que chega de fora', () => {
  it('nada (um cliente antigo) vira "sem acessórios"', () => {
    expect(sanitizeAcessorios(undefined)).toEqual(SEM_ACESSORIOS);
    expect(sanitizeAcessorios('x')).toEqual(SEM_ACESSORIOS);
    expect(sanitizeCosmetics({}).acessorios).toEqual(SEM_ACESSORIOS);
  });

  it('só passa o que existe, no lugar em que cabe: um anel por dedo, e não mais que o limite', () => {
    const a = sanitizeAcessorios({
      aneis: [
        { id: 'anel-rubi', mao: 'E', dedo: 0 },
        { id: 'anel-safira', mao: 'E', dedo: 0 }, // o mesmo dedo: fica o primeiro
        { id: 'pulseira-contas', mao: 'E', dedo: 1 }, // não é anel
        { id: 'anel-rubi', mao: 'X', dedo: 1 },
        { id: 'anel-rubi', mao: 'D', dedo: 7 },
        { id: 'nada', mao: 'D', dedo: 1 },
        ...[0, 1, 2, 3, 4].map((dedo) => ({ id: 'anel-alianca', mao: 'D', dedo })),
        ...[1, 2, 3, 4].map((dedo) => ({ id: 'anel-alianca', mao: 'E', dedo })),
      ],
      bracos: { E: ['anel-rubi', 'relogio-classico', 'relogio-lua', ...Array(7).fill('pulseira-contas')], D: ['relogio-digital', 'pulseira-couro', 'nada'] },
      esmalte: 'luva-couro',
      luvas: { E: 'luva-couro', D: 'esmalte-preto' },
    });
    expect(a.aneis).toHaveLength(MAX_ANEIS);
    expect(a.aneis[0]).toEqual({ id: 'anel-rubi', mao: 'E', dedo: 0 });
    // nos braços: só pulseira e relógio, até cinco pulseiras por braço, e um relógio só (o primeiro)
    expect(a.bracos.E).toEqual(['relogio-classico', ...Array(MAX_PULSEIRAS).fill('pulseira-contas')]);
    expect(a.bracos.D).toEqual(['pulseira-couro']);
    expect(a.esmalte).toBe(ESMALTE_PADRAO);
    expect(a.luvas).toEqual({ E: 'luva-couro', D: LUVA_PADRAO });
  });

  it('o jeito antigo (um em cada pulso, uma luva para as duas mãos) vira o novo — e o novo leva o antigo junto, para os clientes de antes', () => {
    const a = sanitizeAcessorios({ aneis: [], pulsos: { E: 'relogio-rose', D: 'pulseira-contas' }, luva: 'luva-renda' });
    expect(a.bracos).toEqual({ E: ['relogio-rose'], D: ['pulseira-contas'] });
    expect(a.luvas).toEqual({ E: 'luva-renda', D: 'luva-renda' });
    // (o cliente antigo lê `pulsos` e `luva`: o relógio no pulso dele, senão a pulseira de baixo; a luva que não é a nua)
    const b = sanitizeAcessorios({ bracos: { E: ['pulseira-contas', 'relogio-rose'], D: [] }, luvas: { E: LUVA_PADRAO, D: 'luva-couro' } });
    expect(b.pulsos).toEqual({ E: 'relogio-rose', D: null });
    expect(b.luva).toBe('luva-couro');
    // dois relógios do jeito antigo (um em cada pulso): fica o da esquerda
    expect(sanitizeAcessorios({ pulsos: { E: 'relogio-rose', D: 'relogio-lua' } }).bracos).toEqual({ E: ['relogio-rose'], D: [] });
  });

  it('o servidor corta o que a conta não tem: o anel e o relógio saem, o esmalte e a luva voltam aos de graça', () => {
    const pedido = sanitizeAcessorios({
      aneis: [
        { id: 'anel-alianca', mao: 'E', dedo: 2 },
        { id: 'anel-coracao', mao: 'D', dedo: 2 },
        { id: 'anel-onix', mao: 'D', dedo: 0 },
      ],
      bracos: { E: ['relogio-rose'], D: ['pulseira-contas'] },
      esmalte: 'esmalte-vinho',
      luvas: { E: 'luva-couro', D: 'luva-traje' },
    });
    const meus = clampAcessorios(pedido, ['acessorio:anel-coracao', 'acessorio:pulseira-contas']);
    expect(meus.aneis.map((x) => x.id)).toEqual(['anel-alianca', 'anel-coracao']);
    expect(meus.bracos).toEqual({ E: [], D: ['pulseira-contas'] });
    expect(meus.esmalte).toBe(ESMALTE_PADRAO);
    // (a luva que não é da conta volta para a mão nua; a do traje vem com o jogo e fica)
    expect(meus.luvas).toEqual({ E: 'luva-nenhuma', D: 'luva-traje' });
    // e a trava dos cosméticos leva os acessórios junto
    const c = clampCosmetics({ ...sanitizeCosmetics({}), acessorios: pedido }, []);
    expect(c.acessorios?.aneis.map((x) => x.id)).toEqual(['anel-alianca']);
    expect(c.acessorios?.bracos).toEqual({ E: [], D: [] });
  });

  it('as joias se contam: nas mãos, cada uma não mais vezes do que a conta tem', () => {
    const RUBI = itemKey('acessorio', 'anel-rubi');
    const CONTAS = itemKey('acessorio', 'pulseira-contas');
    expect(seConta(RUBI) && seConta(CONTAS) && seConta(itemKey('acessorio', 'relogio-lua'))).toBe(true);
    // o esmalte e a luva são de ter ou não ter; o que vem com o jogo não se conta
    expect(seConta(itemKey('acessorio', 'esmalte-vinho')) || seConta(itemKey('acessorio', 'luva-couro')) || seConta(itemKey('acessorio', LUVA_PADRAO))).toBe(false);
    expect(quantasTem([RUBI, RUBI, CONTAS], RUBI)).toBe(2);
    expect(quantasTem(['acessorio:esmalte-vinho', 'acessorio:esmalte-vinho'], 'acessorio:esmalte-vinho')).toBe(1);
    expect(quantasTem([], itemKey('acessorio', 'luva-traje'))).toBe(Infinity);
    const pedido = sanitizeAcessorios({
      aneis: [0, 1, 2].map((dedo) => ({ id: 'anel-rubi', mao: 'E', dedo })),
      bracos: { E: ['pulseira-contas', 'pulseira-contas'], D: ['pulseira-contas'] },
    });
    const meus = clampAcessorios(pedido, [RUBI, RUBI, CONTAS, CONTAS]);
    expect(meus.aneis.map((x) => x.dedo)).toEqual([0, 1]);
    expect(meus.bracos).toEqual({ E: ['pulseira-contas', 'pulseira-contas'], D: [] });
  });

  it('a aliança de início fica nas mãos de quem ainda a tem — e sai das de quem a perdeu numa aposta', () => {
    const ALIANCA = itemKey('acessorio', 'anel-alianca');
    const pedido = sanitizeAcessorios({
      aneis: [
        { id: 'anel-alianca', mao: 'E', dedo: 2 },
        { id: 'anel-coracao', mao: 'D', dedo: 2 },
        { id: 'anel-alianca', mao: 'D', dedo: 0 },
      ],
      bracos: { E: ['pulseira-contas'], D: [] },
    });
    const aneis = (owned: readonly string[] | undefined) => clampAcessorios(pedido, owned).aneis.map((x) => x.id);
    // conta nova (lista vazia) e quem joga sem conta: a aliança é dela — uma, num dedo só
    expect(aneis(['acessorio:anel-coracao'])).toEqual(['anel-alianca', 'anel-coracao']);
    expect(aneis(undefined)).toEqual(['anel-alianca']);
    // ganhou mais uma: são duas, nos dois dedos
    expect(aneis([ALIANCA])).toEqual(['anel-alianca', 'anel-alianca']);
    // perdeu: a marca tira a aliança de todos os dedos, e não mexe no resto
    const perdeu = clampAcessorios(pedido, [marcaDePerdido(ALIANCA), 'acessorio:anel-coracao', 'acessorio:pulseira-contas']);
    expect(perdeu.aneis).toEqual([{ id: 'anel-coracao', mao: 'D', dedo: 2 }]);
    expect(perdeu.bracos).toEqual({ E: ['pulseira-contas'], D: [] });
    expect(aneis([marcaDePerdido(ALIANCA)])).toEqual([]);
    // comprou (ou tirou na roleta) outra: a chave na lista conta, além da marca
    expect(aneis([marcaDePerdido(ALIANCA), ALIANCA])).toEqual(['anel-alianca']);
    // e a trava dos cosméticos leva a marca junto
    const c = clampCosmetics({ ...sanitizeCosmetics({}), acessorios: pedido }, [marcaDePerdido(ALIANCA)]);
    expect(c.acessorios?.aneis).toEqual([]);
  });
});

describe('equipar', () => {
  it('o anel vai para o dedo, troca o que estava lá, e sai clicando de novo', () => {
    let a = alternarAnel(SEM_ACESSORIOS, 'anel-rubi', 'E', 2);
    expect(a.aneis).toEqual([{ id: 'anel-rubi', mao: 'E', dedo: 2 }]);
    a = alternarAnel(a, 'anel-safira', 'E', 2);
    expect(a.aneis).toEqual([{ id: 'anel-safira', mao: 'E', dedo: 2 }]);
    expect(emUso(a, 'anel-safira')).toBe(true);
    expect(emUso(a, 'anel-rubi')).toBe(false);
    a = alternarAnel(a, 'anel-safira', 'E', 2);
    expect(a.aneis).toEqual([]);
    // o mesmo anel pode ir em vários dedos; passando do limite, o mais antigo sai
    for (let i = 0; i < MAX_ANEIS + 1; i++) a = alternarAnel(a, 'anel-alianca', i < 5 ? 'E' : 'D', i % 5);
    expect(a.aneis).toHaveLength(MAX_ANEIS);
    expect(a.aneis.some((x) => x.mao === 'E' && x.dedo === 0)).toBe(false);
  });

  it('os braços: até cinco pulseiras em cada um, um relógio só, e pulseiras abaixo ou acima dele', () => {
    let a = porNoBraco(SEM_ACESSORIOS, 'pulseira-contas', 'E');
    a = porNoBraco(a, 'relogio-classico', 'E');
    // (o relógio vai para junto da mão; a pulseira nova, para o alto da fila)
    expect(a.bracos.E).toEqual(['relogio-classico', 'pulseira-contas']);
    a = porNoBraco(a, 'pulseira-couro', 'E', 0);
    expect(a.bracos.E).toEqual(['pulseira-couro', 'relogio-classico', 'pulseira-contas']);
    a = moverNoBraco(a, 'E', 1, 1);
    expect(a.bracos.E).toEqual(['pulseira-couro', 'pulseira-contas', 'relogio-classico']);
    expect(moverNoBraco(a, 'E', 2, 1)).toBe(a);
    // um relógio só: pôr outro, no braço que for, tira o que havia
    a = porNoBraco(a, 'relogio-lua', 'D');
    expect(a.bracos).toEqual({ E: ['pulseira-couro', 'pulseira-contas'], D: ['relogio-lua'] });
    expect(bracoDoRelogio(a)).toBe('D');
    // cinco pulseiras: o braço está cheio (o relógio não conta)
    for (let i = 0; i < 4; i++) a = porNoBraco(a, 'pulseira-cordao', 'D');
    a = porNoBraco(a, 'pulseira-perolas', 'D');
    expect(pulseirasNoBraco(a, 'D')).toBe(MAX_PULSEIRAS);
    expect(cabeNoBraco(a, 'pulseira-riviera', 'D')).toBe(false);
    expect(porNoBraco(a, 'pulseira-riviera', 'D')).toBe(a);
    expect(cabeNoBraco(a, 'relogio-rose', 'D')).toBe(true);
    // quantas vezes cada peça está em uso
    expect(vezesEmUso(a, 'pulseira-cordao')).toBe(4);
    a = tirarDoBraco(a, 'D', 0);
    expect(a.bracos.D[0]).toBe('pulseira-cordao');
    expect(bracoDoRelogio(a)).toBeNull();
  });

  it('a luva vai nas duas mãos ou numa só', () => {
    let a = porLuva(SEM_ACESSORIOS, 'luva-renda', ['E']);
    expect(a.luvas).toEqual({ E: 'luva-renda', D: LUVA_PADRAO });
    expect(emUso(a, 'luva-renda')).toBe(true);
    a = porLuva(a, 'luva-couro', ['E', 'D']);
    expect(a.luvas).toEqual({ E: 'luva-couro', D: 'luva-couro' });
    // (o par é uma peça só: nas duas mãos, está em uso uma vez)
    expect(vezesEmUso(a, 'luva-couro')).toBe(1);
    expect(chaveDosAcessorios(porLuva(a, LUVA_PADRAO, ['D']))).not.toBe(chaveDosAcessorios(a));
  });

  it('a chave muda quando alguma coisa muda, e não com a ordem dos anéis', () => {
    const a = sanitizeAcessorios({ aneis: [{ id: 'anel-rubi', mao: 'E', dedo: 0 }, { id: 'anel-safira', mao: 'D', dedo: 1 }] });
    const b = sanitizeAcessorios({ aneis: [{ id: 'anel-safira', mao: 'D', dedo: 1 }, { id: 'anel-rubi', mao: 'E', dedo: 0 }] });
    expect(chaveDosAcessorios(a)).toBe(chaveDosAcessorios(b));
    expect(chaveDosAcessorios({ ...a, esmalte: 'esmalte-preto' })).not.toBe(chaveDosAcessorios(a));
    expect(findAcessorio('esmalte-preto')?.tipo).toBe('esmalte');
  });
});

describe('joia é rara', () => {
  const degrau = (id: string) => rarityOf(itemKey('acessorio', id));
  const alta = (id: string) => ['raro', 'epico', 'lendario'].includes(degrau(id));

  it('os anéis são raros ou mais — menos a aliança lisa (comum: de início, e não mais de graça) e o aro de ébano (incomum); os de pedra preciosa são lendários', () => {
    const livres = ['anel-alianca', 'anel-ebano'];
    for (const a of acessoriosDoTipo('anel')) if (!livres.includes(a.id)) expect(alta(a.id), a.id).toBe(true);
    expect(isFree(itemKey('acessorio', 'anel-alianca'))).toBe(false);
    expect(eDeInicio(itemKey('acessorio', 'anel-alianca'))).toBe(true);
    expect(degrau('anel-alianca')).toBe('comum');
    expect(degrau('anel-ebano')).toBe('incomum');
    const lendarios = acessoriosDoTipo('anel').filter((a) => degrau(a.id) === 'lendario').map((a) => a.id);
    expect(lendarios.sort()).toEqual(['anel-esmeralda', 'anel-rubi', 'anel-safira', 'anel-solitario', 'anel-trinca']);
  });

  it('os relógios são raros ou mais — menos o digital e o de campo; o clássico e o cronógrafo são lendários', () => {
    const livres = ['relogio-digital', 'relogio-campo'];
    for (const a of acessoriosDoTipo('relogio')) if (!livres.includes(a.id)) expect(alta(a.id), a.id).toBe(true);
    expect(degrau('relogio-digital')).toBe('incomum');
    expect(degrau('relogio-campo')).toBe('comum');
    const lendarios = acessoriosDoTipo('relogio').filter((a) => degrau(a.id) === 'lendario').map((a) => a.id);
    expect(lendarios.sort()).toEqual(['relogio-bronze', 'relogio-classico']);
  });

  it('as pulseiras de ouro são raras ou épicas, e o terço de madrepérola é a única lendária', () => {
    expect(acessoriosDoTipo('pulseira').filter((a) => degrau(a.id) === 'lendario').map((a) => a.id)).toEqual(['pulseira-terco-madreperola']);
    const deOuro = acessoriosDoTipo('pulseira').filter((a) => a.tipo === 'pulseira' && a.cor.toLowerCase() === '#e0ad3e');
    expect(deOuro.map((a) => a.id).sort()).toEqual(['pulseira-argolas', 'pulseira-corrente']);
    for (const a of deOuro) expect(alta(a.id), a.id).toBe(true);
  });
});

