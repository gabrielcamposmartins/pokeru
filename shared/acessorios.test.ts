import { describe, expect, it } from 'vitest';
import { ACESSORIOS, ESMALTE_PADRAO, LUVA_PADRAO, MAX_ANEIS, SEM_ACESSORIOS, TIPOS_DE_ACESSORIO, acessoriosDoTipo, alternarAnel, alternarPulso, chaveDosAcessorios, emUso, findAcessorio, sanitizeAcessorios } from './acessorios';
import { clampAcessorios, clampCosmetics, isFree, itemKey, itemsOfKind, rarityOf } from './catalog';
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

  it('estão todos no catálogo, e o que vem com o jogo é a unha natural, as mãos nuas, a luva do traje e um anel liso', () => {
    expect(itemsOfKind('acessorio').map((i) => i.id)).toEqual(ACESSORIOS.map((a) => a.id));
    const gratis = ACESSORIOS.filter((a) => isFree(itemKey('acessorio', a.id))).map((a) => a.id);
    expect(gratis.sort()).toEqual(['anel-alianca', ESMALTE_PADRAO, 'luva-traje', LUVA_PADRAO].sort());
    // todo mundo começa de mãos nuas, mesmo que o traje tenha luva
    expect(LUVA_PADRAO).toBe('luva-nenhuma');
    expect(SEM_ACESSORIOS.luva).toBe('luva-nenhuma');
    expect(sanitizeAcessorios(undefined).luva).toBe('luva-nenhuma');
  });

  it('todo acessório pago sai de uma roleta, metade de cada', () => {
    const pagos = ACESSORIOS.filter((a) => !isFree(itemKey('acessorio', a.id)));
    const [flores, dragao] = ROULETTES.map((r) => dropsOf(r).filter((d) => d.kind === 'acessorio'));
    expect(flores.length + dragao.length).toBe(pagos.length);
    expect(flores.length).toBe(dragao.length);
    // e em cada degrau também
    for (const r of ['epico', 'raro', 'incomum', 'comum'] as const) {
      expect(flores.filter((d) => rarityOf(d.key) === r).length, r).toBe(dragao.filter((d) => rarityOf(d.key) === r).length);
    }
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
      pulsos: { E: 'anel-rubi', D: 'relogio-classico' },
      esmalte: 'luva-couro',
      luva: 'luva-couro',
    });
    expect(a.aneis).toHaveLength(MAX_ANEIS);
    expect(a.aneis[0]).toEqual({ id: 'anel-rubi', mao: 'E', dedo: 0 });
    expect(a.pulsos).toEqual({ E: null, D: 'relogio-classico' });
    expect(a.esmalte).toBe(ESMALTE_PADRAO);
    expect(a.luva).toBe('luva-couro');
  });

  it('o servidor corta o que a conta não tem: o anel e o relógio saem, o esmalte e a luva voltam aos de graça', () => {
    const pedido = sanitizeAcessorios({
      aneis: [
        { id: 'anel-alianca', mao: 'E', dedo: 2 },
        { id: 'anel-coracao', mao: 'D', dedo: 2 },
        { id: 'anel-onix', mao: 'D', dedo: 0 },
      ],
      pulsos: { E: 'relogio-rose', D: 'pulseira-contas' },
      esmalte: 'esmalte-vinho',
      luva: 'luva-couro',
    });
    const meus = clampAcessorios(pedido, ['acessorio:anel-coracao', 'acessorio:pulseira-contas']);
    expect(meus.aneis.map((x) => x.id)).toEqual(['anel-alianca', 'anel-coracao']);
    expect(meus.pulsos).toEqual({ E: null, D: 'pulseira-contas' });
    expect(meus.esmalte).toBe(ESMALTE_PADRAO);
    // (a luva que não é da conta volta para as mãos nuas; a do traje vem com o jogo e fica)
    expect(meus.luva).toBe('luva-nenhuma');
    expect(clampAcessorios({ ...pedido, luva: 'luva-traje' }, []).luva).toBe('luva-traje');
    // e a trava dos cosméticos leva os acessórios junto
    const c = clampCosmetics({ ...sanitizeCosmetics({}), acessorios: pedido }, []);
    expect(c.acessorios?.aneis.map((x) => x.id)).toEqual(['anel-alianca']);
    expect(c.acessorios?.pulsos).toEqual({ E: null, D: null });
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

  it('um por pulso: a pulseira e o relógio dividem o lugar', () => {
    let a = alternarPulso(SEM_ACESSORIOS, 'relogio-classico', 'E');
    a = alternarPulso(a, 'pulseira-contas', 'E');
    expect(a.pulsos).toEqual({ E: 'pulseira-contas', D: null });
    a = alternarPulso(a, 'pulseira-contas', 'E');
    expect(a.pulsos.E).toBeNull();
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
  const alta = (id: string) => degrau(id) === 'raro' || degrau(id) === 'epico';

  it('os anéis são raros ou épicos — menos a aliança lisa, o aro de ébano e a serpente, que ficam no degrau deles', () => {
    const livres = ['anel-alianca', 'anel-ebano', 'anel-serpente'];
    for (const a of acessoriosDoTipo('anel')) if (!livres.includes(a.id)) expect(alta(a.id), a.id).toBe(true);
    expect(isFree(itemKey('acessorio', 'anel-alianca'))).toBe(true);
    expect(degrau('anel-ebano')).toBe('incomum');
  });

  it('os relógios são raros ou épicos — menos o digital, o noturno e o das fases da lua', () => {
    const livres = ['relogio-digital', 'relogio-noturno', 'relogio-lua'];
    for (const a of acessoriosDoTipo('relogio')) if (!livres.includes(a.id)) expect(alta(a.id), a.id).toBe(true);
    expect(degrau('relogio-digital')).toBe('incomum');
  });

  it('as pulseiras de ouro são raras ou épicas', () => {
    const deOuro = acessoriosDoTipo('pulseira').filter((a) => a.tipo === 'pulseira' && a.cor.toLowerCase() === '#e0ad3e');
    expect(deOuro.map((a) => a.id).sort()).toEqual(['pulseira-argolas', 'pulseira-corrente']);
    for (const a of deOuro) expect(alta(a.id), a.id).toBe(true);
  });
});

