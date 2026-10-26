import type { Stats } from '../core/types';

// 玩家基礎數值（佔位）。職業數值以此為基礎再乘上 classes.ts 的倍率。
export const PLAYER_BASE_STATS: Stats = {
  maxHp: 100,
  maxMp: 60,
  atk: 12,
  def: 3,
  moveSpeed: 220,
  attackSpeed: 0,
  attackRange: 0,
  critChance: 5,
  mpRegen: 1,
  cooldownReduction: 0,
};

export const PLAYER_CONFIG = {
  radius: 16,
  startGold: 150,
  /** 藥水欄格數：一次只能帶一種藥水。開局沒有藥水，購買後解鎖，之後在商店可免費切換已解鎖的藥水 */
  potionSlots: 1,
  /** 裝備屬性是否生效 */
  applyEquipmentStats: true,
  /** 爆擊傷害倍率 */
  critMultiplier: 1.5,
  /** 技能冷卻縮減上限（%） */
  maxCooldownReduction: 40,
};
