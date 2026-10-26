import { CLASSES } from '../config/classes';
import type { Buff, BuffMods, PlayerEntity, Sim } from './types';

// 玩家的即時加成：技能 buff、被動。所有「實際數值」都經過這裡，畫面與模擬才會一致。

export function buffSum(p: PlayerEntity, key: keyof BuffMods): number {
  return p.buffs.reduce((sum, b) => sum + (b.mods[key] ?? 0), 0);
}

export function addBuff(p: PlayerEntity, id: string, duration: number, mods: BuffMods) {
  p.buffs = p.buffs.filter((b) => b.id !== id);
  p.buffs.push({ id, remaining: duration, duration, mods } satisfies Buff);
}

export function tickBuffs(p: PlayerEntity, dt: number) {
  for (const b of p.buffs) b.remaining -= dt;
  p.buffs = p.buffs.filter((b) => b.remaining > 0);
}

export function moveSpeed(p: PlayerEntity): number {
  return p.stats.moveSpeed * (1 + buffSum(p, 'moveSpeed') / 100);
}

export function attackRange(sim: Sim, p: PlayerEntity): number {
  const base = CLASSES[sim.run.players[p.id].classId].attackRange + p.stats.attackRange;
  return base * (1 + buffSum(p, 'attackRange') / 100);
}

export function attackInterval(sim: Sim, p: PlayerEntity): number {
  const bonus = p.stats.attackSpeed + buffSum(p, 'attackSpeed');
  return CLASSES[sim.run.players[p.id].classId].attackInterval / (1 + bonus / 100);
}

/**
 * 受到傷害的倍率（減傷後）。減傷用乘法疊加：30% 與 50% 疊起來是 1 − 0.7 × 0.5 = 65%，
 * 所以永遠不會到 100%。之後若有用加法疊加的減傷，另外加欄位處理。
 */
export function damageTakenMult(p: PlayerEntity): number {
  return p.buffs.reduce((mult, b) => mult * (1 - (b.mods.damageReduction ?? 0) / 100), 1);
}

/** 血量下限（數值），0 表示沒有 */
export function hpFloor(p: PlayerEntity): number {
  const pct = Math.max(0, ...p.buffs.map((b) => b.mods.hpFloor ?? 0));
  return (p.stats.maxHp * pct) / 100;
}

/**
 * 目前的攻擊力（面板攻擊力）：數值 × 被動加成。
 * 普攻與所有以攻擊力計算的技能都用這個，被動才會一起生效。
 */
export function attackPower(sim: Sim, p: PlayerEntity): number {
  return p.stats.atk * passiveAttackMult(sim, p);
}

/** 被動帶來的攻擊力倍率 */
export function passiveAttackMult(sim: Sim, p: PlayerEntity): number {
  const classId = sim.run.players[p.id].classId;
  const passive = CLASSES[classId].passive;
  if (classId === 'warrior') {
    // 嗜血：血量越低攻擊越高，線性增加，降到 threshold% 時達到 maxBonus%
    const { maxBonus, threshold } = passive.values;
    const ratio = p.hp / p.stats.maxHp;
    const t = Math.max(0, Math.min(1, (1 - ratio) / (1 - threshold / 100)));
    return 1 + (maxBonus * t) / 100;
  }
  return 1;
}
