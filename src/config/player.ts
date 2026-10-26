import type { Stats } from '../core/types';

// 玩家基礎數值（佔位）。職業數值以此為基礎再乘上 classes.ts 的倍率。
export const PLAYER_BASE_STATS: Stats = {
  maxHp: 100,
  maxMp: 60,
  atk: 12,
  def: 3,
  moveSpeed: 220,
};

export const PLAYER_CONFIG = {
  radius: 16,
  startGold: 120,
  /** 一局開始時藥水欄的初始內容 */
  startPotions: ['hp', null, null, null, null] as const,
  /** 裝備屬性目前不生效；之後要啟用時改為 true 即可 */
  applyEquipmentStats: false,
};
