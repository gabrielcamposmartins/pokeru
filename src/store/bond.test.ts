import { beforeEach, describe, expect, it } from 'vitest';
import { BOND_POINTS, HEARTS, HEART_COST, rewardAt } from '../game/bond';
import { findCharacter } from '../../shared/styles';
import { bondOf, unlockReward, useBond, voiceUnlocked } from './bond';

const MARINA = 'marina';
const marina = findCharacter(MARINA);
const bond = () => useBond.getState();

/** Enche o vínculo até fechar `hearts` corações (só com mãos ganhas). */
function farm(hearts: number): void {
  const need = HEART_COST.slice(0, hearts).reduce((t, c) => t + c, 0);
  for (let p = 0; p < need; p += BOND_POINTS.win) bond().award(MARINA, 'win');
}

describe('vínculo salvo', () => {
  beforeEach(() => {
    bond().reset();
  });

  it('cada momento rende pontos e conta na ficha do personagem', () => {
    bond().award(MARINA, 'win');
    bond().award(MARINA, 'loss');
    bond().award(MARINA, 'fold');
    bond().award(MARINA, 'match');
    const st = bondOf(MARINA);
    expect(st.points).toBe(BOND_POINTS.win + BOND_POINTS.loss + BOND_POINTS.fold + BOND_POINTS.match);
    expect(st.wins).toBe(1);
    expect(st.losses).toBe(1);
    expect(st.folds).toBe(1);
    expect(st.hands).toBe(3); // a partida não é uma mão
    expect(st.matches).toBe(1);
  });

  it('o vínculo é de cada personagem', () => {
    bond().award(MARINA, 'win');
    bond().award('ren', 'fold');
    expect(bondOf(MARINA).points).toBe(BOND_POINTS.win);
    expect(bondOf('ren').points).toBe(BOND_POINTS.fold);
    expect(bondOf('tobi').points).toBe(0);
  });

  it('o coração completo entra na fila do anúncio, com a recompensa dele', () => {
    expect(bond().pending).toEqual([]);
    farm(1);
    expect(bond().pending).toHaveLength(1);
    const u = bond().pending[0];
    expect(u.char).toBe(MARINA);
    expect(u.heart).toBe(1);
    expect(unlockReward(u)).toEqual(rewardAt(marina, 1));
    bond().ack();
    expect(bond().pending).toEqual([]);
  });

  it('a voz da recompensa passa a tocar (e só a do personagem certo)', () => {
    const reward = rewardAt(marina, 1)!;
    expect(reward.voice).toBeTruthy();
    expect(voiceUnlocked(MARINA, reward.voice!)).toBe(false);
    farm(1);
    expect(voiceUnlocked(MARINA, reward.voice!)).toBe(true);
    expect(voiceUnlocked('ren', reward.voice!)).toBe(false);
  });

  it('o ganho da partida é somado à parte e zerado na partida nova', () => {
    bond().award(MARINA, 'win');
    bond().award(MARINA, 'bigWin');
    expect(bond().gain[MARINA]).toBe(BOND_POINTS.win + BOND_POINTS.bigWin);
    bond().clearGain();
    expect(bond().gain[MARINA]).toBeUndefined();
    // zerar o ganho não mexe no vínculo
    expect(bondOf(MARINA).points).toBe(BOND_POINTS.win + BOND_POINTS.bigWin);
  });

  it('o vínculo para nos cinco corações', () => {
    farm(HEARTS + 1);
    expect(bond().pending.map((u) => u.heart)).toEqual([1, 2, 3, 4, 5]);
    // continuar jogando ainda soma pontos, mas não há mais coração para fechar
    const before = bondOf(MARINA).points;
    bond().award(MARINA, 'win');
    expect(bondOf(MARINA).points).toBe(before + BOND_POINTS.win);
    expect(bond().pending).toHaveLength(HEARTS);
  });
});
