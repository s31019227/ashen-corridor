import type { StatKey } from '../core/types';

// 等級系統（仿 LoL）：1–18 級，每升一級得到 1 個技能點。
// 小技能第 n 級需要角色等級 2n−1（第 5 級要 9 級）；大招在 6、11、16 級才能學 / 升級。

export const LEVEL_CONFIG = {
  maxLevel: 18,
  /** 第 i 項 = 從 (i+1) 級升到 (i+2) 級需要的經驗 */
  xpToNext: [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270],
  /** 大招各等級需要的角色等級 */
  ultimateLevels: [6, 11, 16],
  /** 每升一級，基礎數值（職業倍率後）提升的百分比 */
  growthPercent: { maxHp: 6, maxMp: 4, atk: 5 } as Partial<Record<StatKey, number>>,
  /** 每升一級直接增加的數值 */
  growthFlat: { def: 0.5 } as Partial<Record<StatKey, number>>,
};
