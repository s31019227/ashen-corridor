import type { PotionId } from '../core/types';

export interface PotionDef {
  id: PotionId;
  nameKey: string;
  /** 按鈕上的簡稱 */
  shortKey: string;
  /** 回復最大血量的百分比 */
  hpPercent: number;
  /** 回復最大魔力的百分比 */
  mpPercent: number;
  /** 冷卻（秒）。藥水欄共用冷卻，換藥水不會重置 */
  cooldown: number;
  price: number;
  color: number;
}

export const POTIONS: Record<PotionId, PotionDef> = {
  hp: { id: 'hp', nameKey: 'potion.hp', shortKey: 'potion.hp.short', hpPercent: 40, mpPercent: 0, cooldown: 30, price: 30, color: 0xb03030 },
  mp: { id: 'mp', nameKey: 'potion.mp', shortKey: 'potion.mp.short', hpPercent: 0, mpPercent: 40, cooldown: 30, price: 30, color: 0x3050b0 },
  hpMajor: { id: 'hpMajor', nameKey: 'potion.hpMajor', shortKey: 'potion.hpMajor.short', hpPercent: 30, mpPercent: 10, cooldown: 30, price: 40, color: 0x903050 },
  mpMajor: { id: 'mpMajor', nameKey: 'potion.mpMajor', shortKey: 'potion.mpMajor.short', hpPercent: 10, mpPercent: 30, cooldown: 30, price: 40, color: 0x503090 },
  balanced: { id: 'balanced', nameKey: 'potion.balanced', shortKey: 'potion.balanced.short', hpPercent: 20, mpPercent: 20, cooldown: 30, price: 50, color: 0x704080 },
};
