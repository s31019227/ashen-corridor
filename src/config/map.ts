import type { SpecialRoomType } from '../core/types';

export const MAP_CONFIG = {
  /** 總層數：打倒最後一層的 Boss 才算通關，其他層的 Boss 打完進入下一層（每層用同一套地圖規則） */
  floorCount: 2,
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
