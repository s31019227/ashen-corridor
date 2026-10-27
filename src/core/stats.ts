import { getAltarEffect } from '../config/altar';
import { CLASSES } from '../config/classes';
import { EQUIPMENT } from '../config/equipment';
import { LEVEL_CONFIG } from '../config/leveling';
import { PLAYER_BASE_STATS, PLAYER_CONFIG } from '../config/player';
import type { ClassId, EquipSlot, Stats, StatKey } from './types';

export const STAT_KEYS: StatKey[] = [
  'maxHp',
  'maxMp',
  'atk',
  'def',
  'moveSpeed',
  'attackSpeed',
  'attackRange',
  'critChance',
  'mpRegen',
  'cooldownReduction',
];

/** 數值下限：maxHp 等基本屬性至少 1，其餘至少 0 */
const MIN_ONE: StatKey[] = ['maxHp', 'maxMp', 'atk', 'moveSpeed'];

/**
 * 計算角色最終數值：
 * 基礎 × 職業倍率 × 等級成長 → + 裝備 → + 祭壇固定值 → × 祭壇百分比
 */
export function computeStats(
  classId: ClassId,
  equipment: Record<EquipSlot, string | null>,
  altarEffectIds: readonly string[] = [],
  level = 1,
): Stats {
  const mult = CLASSES[classId].statMultipliers;
  const growth = CLASSES[classId].growth;
  const stats = { ...PLAYER_BASE_STATS };
  for (const k of STAT_KEYS) {
    const pct = growth?.percent?.[k] ?? LEVEL_CONFIG.growthPercent[k] ?? 0;
    const flat = growth?.flat?.[k] ?? LEVEL_CONFIG.growthFlat[k] ?? 0;
    stats[k] = PLAYER_BASE_STATS[k] * (mult[k] ?? 1) * (1 + (pct * (level - 1)) / 100) + flat * (level - 1);
  }
  if (PLAYER_CONFIG.applyEquipmentStats) {
    for (const itemId of Object.values(equipment)) {
      const item = itemId ? EQUIPMENT[itemId] : undefined;
      if (!item) continue;
      for (const k of STAT_KEYS) stats[k] += item.stats[k] ?? 0;
    }
  }

  const percent: Partial<Record<StatKey, number>> = {};
  for (const id of altarEffectIds) {
    const effect = getAltarEffect(id);
    if (!effect) continue;
    for (const k of STAT_KEYS) {
      stats[k] += effect.flat?.[k] ?? 0;
      percent[k] = (percent[k] ?? 0) + (effect.percent?.[k] ?? 0);
    }
  }
  for (const k of STAT_KEYS) {
    // mpRegen 允許小數，其餘取整
    const v = stats[k] * (1 + (percent[k] ?? 0) / 100);
    stats[k] = k === 'mpRegen' ? Math.round(v * 10) / 10 : Math.round(v);
    stats[k] = Math.max(MIN_ONE.includes(k) ? 1 : 0, stats[k]);
  }
  stats.cooldownReduction = Math.min(stats.cooldownReduction, PLAYER_CONFIG.maxCooldownReduction);
  return stats;
}

/** 兩組屬性加成的差值（b − a），只回傳不為 0 的項目 */
export function statDiff(a: Partial<Stats>, b: Partial<Stats>): Partial<Record<StatKey, number>> {
  const diff: Partial<Record<StatKey, number>> = {};
  for (const k of STAT_KEYS) {
    const d = (b[k] ?? 0) - (a[k] ?? 0);
    if (d !== 0) diff[k] = d;
  }
  return diff;
}
