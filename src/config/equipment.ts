import type { ArmorType, ClassId, EquipSlot, Stats } from '../core/types';

// 裝備設定。
// - 武器限定職業（classes），其他職業無法購買。
// - 防具分三種類型：重甲（防禦、血量）、輕甲（爆擊、攻速、移速）、布甲（魔力、回魔、冷卻縮減），任何職業都能穿。
// - 戒指不分職業。

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

// ── 防具：類型 × 部位，第 2 階數值為第 1 階的兩倍 ──
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
const ARMOR_SET_NAME: Record<ArmorType, [string, string]> = {
  heavy: ['ironguard', 'blacksteel'],
  light: ['leather', 'shadowstalker'],
  cloth: ['linen', 'arcanist'],
};

for (const type of ['heavy', 'light', 'cloth'] as ArmorType[]) {
  for (const slot of ['helmet', 'chest', 'legs', 'boots'] as const) {
    for (const tier of [1, 2]) {
      const base = ARMOR_BASE[type][slot];
      const stats = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v! * tier])) as Partial<Stats>;
      const id = `${ARMOR_SET_NAME[type][tier - 1]}_${slot}`;
      defs.push({
        id,
        slot,
        tier,
        armorType: type,
        price: Math.round(ARMOR_PRICE[slot] * (tier === 1 ? 1 : 2.2)),
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

export const EQUIPMENT: Record<string, EquipmentDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

/** 職業是否能使用此裝備 */
export function canEquip(def: EquipmentDef, classId: ClassId): boolean {
  return !def.classes || def.classes.includes(classId);
}
