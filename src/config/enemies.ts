// 怪物數值（佔位）。技能以紅色預警區提示，預警結束時才判定傷害。

export type EnemyBehavior = 'chaser' | 'caster' | 'boss';

export type TelegraphShape = 'circle' | 'line';

export interface EnemySkillDef {
  id: string;
  shape: TelegraphShape;
  /** circle：半徑；line：寬度 */
  size: number;
  /** line：長度 */
  length?: number;
  /** 'target'：落在玩家當前位置；'self'：以自身為中心或起點 */
  origin: 'target' | 'self';
  /** 預警時間（秒） */
  warnTime: number;
  damage: number;
  /** 冷卻（秒） */
  cooldown: number;
  /** 施放距離上限（像素） */
  castRange: number;
  /** 可以被反甲反彈（預設只有普通攻擊會被反彈） */
  reflectable?: boolean;
}

export interface EnemyDef {
  id: string;
  nameKey: string;
  behavior: EnemyBehavior;
  maxHp: number;
  atk: number;
  def: number;
  moveSpeed: number;
  radius: number;
  color: number;
  /** 接觸攻擊間隔（秒） */
  attackInterval: number;
  /** 接觸攻擊距離（像素，邊緣到邊緣） */
  attackRange: number;
  /** caster：與玩家保持的距離 */
  preferredDistance?: number;
  skills: EnemySkillDef[];
  goldDrop: [number, number];
  /** 擊殺經驗（每位在線玩家都拿到） */
  xp: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  husk: {
    id: 'husk',
    nameKey: 'enemy.husk',
    behavior: 'chaser',
    maxHp: 40,
    atk: 9,
    def: 1,
    moveSpeed: 95,
    radius: 15,
    color: 0x7a3030,
    attackInterval: 1.0,
    attackRange: 6,
    skills: [],
    goldDrop: [4, 8],
    xp: 10,
  },
  ravager: {
    id: 'ravager',
    nameKey: 'enemy.ravager',
    behavior: 'chaser',
    maxHp: 70,
    atk: 13,
    def: 3,
    moveSpeed: 75,
    radius: 19,
    color: 0x8a4a2a,
    attackInterval: 1.4,
    attackRange: 6,
    skills: [
      { id: 'slam', shape: 'circle', size: 70, origin: 'self', warnTime: 1.0, damage: 18, cooldown: 6, castRange: 90 },
    ],
    goldDrop: [6, 12],
    xp: 18,
  },
  hexer: {
    id: 'hexer',
    nameKey: 'enemy.hexer',
    behavior: 'caster',
    maxHp: 32,
    atk: 6,
    def: 0,
    moveSpeed: 80,
    radius: 14,
    color: 0x6a2a6a,
    attackInterval: 1.2,
    attackRange: 6,
    preferredDistance: 240,
    skills: [
      { id: 'blight', shape: 'circle', size: 55, origin: 'target', warnTime: 1.1, damage: 14, cooldown: 3.5, castRange: 420 },
    ],
    goldDrop: [5, 10],
    xp: 14,
  },
  warden: {
    id: 'warden',
    nameKey: 'enemy.warden',
    behavior: 'boss',
    maxHp: 900,
    atk: 16,
    def: 4,
    moveSpeed: 70,
    radius: 38,
    color: 0x5a1a1a,
    attackInterval: 1.2,
    attackRange: 8,
    skills: [
      { id: 'quake', shape: 'circle', size: 150, origin: 'self', warnTime: 1.3, damage: 28, cooldown: 7, castRange: 220 },
      { id: 'rend', shape: 'line', size: 70, length: 520, origin: 'self', warnTime: 1.0, damage: 24, cooldown: 5, castRange: 600 },
      { id: 'ember', shape: 'circle', size: 80, origin: 'target', warnTime: 1.0, damage: 20, cooldown: 3, castRange: 800 },
    ],
    goldDrop: [120, 160],
    xp: 200,
  },
};

/** 小怪格隨機出現的怪物與權重 */
export const MOB_POOL: { id: string; weight: number }[] = [
  { id: 'husk', weight: 5 },
  { id: 'ravager', weight: 2 },
  { id: 'hexer', weight: 3 },
];

export const BOSS_ID = 'warden';
