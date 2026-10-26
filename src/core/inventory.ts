import { EQUIPMENT, canEquip } from '../config/equipment';
import { POTIONS } from '../config/potions';
import type { PlayerRun } from './runState';
import { POTION_IDS, type PotionId } from './types';

export type ShopItem =
  | { kind: 'equipment'; id: string; price: number; nameKey: string }
  | { kind: 'potion'; id: string; potionId: PotionId; price: number; nameKey: string };

export type BuyResult = 'ok' | 'noGold' | 'owned' | 'wrongClass' | 'unknown';

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

/** 裝備：目前已裝上；藥水：已解鎖 */
export function isOwned(run: PlayerRun, item: ShopItem): boolean {
  if (item.kind === 'potion') return run.unlockedPotions.includes(item.potionId);
  return run.equipment[EQUIPMENT[item.id].slot] === item.id;
}

export function isCarried(run: PlayerRun, potionId: PotionId): boolean {
  return run.potions.includes(potionId);
}

/** 把藥水放進藥水欄：有空格放空格，否則替換最後一格（目前只有一格） */
function putPotion(run: PlayerRun, potionId: PotionId) {
  const empty = run.potions.indexOf(null);
  run.potions[empty >= 0 ? empty : run.potions.length - 1] = potionId;
}

/**
 * 購買：裝備直接裝上（替換舊裝備）；藥水購買後解鎖並立即攜帶。
 * 武器限定職業，不符合時無法購買。
 */
export function buyItem(run: PlayerRun, itemId: string): BuyResult {
  const item = resolveShopItem(itemId);
  if (!item) return 'unknown';
  if (isOwned(run, item)) return 'owned';
  if (item.kind === 'equipment' && !canEquip(EQUIPMENT[item.id], run.classId)) return 'wrongClass';
  if (run.gold < item.price) return 'noGold';
  if (item.kind === 'potion') {
    run.unlockedPotions.push(item.potionId);
    putPotion(run, item.potionId);
  } else {
    run.equipment[EQUIPMENT[item.id].slot] = item.id;
  }
  run.gold -= item.price;
  return 'ok';
}

/** 在商店免費切換攜帶的藥水（必須已解鎖） */
export function carryPotion(run: PlayerRun, potionId: PotionId): boolean {
  if (!run.unlockedPotions.includes(potionId) || isCarried(run, potionId)) return false;
  putPotion(run, potionId);
  return true;
}
