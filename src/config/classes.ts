import type { AttackStyle, ClassId, Stats } from '../core/types';

// 職業設定。本階段技能效果為白板，只顯示名稱；名稱、冷卻、魔力消耗都在這裡調整。

export interface SkillDef {
  id: string;
  nameKey: string;
  descKey: string;
  /** 冷卻（秒） */
  cooldown: number;
  /** 魔力消耗 */
  mpCost: number;
}

export interface PassiveDef {
  id: string;
  nameKey: string;
  descKey: string;
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

function skill(classId: ClassId, id: string, cooldown: number, mpCost: number): SkillDef {
  return {
    id,
    nameKey: `skill.${classId}.${id}.name`,
    descKey: `skill.${classId}.${id}.desc`,
    cooldown,
    mpCost,
  };
}

function passive(classId: ClassId, id: string): PassiveDef {
  return { id, nameKey: `skill.${classId}.${id}.name`, descKey: `skill.${classId}.${id}.desc` };
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
    passive: passive('warrior', 'bloodlust'),
    skills: [skill('warrior', 'cleave', 6, 10), skill('warrior', 'charge', 10, 12), skill('warrior', 'warcry', 15, 15)],
    ultimate: skill('warrior', 'ragestorm', 60, 40),
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
    ultimate: skill('knight', 'fortress', 70, 40),
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
    ultimate: skill('ranger', 'arrowrain', 60, 40),
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
    ultimate: skill('assassin', 'deathmark', 60, 40),
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
    ultimate: skill('priest', 'sanctuary', 75, 50),
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
    ultimate: skill('mage', 'meteor', 70, 50),
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
    ultimate: skill('warlock', 'doom', 70, 50),
  },
};
