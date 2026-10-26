import type { AttackStyle, ClassId, Stats } from '../core/types';

// 職業設定。技能的名稱、冷卻、魔力消耗與各等級數值都在這裡調整；效果在 systems/SkillSystem.ts。
// 技能等級：小技能最高 5 級、大招最高 3 級（升級規則見 config/leveling.ts）。
// 陣列型的數值依技能等級取值，長度不足時沿用最後一個值。

export interface SkillDef {
  id: string;
  nameKey: string;
  descKey: string;
  /** active：施放型；toggle：開關型（再按一次關閉） */
  kind: 'active' | 'toggle';
  maxRank: number;
  /** 各等級冷卻（秒） */
  cooldown: number[];
  /** 各等級魔力消耗 */
  mpCost: number[];
  /** 各等級效果數值，給技能效果與說明文字使用（說明文字以 {名稱} 代入） */
  values: Record<string, number[]>;
}

export interface PassiveDef {
  id: string;
  nameKey: string;
  descKey: string;
  values: Record<string, number>;
}

export interface ClassDef {
  id: ClassId;
  nameKey: string;
  roleKey: string;
  attackStyle: AttackStyle;
  /** 普攻射程（像素，從角色邊緣到敵人邊緣） */
  attackRange: number;
  /** hybrid 職業：此距離內使用近戰，超過則投擲 */
  meleeRange?: number;
  /** 普攻間隔（秒） */
  attackInterval: number;
  /** 普攻擊退距離（像素），0 表示不擊退 */
  attackKnockback: number;
  /** 近戰普攻傷害倍率（預設 1） */
  meleeDamageMult?: number;
  /** 遠程普攻（投射物）傷害倍率（預設 1） */
  rangedDamageMult?: number;
  /** 以 PLAYER_BASE_STATS 為基礎的倍率 */
  statMultipliers: Partial<Record<keyof Stats, number>>;
  color: number;
  passive: PassiveDef;
  /** 3 個小技能 */
  skills: [SkillDef, SkillDef, SkillDef];
  ultimate: SkillDef;
}

/** 依技能等級取值（等級從 1 開始） */
export function rankValue(values: number[] | undefined, rank: number): number {
  if (!values || values.length === 0) return 0;
  return values[Math.max(0, Math.min(rank, values.length) - 1)];
}

const keys = (classId: ClassId, id: string) => ({
  id,
  nameKey: `skill.${classId}.${id}.name`,
  descKey: `skill.${classId}.${id}.desc`,
});

/** 尚未實作效果的技能（白板） */
function skill(classId: ClassId, id: string, cooldown: number, mpCost: number): SkillDef {
  return { ...keys(classId, id), kind: 'active', maxRank: 5, cooldown: [cooldown], mpCost: [mpCost], values: {} };
}

function ult(classId: ClassId, id: string, cooldown: number, mpCost: number): SkillDef {
  return { ...skill(classId, id, cooldown, mpCost), maxRank: 3 };
}

