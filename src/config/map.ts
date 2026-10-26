import type { SpecialRoomType } from '../core/types';

export const MAP_CONFIG = {
  gridWidth: 7,
  gridHeight: 7,
  /** 每層總格數 */
  totalCells: 25,
  /** 各類格子數量；商店數量包含起始商店，剩下的格子為空白 */
  counts: {
    mob: 10,
    boss: 1,
    shop: 3,
    special: 3,
  },
  /** 「其他」格子的種類，依序填入（數量不足時循環使用） */
  specialTypes: ['altar', 'treasure', 'rest'] as SpecialRoomType[],
  /** Boss 與起點的最少步數，不滿足就重新生成 */
  minBossDistance: 4,
  maxGenAttempts: 100,
};

export const ROOM_EVENT_CONFIG = {
  altar: {
    /** 祭壇使用費用 */
    cost: 30,
    /** 隨機回復最大血量或魔力的百分比 */
    restorePercent: 60,
  },
  treasure: {
    goldMin: 30,
    goldMax: 70,
  },
  rest: {
    hpPercent: 50,
    mpPercent: 50,
  },
  mob: {
    enemyCountMin: 3,
    enemyCountMax: 5,
  },
};
