import type { EquipSlot, Stats } from '../core/types';

// 裝備（白板）。stats 欄位保留，目前預設不生效（見 PLAYER_CONFIG.applyEquipmentStats）。

export interface EquipmentDef {
  id: string;
  slot: EquipSlot;
  nameKey: string;
  tier: number;
  price: number;
  stats: Partial<Stats>;
}

function eq(id: string, slot: EquipSlot, tier: number, price: number, stats: Partial<Stats>): EquipmentDef {
  return { id, slot, tier, price, stats, nameKey: `item.${id}` };
}

export const EQUIPMENT: Record<string, EquipmentDef> = {
  rusted_blade: eq('rusted_blade', 'weapon', 1, 40, { atk: 3 }),
  iron_cap: eq('iron_cap', 'helmet', 1, 30, { def: 1, maxHp: 10 }),
  padded_vest: eq('padded_vest', 'chest', 1, 45, { def: 2, maxHp: 15 }),
  cloth_leggings: eq('cloth_leggings', 'legs', 1, 30, { def: 1 }),
  worn_boots: eq('worn_boots', 'boots', 1, 30, { moveSpeed: 10 }),
  copper_ring: eq('copper_ring', 'ring', 1, 35, { maxMp: 10 }),

  tempered_blade: eq('tempered_blade', 'weapon', 2, 90, { atk: 7 }),
  ashen_helm: eq('ashen_helm', 'helmet', 2, 70, { def: 2, maxHp: 25 }),
  chain_hauberk: eq('chain_hauberk', 'chest', 2, 100, { def: 4, maxHp: 30 }),
  scaled_greaves: eq('scaled_greaves', 'legs', 2, 70, { def: 3 }),
  shadow_treads: eq('shadow_treads', 'boots', 2, 75, { moveSpeed: 25 }),
  ember_ring: eq('ember_ring', 'ring', 2, 85, { atk: 3, maxMp: 15 }),
};
