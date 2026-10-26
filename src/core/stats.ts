import { CLASSES } from '../config/classes';
import { EQUIPMENT } from '../config/equipment';
import { PLAYER_BASE_STATS, PLAYER_CONFIG } from '../config/player';
import type { ClassId, EquipSlot, Stats, StatKey } from './types';

const STAT_KEYS: StatKey[] = ['maxHp', 'maxMp', 'atk', 'def', 'moveSpeed'];

/** 計算角色最終數值：基礎 × 職業倍率（+ 裝備，目前預設關閉） */
export function computeStats(classId: ClassId, equipment: Record<EquipSlot, string | null>): Stats {
  const mult = CLASSES[classId].statMultipliers;
  const stats = { ...PLAYER_BASE_STATS };
  for (const k of STAT_KEYS) {
    stats[k] = Math.round(PLAYER_BASE_STATS[k] * (mult[k] ?? 1));
  }
  if (PLAYER_CONFIG.applyEquipmentStats) {
    for (const itemId of Object.values(equipment)) {
      const item = itemId ? EQUIPMENT[itemId] : undefined;
      if (!item) continue;
      for (const k of STAT_KEYS) stats[k] += item.stats[k] ?? 0;
    }
  }
  return stats;
}
