import { CLASSES } from '../config/classes';
import type { Buff, BuffMods, PlayerEntity, Sim } from './types';
import { rankValue } from '../config/classes';
import { addHealThreat } from './threat';

// 玩家的即時加成：技能 buff、被動。所有「實際數值」都經過這裡，畫面與模擬才會一致。

type NumericMod = Exclude<keyof BuffMods, 'restoreHpOnEnd'>;

export function buffSum(p: PlayerEntity, key: NumericMod): number {
  return p.buffs.reduce((sum, b) => sum + (b.mods[key] ?? 0), 0);
}

export function addBuff(p: PlayerEntity, id: string, duration: number, mods: BuffMods) {
  p.buffs = p.buffs.filter((b) => b.id !== id);
  p.buffs.push({ id, remaining: duration, duration, mods } satisfies Buff);
}

/** 推進 buff 與護盾的時間；結束時的效果（回滿血、剩餘護盾轉成治療）在這裡處理 */
export function tickPlayerTimers(sim: Sim, p: PlayerEntity, dt: number) {
  for (const b of p.buffs) b.remaining -= dt;
  const ended = p.buffs.filter((b) => b.remaining <= 0);
  p.buffs = p.buffs.filter((b) => b.remaining > 0);
  for (const b of ended) {
    if (b.mods.restoreHpOnEnd && !p.dead) heal(sim, p, p.stats.maxHp - p.hp);
  }

  for (const sh of p.shields) sh.remaining -= dt;
  const expired = p.shields.filter((sh) => sh.remaining <= 0);
  p.shields = p.shields.filter((sh) => sh.remaining > 0 && sh.amount > 0);
  for (const sh of expired) {
    if (sh.amount > 0 && sh.healPct > 0 && !p.dead) heal(sim, p, (sh.amount * sh.healPct) / 100);
  }
}

/**
 * 回復血量（血量鎖定中不會回復），並送出治療事件。
 * 實際回復量會產生仇恨，算在 sourceId（預設是被治療的人）身上。
 */
export function heal(sim: Sim, p: PlayerEntity, amount: number, sourceId = p.id) {
  if (hpLock(p) !== null || amount <= 0) return;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  const gained = Math.round(p.hp - before);
  if (gained <= 0) return;
  sim.events.push({ k: 'heal', pid: p.id, hp: gained, mp: 0 });
  addHealThreat(sim, sourceId, gained);
}

export function addShield(p: PlayerEntity, id: string, amount: number, duration: number, healPct = 0) {
  p.shields = p.shields.filter((sh) => sh.id !== id);
  p.shields.push({ id, amount, remaining: duration, healPct });
}

export function shieldTotal(p: PlayerEntity): number {
  return p.shields.reduce((sum, sh) => sum + sh.amount, 0);
}

/** 用護盾吸收傷害，回傳吸收後剩下的傷害 */
export function absorbWithShields(p: PlayerEntity, amount: number): number {
  for (const sh of p.shields) {
    const used = Math.min(sh.amount, amount);
    sh.amount -= used;
    amount -= used;
    if (amount <= 0) break;
  }
  p.shields = p.shields.filter((sh) => sh.amount > 0);
  return amount;
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
export function damageTakenMult(p: PlayerEntity, sim?: Sim): number {
  const fromBuffs = p.buffs.reduce((mult, b) => mult * (1 - (b.mods.damageReduction ?? 0) / 100), 1);
  // 騎士被動：常駐減傷
  const classId = sim?.run.players[p.id]?.classId;
  const passiveDr = classId === 'knight' ? CLASSES.knight.passive.values.damageReduction : 0;
  return fromBuffs * (1 - passiveDr / 100);
}

/** 血量鎖定值（數值），沒有鎖定時回傳 null */
export function hpLock(p: PlayerEntity): number | null {
  const b = p.buffs.find((buff) => buff.mods.hpLock);
  return b ? (p.stats.maxHp * b.mods.hpLock!) / 100 : null;
}

/** 已學習的被動型技能的等級（例如騎士反甲），沒學回傳 0 */
export function passiveSkillRank(sim: Sim, p: PlayerEntity, skillId: string): { rank: number; values: Record<string, number> } {
  const pr = sim.run.players[p.id];
  const def = CLASSES[pr.classId];
  const index = [...def.skills, def.ultimate].findIndex((s) => s.id === skillId);
  if (index < 0) return { rank: 0, values: {} };
  const skill = index < 3 ? def.skills[index] : def.ultimate;
  const rank = pr.skillRanks[index] ?? 0;
  const values = Object.fromEntries(Object.entries(skill.values).map(([k, v]) => [k, rankValue(v, rank)]));
  return { rank, values };
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
