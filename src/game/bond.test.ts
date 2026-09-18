import { describe, expect, it } from 'vitest';
import { CHARACTER_PRESETS, findCharacter } from '../../shared/styles';
import { FALA_SLOTS } from '../audio/voice';
import {
  BOND_MAX,
  BOND_POINTS,
  HEARTS,
  HEART_COST,
  allBondEmotes,
  bondLevel,
  bondVoiceSlots,
  emotesUnlockedAt,
  heartsOf,
  rewardAt,
  rewardsOf,
  skinsUnlockedAt,
  unlockedRewards,
  voiceUnlockedAt,
} from './bond';

const marina = findCharacter('marina');

describe('barra de vínculo', () => {
  it('começa vazia', () => {
    const lv = bondLevel(0);
    expect(lv.hearts).toBe(0);
    expect(lv.intoHeart).toBe(0);
    expect(lv.progress).toBe(0);
    expect(lv.toNext).toBe(HEART_COST[0]);
    expect(lv.max).toBe(false);
  });

  it('o coração fecha ao completar o custo dele', () => {
    expect(heartsOf(HEART_COST[0] - 1)).toBe(0);
    expect(heartsOf(HEART_COST[0])).toBe(1);
    expect(heartsOf(HEART_COST[0] + HEART_COST[1])).toBe(2);
  });

  it('o progresso é do coração em andamento', () => {
    const lv = bondLevel(HEART_COST[0] + HEART_COST[1] / 2);
    expect(lv.hearts).toBe(1);
    expect(lv.intoHeart).toBe(HEART_COST[1] / 2);
    expect(lv.heartCost).toBe(HEART_COST[1]);
    expect(lv.progress).toBeCloseTo(0.5);
    expect(lv.toNext).toBe(HEART_COST[1] / 2);
  });

  it('para nos cinco corações', () => {
    const lv = bondLevel(BOND_MAX + 5000);
    expect(lv.hearts).toBe(HEARTS);
    expect(lv.max).toBe(true);
    expect(lv.progress).toBe(1);
    expect(lv.toNext).toBe(0);
  });

  it('pontos negativos ou quebrados não quebram a conta', () => {
    expect(bondLevel(-50).hearts).toBe(0);
    expect(bondLevel(-50).points).toBe(0);
    expect(bondLevel(HEART_COST[0] + 0.9).hearts).toBe(1);
  });

  it('ganhar rende mais que perder, e perder mais que desistir', () => {
    expect(BOND_POINTS.bigWin).toBeGreaterThan(BOND_POINTS.win);
    expect(BOND_POINTS.win).toBeGreaterThan(BOND_POINTS.loss);
    expect(BOND_POINTS.loss).toBeGreaterThan(BOND_POINTS.fold);
    expect(BOND_POINTS.matchWin).toBeGreaterThan(BOND_POINTS.match);
  });
});

describe('recompensas de vínculo', () => {
  it('todo personagem tem uma recompensa por coração, com id próprio', () => {
    for (const c of CHARACTER_PRESETS) {
      const rewards = rewardsOf(c);
      expect(rewards.map((r) => r.heart), c.id).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(rewards.map((r) => r.id)).size, c.id).toBe(HEARTS);
      for (const r of rewards) {
        expect(r.id, c.id).toBe(`${c.id}:${r.heart}`);
        expect(r.char).toBe(c.id);
        expect(r.name, r.id).toBeTruthy();
        expect(r.description, r.id).toBeTruthy();
        expect(r.icon, r.id).toBeTruthy();
      }
    }
  });

  it('a descrição fala do personagem', () => {
    expect(rewardAt(marina, 1)!.description).toContain('Marina');
    expect(rewardAt(findCharacter('ren'), 1)!.description).toContain('Ren');
    expect(rewardAt(marina, 9)).toBeNull();
  });

  it('as vozes prometidas existem entre as falas do personagem', () => {
    for (const c of CHARACTER_PRESETS) {
      for (const r of rewardsOf(c)) {
        if (r.voice) expect(FALA_SLOTS, r.id).toContain(r.voice);
      }
    }
    expect(bondVoiceSlots().length).toBeGreaterThan(0);
    for (const slot of bondVoiceSlots()) expect(FALA_SLOTS).toContain(slot);
  });

  it('as recompensas chegam na ordem dos corações', () => {
    expect(unlockedRewards(marina, 0)).toEqual([]);
    expect(unlockedRewards(marina, HEART_COST[0]).map((r) => r.heart)).toEqual([1]);
    expect(unlockedRewards(marina, BOND_MAX).map((r) => r.heart)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a voz só toca depois do coração que a libera', () => {
    const voice = rewardsOf(marina).find((r) => r.voice)!;
    const cost = HEART_COST.slice(0, voice.heart).reduce((t, c) => t + c, 0);
    expect(voiceUnlockedAt(marina, cost - 1, voice.voice!)).toBe(false);
    expect(voiceUnlockedAt(marina, cost, voice.voice!)).toBe(true);
  });

  it('recompensa "em breve" fecha o coração mas não libera nada', () => {
    const soon = rewardsOf(marina).filter((r) => r.soon);
    expect(soon.length).toBeGreaterThan(0);
    // com o vínculo completo, nada do que ainda não existe aparece como liberado
    const emotes = emotesUnlockedAt(marina, BOND_MAX);
    const skins = skinsUnlockedAt(marina, BOND_MAX).map((s) => s.id);
    for (const r of soon) {
      for (const e of r.emotes ?? []) expect(emotes, r.id).not.toContain(e);
      if (r.skin) expect(skins, r.id).not.toContain(r.skin.id);
      if (r.voice) expect(voiceUnlockedAt(marina, BOND_MAX, r.voice), r.id).toBe(false);
    }
    // os emotes de vínculo declarados ficam fora da lista comum até o coração fechar
    for (const e of allBondEmotes()) expect(emotesUnlockedAt(marina, 0)).not.toContain(e);
  });
});
