import { CLASSES } from '../config/classes';
import { LEVEL_CONFIG } from '../config/leveling';
import type { PlayerRun } from './runState';

/** 可用的技能點 = 等級 − 已學的技能等級總和 */
export function skillPoints(p: PlayerRun): number {
  return p.level - p.skillRanks.reduce((a, b) => a + b, 0);
}

/** 學習 / 升級第 i 個技能（0–2 小技能，3 大招）需要的角色等級 */
export function levelRequired(index: number, nextRank: number): number {
  if (index === 3) return LEVEL_CONFIG.ultimateLevels[nextRank - 1] ?? Infinity;
  return nextRank * 2 - 1;
}

export function canLearn(p: PlayerRun, index: number): boolean {
  const def = CLASSES[p.classId];
  const skill = index < 3 ? def.skills[index] : def.ultimate;
  const rank = p.skillRanks[index] ?? 0;
  if (!skill || rank >= skill.maxRank || skillPoints(p) <= 0) return false;
  return p.level >= levelRequired(index, rank + 1);
}

export function learnSkill(p: PlayerRun, index: number): boolean {
  if (!canLearn(p, index)) return false;
  p.skillRanks[index]++;
  return true;
}

export function xpForNext(level: number): number {
  return LEVEL_CONFIG.xpToNext[level - 1] ?? Infinity;
}

/** 增加經驗，回傳升了幾級 */
export function addXp(p: PlayerRun, amount: number): number {
  if (p.level >= LEVEL_CONFIG.maxLevel) return 0;
  p.xp += amount;
  let gained = 0;
  while (p.level < LEVEL_CONFIG.maxLevel && p.xp >= xpForNext(p.level)) {
    p.xp -= xpForNext(p.level);
    p.level++;
    gained++;
  }
  if (p.level >= LEVEL_CONFIG.maxLevel) p.xp = 0;
  return gained;
}
