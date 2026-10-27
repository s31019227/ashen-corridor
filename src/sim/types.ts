import type { TelegraphShape } from '../config/enemies';
import type { Cooldown } from '../core/cooldown';
import type { RunState } from '../core/runState';
import type { Dir, Stats } from '../core/types';

// 格子內的即時模擬狀態。全部是純資料，房主每幀模擬後整包傳給其他玩家。

/** 技能帶來的暫時加成（百分比） */
export interface BuffMods {
  moveSpeed?: number;
  attackSpeed?: number;
  /** 減傷（多個來源用乘法疊加） */
  damageReduction?: number;
  /** 普攻射程 */
  attackRange?: number;
  /** 血量鎖定在最大血量的 %（不會降低也不會回復），例如戰士大招 */
  hpLock?: number;
  /** buff 結束時回復全部血量 */
  restoreHpOnEnd?: boolean;
}

export interface Buff {
  /** 來源技能 id（同一技能重複施放會刷新） */
  id: string;
  remaining: number;
  duration: number;
  mods: BuffMods;
}

/** 護盾：先吸收傷害；時間到還有剩時，回復剩餘量的 healPct% 血量 */
export interface Shield {
  id: string;
  amount: number;
  remaining: number;
  healPct: number;
}

export interface PlayerEntity {
  id: string;
  x: number;
  y: number;
  /** 面向（單位向量） */
  fx: number;
  fy: number;
  hp: number;
  mp: number;
  /** 依職業、裝備、祭壇算好的數值（裝備變更時重算） */
  stats: Stats;
  dead: boolean;
  connected: boolean;
  /** 玩家點擊鎖定的敵人 */
  lockedId: number | null;
  /** 本幀選定的普攻目標 */
  targetId: number | null;
  lastAttackedId: number | null;
  attackCd: Cooldown;
  /** 0–2：小技能，3：大招 */
  skillCds: Cooldown[];
  /** 藥水欄冷卻（每格一個，換藥水不會重置） */
  potionCds: Cooldown[];
  invuln: number;
  /** 走進互動物件範圍時只觸發一次，離開後重新武裝 */
  interactArmed: boolean;
  buffs: Buff[];
  /** 開關型技能的狀態（key 為技能 id） */
  toggles: Record<string, boolean>;
  /** 開關型技能每秒結算用的計時 */
  toggleTick: number;
  /** 下一次普攻的強化（例如戰士重擊） */
  empower: { mult: number; lifesteal: number } | null;
  shields: Shield[];
}

export interface EnemyEntity {
  id: number;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  /** 技能傷害倍率（難度） */
  damageMult: number;
  alive: boolean;
  attackCd: Cooldown;
  skillCds: Cooldown[];
  /** 施放以自身為起點的技能時原地停留的剩餘秒數 */
  castLock: number;
  /** 擊退速度與剩餘時間 */
  kvx: number;
  kvy: number;
  kt: number;
  /** caster 側移方向 */
  strafe: number;
  /** 暈眩剩餘秒數：不能移動、攻擊、施法 */
  stun: number;
  /** 定身剩餘秒數：不能移動，但可以攻擊、施法 */
  root: number;
  /** 被嘲諷：強制攻擊這位玩家（沒有時間限制，對方倒下或離線時解除） */
  tauntId: string | null;
}

export interface ProjectileEntity {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  targetId: number;
  damage: number;
  knockback: number;
  crit: boolean;
  /** 命中時回復造成傷害的比例（%） */
  lifesteal: number;
  /** 命中時暈眩秒數 */
  stun?: number;
  /** 外觀：一般普攻或丟出的盾牌 */
  kind?: 'shield';
  color: number;
}

export interface TelegraphEntity {
  id: number;
  shape: TelegraphShape;
  x: number;
  y: number;
  /** circle：半徑；line：寬度 */
  size: number;
  /** line：長度 */
  length: number;
  /** line：方向（弧度） */
  angle: number;
  warnTime: number;
  elapsed: number;
  damage: number;
  /** 施放的怪物（反甲等反擊用） */
  ownerId?: number;
  /** 可以被反甲反彈 */
  reflectable?: boolean;
}

export interface World {
  roomId: number;
  players: Record<string, PlayerEntity>;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  telegraphs: TelegraphEntity[];
  nextId: number;
  /** 進入此格時的難度倍率 */
  difficulty: { hp: number; atk: number; gold: number };
  /** 本格結束（Boss 擊倒或全滅）後倒數，到 0 時進入結算 */
  ending: { victory: boolean; delay: number } | null;
}

/** 一次性事件：房主產生，隨快照送到每個玩家，用來顯示特效與訊息 */
export type GameEvent =
  | { k: 'dmg'; x: number; y: number; v: number; crit?: boolean; onPlayer?: string }
  | { k: 'heal'; pid: string; hp: number; mp: number }
  | { k: 'gold'; x: number; y: number; v: number }
  | { k: 'slash'; x: number; y: number; angle: number; r: number }
  | { k: 'boom'; tg: TelegraphEntity }
  | { k: 'kill'; id: number }
  | { k: 'toast'; pid: string; key: string; params?: Record<string, string | number>; color?: string }
  | { k: 'skill'; pid: string; skillIndex: number; implemented?: boolean }
  | { k: 'open'; pid: string; ui: 'shop' | 'altar'; cellId: number }
  | { k: 'room'; roomId: number; fromDir: Dir | null }
  | { k: 'cleared'; roomId: number }
  | { k: 'revive'; pid: string }
  | { k: 'levelup'; pid: string; level: number }
  | { k: 'aoe'; x: number; y: number; r: number; color: number }
  | { k: 'float'; x: number; y: number; key: string; color: string };

/** 玩家送給房主的動作 */
export type PlayerAction =
  | { k: 'skill'; i: number }
  | { k: 'learn'; i: number }
  | { k: 'potion'; i: number }
  | { k: 'lock'; id: number }
  | { k: 'unlock' }
  | { k: 'auto'; on: boolean }
  | { k: 'interact' }
  | { k: 'buy'; item: string }
  | { k: 'sell'; slot: string }
  | { k: 'carry'; potion: string }
  | { k: 'altar'; cellId: number };

/** 模擬時需要的全部狀態 */
export interface Sim {
  run: RunState;
  world: World;
  /** 每位玩家目前的移動輸入（-1~1） */
  moves: Record<string, { x: number; y: number }>;
  events: GameEvent[];
}
