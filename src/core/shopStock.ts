import { EQUIPMENT, MAX_TIER } from '../config/equipment';
import { SHOP_CONFIG, potionItemId } from '../config/shop';
import type { Rng } from './rng';
import { POTION_IDS } from './types';

/** 起始商店：只有普通裝備 */
export function rollStartStock(rng: Rng): string[] {
  const cfg = SHOP_CONFIG.start;
  const equipment = rng.shuffle(Object.values(EQUIPMENT).filter((e) => e.tier <= cfg.maxTier).map((e) => e.id));
  return [...equipment.slice(0, cfg.equipmentCount), ...rollPotions(rng, cfg.potionCount)];
}

/** 一般商店的裝備數量：每 extraEquipmentEvery 難度多 1 件 */
export function shopEquipmentCount(difficulty: number): number {
  const cfg = SHOP_CONFIG.general;
  return cfg.equipmentCount + Math.floor(difficulty / cfg.extraEquipmentEvery);
}

/** 某難度下 普通 / 精良 / 稀有 的權重（設定點之間線性內插） */
export function rarityWeights(difficulty: number): number[] {
  const points = SHOP_CONFIG.general.rarityWeights;
  if (difficulty <= points[0].difficulty) return [...points[0].weights];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (difficulty <= b.difficulty) {
      const f = (difficulty - a.difficulty) / (b.difficulty - a.difficulty);
      return a.weights.map((w, k) => w + (b.weights[k] - w) * f);
    }
  }
  return [...points[points.length - 1].weights];
}

/**
 * 一般商店：先放 minCommon 件普通裝備，其餘每件依難度權重抽稀有度。
 * 同一間商店不會有重複的裝備；某稀有度抽完時改抽其他稀有度。
 */
export function rollGeneralStock(rng: Rng, difficulty: number): string[] {
  const cfg = SHOP_CONFIG.general;
  const pools: string[][] = [];
  for (let tier = 1; tier <= MAX_TIER; tier++) {
    pools[tier] = rng.shuffle(Object.values(EQUIPMENT).filter((e) => e.tier === tier).map((e) => e.id));
  }
  const count = shopEquipmentCount(difficulty);
  const weights = rarityWeights(difficulty);
  const picked: string[] = [];
  const take = (tier: number) => {
    const pool = pools[tier];
    if (pool.length > 0) return pool.pop()!;
    // 這個稀有度抽完了：找還有剩的
    for (let t = 1; t <= MAX_TIER; t++) if (pools[t].length > 0) return pools[t].pop()!;
    return null;
  };
  for (let i = 0; i < count; i++) {
    const tier =
      i < cfg.minCommon ? 1 : rng.weighted(weights.map((weight, k) => ({ tier: k + 1, weight }))).tier;
    const id = take(tier);
    if (id) picked.push(id);
  }
  return [...picked, ...rollPotions(rng, cfg.potionCount)];
}

function rollPotions(rng: Rng, count: number): string[] {
  return rng.shuffle([...POTION_IDS]).slice(0, count).map(potionItemId);
}
