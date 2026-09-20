import { beforeEach, describe, expect, it } from 'vitest';
import { BOND_MAX, BOND_POINTS, EMPTY_BOND, HEART_COST, rewardAt } from '../game/bond';
import { findCharacter } from '../../shared/styles';
import { bondOf, useBond, voiceUnlocked } from './bond';

const marina = findCharacter('marina');
const bond = () => useBond.getState();
const stats = (points: number) => ({ ...EMPTY_BOND, points });

/**
 * Numa sessão com servidor, o vínculo mostrado (e o que ele libera) é o do servidor — mexer no
 * que está salvo no navegador não muda nada. Offline, vale o progresso local.
 */
describe('vínculo: quem manda é o servidor', () => {
  beforeEach(() => {
    bond().reset();
  });

  it('a foto do servidor substitui o progresso local enquanto a sessão dura', () => {
    // alguém "editou" o armazenamento local para ter o vínculo cheio
    useBond.setState({ chars: { marina: stats(BOND_MAX) } });
    expect(bondOf('marina').points).toBe(BOND_MAX);

    bond().applyServer({ marina: stats(20) });
    expect(bondOf('marina').points).toBe(20);
    // e o que o servidor não conhece, a conta não tem
    expect(bondOf('ren').points).toBe(0);

    // ao sair do servidor, o progresso local volta a ser o que aparece
    bond().clearServer();
    expect(bondOf('marina').points).toBe(BOND_MAX);
  });

  it('as recompensas seguem o servidor, não o que está salvo aqui', () => {
    const voice = rewardAt(marina, 1)!.voice!;
    useBond.setState({ chars: { marina: stats(BOND_MAX) } });
    expect(voiceUnlocked('marina', voice)).toBe(true); // offline, o local vale

    bond().applyServer({ marina: stats(0) });
    expect(voiceUnlocked('marina', voice)).toBe(false); // online, o servidor diz que não

    bond().applyServer({ marina: stats(HEART_COST[0]) });
    expect(voiceUnlocked('marina', voice)).toBe(true);
  });

  it('com servidor na linha, o cliente não pontua sozinho', () => {
    bond().applyServer({ marina: stats(10) });
    bond().award('marina', 'bigWin');
    expect(bondOf('marina').points).toBe(10);
    // nem o progresso local é mexido por baixo
    expect(useBond.getState().chars.marina).toBeUndefined();
  });

  it('o anúncio do coração compara com a foto anterior do servidor', () => {
    bond().applyServer({ marina: stats(HEART_COST[0] - 10) });
    expect(bond().pending).toHaveLength(0); // a primeira foto não anuncia nada

    bond().applyServer({ marina: stats(HEART_COST[0]) });
    expect(bond().pending.map((u) => [u.char, u.heart])).toEqual([['marina', 1]]);
    // e o ganho da sessão é a diferença entre as fotos
    expect(bond().gain.marina).toBe(10);
  });

  it('offline continua sendo do cliente', () => {
    bond().award('marina', 'win');
    expect(bondOf('marina').points).toBe(BOND_POINTS.win);
    expect(useBond.getState().chars.marina.points).toBe(BOND_POINTS.win);
  });
});