function passive(classId: ClassId, id: string, values: Record<string, number> = {}): PassiveDef {
  return { id, nameKey: `skill.${classId}.${id}.name`, descKey: `skill.${classId}.${id}.desc`, values };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    nameKey: 'class.warrior.name',
    roleKey: 'class.warrior.role',
    attackStyle: 'melee',
    attackRange: 34,
    attackInterval: 0.8,
    attackKnockback: 0,
    statMultipliers: { maxHp: 1.2, atk: 1.2, def: 1.0, moveSpeed: 1.0 },
    color: 0xb05a3c,
    // 被動：血量越低攻擊越高，線性增加，血量降到 threshold% 時達到 maxBonus%
    passive: passive('warrior', 'bloodlust', { maxBonus: 100, threshold: 30 }),
    skills: [
      {
        ...keys('warrior', 'heavystrike'),
        kind: 'active',
        maxRank: 5,
        cooldown: [5, 4, 3, 2, 1],
        mpCost: [5],
        values: { mult: [2], lifesteal: [50] },
      },
      {
        ...keys('warrior', 'sacrifice'),
        kind: 'toggle',
        maxRank: 5,
        cooldown: [0],
        mpCost: [0],
        // 每 interval 秒結算一次：每秒燒 selfDamage 血；每跳造成攻擊力 ratio% 傷害（不吃被動，所以倍率較高）
        values: { selfDamage: [1], interval: [0.5], range: [35, 42, 49, 56, 63], ratio: [100, 120, 140, 160, 180] },
      },
      {
        ...keys('warrior', 'charge'),
        kind: 'active',
        maxRank: 5,
        cooldown: [15],
        mpCost: [10],
        // 每級效果 +3%
        values: { bonus: [30, 33, 36, 39, 42], duration: [5] },
      },
    ],
    ultimate: {
      ...keys('warrior', 'rage'),
      kind: 'active',
      maxRank: 3,
      // 每級冷卻 −5 秒
      cooldown: [60, 55, 50],
      mpCost: [30],
      values: { hpFloor: [30], range: [100], bonus: [50], duration: [15] },
    },
  },
  knight: {
    id: 'knight',
    nameKey: 'class.knight.name',
    roleKey: 'class.knight.role',
    attackStyle: 'melee',
    attackRange: 30,
    attackInterval: 1.0,
    attackKnockback: 20,
    statMultipliers: { maxHp: 1.5, atk: 0.85, def: 2.0, moveSpeed: 0.9 },
    color: 0x8a8f9e,
    passive: passive('knight', 'bulwark'),
    skills: [skill('knight', 'shieldbash', 7, 10), skill('knight', 'taunt', 12, 8), skill('knight', 'guard', 14, 15)],
    ultimate: ult('knight', 'fortress', 70, 40),
  },
  ranger: {
    id: 'ranger',
    nameKey: 'class.ranger.name',
    roleKey: 'class.ranger.role',
    attackStyle: 'ranged',
    attackRange: 320,
    attackInterval: 0.7,
    attackKnockback: 0,
    statMultipliers: { maxHp: 0.9, atk: 1.1, def: 0.8, moveSpeed: 1.1 },
    color: 0x5f8a4a,
    passive: passive('ranger', 'keeneye'),
    skills: [skill('ranger', 'multishot', 6, 10), skill('ranger', 'roll', 8, 6), skill('ranger', 'snare', 12, 12)],
    ultimate: ult('ranger', 'arrowrain', 60, 40),
  },
  assassin: {
    id: 'assassin',
    nameKey: 'class.assassin.name',
    roleKey: 'class.assassin.role',
    attackStyle: 'hybrid',
    attackRange: 220,
    meleeRange: 40,
    attackInterval: 0.55,
    attackKnockback: 0,
    meleeDamageMult: 1.3,
    rangedDamageMult: 0.9,
    statMultipliers: { maxHp: 0.85, atk: 1.15, def: 0.8, moveSpeed: 1.2 },
    color: 0x6a4a7a,
    passive: passive('assassin', 'backstab'),
    skills: [skill('assassin', 'fanknives', 6, 10), skill('assassin', 'shadowstep', 9, 12), skill('assassin', 'poison', 12, 10)],
    ultimate: ult('assassin', 'deathmark', 60, 40),
  },
  priest: {
    id: 'priest',
    nameKey: 'class.priest.name',
    roleKey: 'class.priest.role',
    attackStyle: 'ranged',
    attackRange: 260,
    attackInterval: 1.0,
    attackKnockback: 60,
    statMultipliers: { maxHp: 1.0, maxMp: 1.3, atk: 0.8, def: 1.0, moveSpeed: 1.0 },
    color: 0xd8c890,
    passive: passive('priest', 'grace'),
    skills: [skill('priest', 'heal', 8, 15), skill('priest', 'repel', 10, 12), skill('priest', 'blessing', 15, 18)],
    ultimate: ult('priest', 'sanctuary', 75, 50),
  },
  mage: {
    id: 'mage',
    nameKey: 'class.mage.name',
    roleKey: 'class.mage.role',
    attackStyle: 'ranged',
    attackRange: 300,
    attackInterval: 0.9,
    attackKnockback: 0,
    statMultipliers: { maxHp: 0.8, maxMp: 1.5, atk: 1.3, def: 0.7, moveSpeed: 1.0 },
    color: 0x4a6ab0,
    passive: passive('mage', 'arcaneflow'),
    skills: [skill('mage', 'firebolt', 5, 12), skill('mage', 'frostnova', 10, 15), skill('mage', 'ignite', 12, 15)],
    ultimate: ult('mage', 'meteor', 70, 50),
  },
  warlock: {
    id: 'warlock',
    nameKey: 'class.warlock.name',
    roleKey: 'class.warlock.role',
    attackStyle: 'ranged',
    attackRange: 280,
    attackInterval: 0.9,
    attackKnockback: 0,
    statMultipliers: { maxHp: 0.9, maxMp: 1.4, atk: 1.15, def: 0.8, moveSpeed: 1.0 },
    color: 0x5a8a70,
    passive: passive('warlock', 'corruption'),
    skills: [skill('warlock', 'hex', 6, 10), skill('warlock', 'weaken', 10, 12), skill('warlock', 'plague', 12, 15)],
    ultimate: ult('warlock', 'doom', 70, 50),
  },
};
