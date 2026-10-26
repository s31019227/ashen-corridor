// 共用型別。core/ 內的檔案不依賴 Phaser，之後可以搬到多人伺服器共用。

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export const DIR_DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const OPPOSITE_DIR: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export type RoomType =
  | 'start' // 起始基礎商店
  | 'shop'
  | 'mob'
  | 'boss'
  | 'altar'
  | 'treasure'
  | 'rest'
  | 'empty';

export type SpecialRoomType = 'altar' | 'treasure' | 'rest';

export interface MapCell {
  id: number;
  x: number;
  y: number;
  type: RoomType;
  /** 小怪 / Boss 已清空，或特殊格已使用 */
  cleared: boolean;
  visited: boolean;
  /** 商店格的商品清單（商品 id） */
  shopStock?: string[];
  /** 祭壇格的契約效果 id */
  altarEffect?: string;
}

export interface FloorMap {
  floor: number;
  width: number;
  height: number;
  cells: MapCell[];
  startId: number;
  bossId: number;
}

export type ClassId = 'warrior' | 'knight' | 'ranger' | 'assassin' | 'priest' | 'mage' | 'warlock';

export const CLASS_IDS: readonly ClassId[] = [
  'warrior',
  'knight',
  'ranger',
  'assassin',
  'priest',
  'mage',
  'warlock',
];

/** melee：近戰；ranged：遠程投射物；hybrid：近距離近戰、遠距離投擲 */
export type AttackStyle = 'melee' | 'ranged' | 'hybrid';

export type EquipSlot = 'weapon' | 'helmet' | 'chest' | 'legs' | 'boots' | 'ring';

/** 防具類型：重甲（坦）、輕甲（敏捷）、布甲（法系） */
export type ArmorType = 'heavy' | 'light' | 'cloth';

export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring'];

export type PotionId = 'hp' | 'mp' | 'hpMajor' | 'mpMajor' | 'balanced';

export const POTION_IDS: readonly PotionId[] = ['hp', 'mp', 'hpMajor', 'mpMajor', 'balanced'];

export interface Stats {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  moveSpeed: number;
  /** 攻擊速度加成（%），普攻間隔 ÷ (1 + 值/100) */
  attackSpeed: number;
  /** 普攻射程加成（像素） */
  attackRange: number;
  /** 爆擊率（%） */
  critChance: number;
  /** 每秒魔力回復（最大魔力的 %） */
  mpRegen: number;
  /** 技能冷卻縮減（%） */
  cooldownReduction: number;
}

export type StatKey = keyof Stats;

export interface Vec2 {
  x: number;
  y: number;
}
