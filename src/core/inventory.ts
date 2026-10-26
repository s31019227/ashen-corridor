import { EQUIPMENT } from '../config/equipment';
import { POTIONS } from '../config/potions';
import type { RunState } from './runState';
import { POTION_IDS, type PotionId } from './types';

export type ShopItem =
  | { kind: 'equipment'; id: string; price: number; nameKey: string }
  | { kind: 'potion'; id: string; potionId: PotionId; price: number; nameKey: string };

export type BuyResult = 'ok' | 'noGold' | 'owned' | 'full' | 'unknown';

export function resolveShopItem(itemId: string): ShopItem | null {
  if (itemId.startsWith('potion:')) {
    const potionId = itemId.slice('potion:'.length) as PotionId;
    if (!POTION_IDS.includes(potionId)) return null;
    const def = POTIONS[potionId];
    return { kind: 'potion', id: itemId, potionId, price: def.price, nameKey: def.nameKey };
  }
  const eq = EQUIPMENT[itemId];
  return eq ? { kind: 'equipment', id: itemId, price: eq.price, nameKey: eq.nameKey } : null;
}

export function isOwned(run: RunState, item: ShopItem): boolean {
  if (item.kind === 'potion') return run.potions.includes(item.potionId);
  return run.equipment[EQUIPMENT[item.id].slot] === item.id;
}

/** 購買：裝備直接裝上（替換舊裝備），藥水放入第一個空的藥水欄 */
export function buyItem(run: RunState, itemId: string): BuyResult {
  const item = resolveShopItem(itemId);
  if (!item) return 'unknown';
  if (isOwned(run, item)) return 'owned';
  if (run.gold < item.price) return 'noGold';
  if (item.kind === 'potion') {
    const slot = run.potions.indexOf(null);
    if (slot < 0) return 'full';
    run.potions[slot] = item.potionId;
  } else {
    run.equipment[EQUIPMENT[item.id].slot] = item.id;
  }
  run.gold -= item.price;
  return 'ok';
}
