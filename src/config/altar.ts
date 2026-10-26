import type { StatKey } from '../core/types';

// 祭壇契約：每個祭壇固定一種效果（地圖生成時決定），先告訴玩家內容，由玩家決定是否接受。
// 效果持續到本局結束。percent 以百分比加減，flat 直接加減數值。

export interface AltarEffectDef {
  id: string;
  nameKey: string;
  /** 接受契約需要支付的金幣，0 表示免費 */
  goldCost: number;
  percent?: Partial<Record<StatKey, number>>;
  flat?: Partial<Record<StatKey, number>>;
}

export const ALTAR_EFFECTS: AltarEffectDef[] = [
  { id: 'bloodpact', nameKey: 'altar.effect.bloodpact', goldCost: 0, percent: { atk: 20, maxHp: -15 } },
  { id: 'ironoath', nameKey: 'altar.effect.ironoath', goldCost: 0, flat: { def: 3 }, percent: { moveSpeed: -10 } },
  { id: 'galemark', nameKey: 'altar.effect.galemark', goldCost: 0, percent: { moveSpeed: 15 }, flat: { def: -2 } },
  { id: 'manawell', nameKey: 'altar.effect.manawell', goldCost: 0, percent: { maxMp: 30, atk: -10 } },
  { id: 'goldoffering', nameKey: 'altar.effect.goldoffering', goldCost: 50, percent: { maxHp: 15 } },
];

export function getAltarEffect(id: string | undefined): AltarEffectDef | undefined {
  return ALTAR_EFFECTS.find((e) => e.id === id);
}
