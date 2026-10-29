import type { ArmorType, ClassId, EquipSlot, Stats } from '../core/types';

// 裝備設定。
// - 武器限定職業（classes），其他職業無法購買。
// - 防具分三種類型：重甲（防禦、血量）、輕甲（爆擊、攻速、移速）、布甲（魔力、回魔、冷卻縮減），任何職業都能穿。
// - 戒指不分職業。
// - 階級（tier）就是稀有度：1 普通、2 精良、3 稀有。商店依難度抽稀有度（src/config/shop.ts）。

export interface EquipmentDef {
  id: string;
  slot: EquipSlot;
  nameKey: string;
  tier: number;
  price: number;
  stats: Partial<Stats>;
  /** 限定職業（只有武器會設定） */
  classes?: ClassId[];
  armorType?: ArmorType;
}

const defs: EquipmentDef[] = [];

function weapon(id: string, classId: ClassId, tier: number, price: number, stats: Partial<Stats>) {
  defs.push({ id, slot: 'weapon', tier, price, stats, classes: [classId], nameKey: `item.${id}` });
}

function ring(id: string, tier: number, price: number, stats: Partial<Stats>) {
  defs.push({ id, slot: 'ring', tier, price, stats, nameKey: `item.${id}` });
}

// ── 武器 ──
weapon('iron_greatsword', 'warrior', 1, 45, { atk: 4, critChance: 3 });
weapon('bloodletter_axe', 'warrior', 2, 100, { atk: 9, critChance: 6 });
weapon('guard_mace', 'knight', 1, 45, { atk: 3, def: 1 });
weapon('oathkeeper', 'knight', 2, 100, { atk: 6, def: 3, maxHp: 15 });
weapon('hunting_bow', 'ranger', 1, 45, { atk: 3, attackRange: 30 });
weapon('gale_longbow', 'ranger', 2, 100, { atk: 7, attackRange: 50, attackSpeed: 10 });
weapon('twin_daggers', 'assassin', 1, 45, { atk: 3, attackSpeed: 10 });
weapon('venom_fang', 'assassin', 2, 100, { atk: 7, critChance: 8, attackSpeed: 10 });
weapon('acolyte_staff', 'priest', 1, 45, { atk: 2, maxMp: 10, mpRegen: 0.5 });
weapon('dawn_scepter', 'priest', 2, 100, { atk: 5, maxMp: 20, mpRegen: 1 });
weapon('ember_wand', 'mage', 1, 45, { atk: 4, maxMp: 10 });
weapon('astral_staff', 'mage', 2, 100, { atk: 9, maxMp: 20, cooldownReduction: 8 });
weapon('hex_tome', 'warlock', 1, 45, { atk: 3, cooldownReduction: 5 });
weapon('void_grimoire', 'warlock', 2, 100, { atk: 8, mpRegen: 1, cooldownReduction: 8 });
weapon('worldsplitter', 'warrior', 3, 190, { atk: 15, critChance: 10, maxHp: 15 });
weapon('aegis_of_dawn', 'knight', 3, 190, { atk: 10, def: 5, maxHp: 30 });
weapon('starfall_bow', 'ranger', 3, 190, { atk: 12, attackRange: 70, attackSpeed: 15, critChance: 5 });
weapon('nightshade_blades', 'assassin', 3, 190, { atk: 12, critChance: 14, attackSpeed: 15 });
weapon('saints_reliquary', 'priest', 3, 190, { atk: 9, maxMp: 35, mpRegen: 1.5, cooldownReduction: 6 });
weapon('cataclysm_rod', 'mage', 3, 190, { atk: 15, maxMp: 30, cooldownReduction: 12 });
weapon('abyssal_codex', 'warlock', 3, 190, { atk: 13, maxMp: 15, mpRegen: 1.5, cooldownReduction: 12 });

// ── 防具：類型 × 部位，第 n 階數值為第 1 階的 n 倍 ──
const ARMOR_BASE: Record<ArmorType, Record<'helmet' | 'chest' | 'legs' | 'boots', Partial<Stats>>> = {
  heavy: {
    helmet: { def: 1, maxHp: 10 },
    chest: { def: 3, maxHp: 20 },
    legs: { def: 2, maxHp: 10 },
    boots: { def: 1, maxHp: 5 },
  },
  light: {
    helmet: { critChance: 2, maxHp: 5 },
    chest: { attackSpeed: 6, def: 1 },
    legs: { critChance: 2, moveSpeed: 8 },
    boots: { moveSpeed: 15 },
  },
  cloth: {
    helmet: { maxMp: 10, cooldownReduction: 2 },
    chest: { maxMp: 15, mpRegen: 0.5 },
    legs: { maxMp: 10, cooldownReduction: 2 },
    boots: { moveSpeed: 10, maxMp: 5 },
  },
};
const ARMOR_PRICE = { helmet: 30, chest: 45, legs: 35, boots: 30 };
const ARMOR_PRICE_MULT = [1, 2.2, 3.8];
const ARMOR_SET_NAME: Record<ArmorType, [string, string, string]> = {
  heavy: ['ironguard', 'blacksteel', 'dreadplate'],
  light: ['leather', 'shadowstalker', 'nightwalker'],
  cloth: ['linen', 'arcanist', 'voidweave'],
};

for (const type of ['heavy', 'light', 'cloth'] as ArmorType[]) {
  for (const slot of ['helmet', 'chest', 'legs', 'boots'] as const) {
    for (const tier of [1, 2, 3]) {
      const base = ARMOR_BASE[type][slot];
      const stats = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v! * tier])) as Partial<Stats>;
      const id = `${ARMOR_SET_NAME[type][tier - 1]}_${slot}`;
      defs.push({
        id,
        slot,
        tier,
        armorType: type,
        price: Math.round(ARMOR_PRICE[slot] * ARMOR_PRICE_MULT[tier - 1]),
        stats,
        nameKey: `item.${id}`,
      });
    }
  }
}

// ── 戒指 ──
ring('copper_ring', 1, 35, { maxMp: 10 });
ring('garnet_ring', 1, 35, { maxHp: 15 });
ring('ember_ring', 2, 85, { atk: 3, critChance: 3 });
ring('sage_ring', 2, 85, { cooldownReduction: 6, mpRegen: 0.5 });
ring('swift_ring', 2, 85, { attackSpeed: 10, moveSpeed: 10 });
ring('bloodstone_ring', 3, 160, { atk: 5, critChance: 5, maxHp: 20 });
ring('archmage_ring', 3, 160, { cooldownReduction: 10, mpRegen: 1, maxMp: 15 });
ring('phantom_ring', 3, 160, { attackSpeed: 15, moveSpeed: 15, critChance: 3 });

/** 稀有度（= 階級）的名稱 key 與顏色 */
export const RARITY = {
  1: { nameKey: 'rarity.1', color: '#c8c4bc' },
  2: { nameKey: 'rarity.2', color: '#6fa8ff' },
  3: { nameKey: 'rarity.3', color: '#c07bff' },
} as Record<number, { nameKey: string; color: string }>;

export const MAX_TIER = 3;

export const EQUIPMENT: Record<string, EquipmentDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

/** 職業是否能使用此裝備 */
export function canEquip(def: EquipmentDef, classId: ClassId): boolean {
  return !def.classes || def.classes.includes(classId);
}
