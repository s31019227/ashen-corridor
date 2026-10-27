import { PLAYER_CONFIG } from '../config/player';
import { generateFloor } from './mapGen';
import { computeStats } from './stats';
import { EQUIP_SLOTS, type ClassId, type EquipSlot, type FloorMap, type PotionId } from './types';

export const RUN_STATE_VERSION = 5;

/** 每位玩家自己的進度（裝備、金幣、藥水等都是各自的） */
export interface PlayerRun {
  id: string;
  name: string;
  classId: ClassId;
  /** 多人時用來區分玩家的顏色 */
  color: number;
  gold: number;
  /** 本局累計獲得金幣（結算用） */
  goldEarned: number;
  /** 自己最後一擊的擊殺數 */
  kills: number;
  equipment: Record<EquipSlot, string | null>;
  /** 藥水欄（格數見 PLAYER_CONFIG.potionSlots），開局為空 */
  potions: (PotionId | null)[];
  /** 已解鎖（買過）的藥水，在商店可免費切換攜帶 */
  unlockedPotions: PotionId[];
  /** 已接受的祭壇契約 id */
  altarEffects: string[];
  /** 自己已使用過的特殊格（寶箱、休息點、祭壇），每人各用一次 */
  usedCells: number[];
  autoAttack: boolean;
  hp: number;
  mp: number;
  level: number;
  /** 目前等級累積的經驗 */
  xp: number;
  /** 四個技能（3 小技能 + 大招）的等級，0 = 尚未學習 */
  skillRanks: number[];
}

/** 一局遊戲的狀態，也是存檔內容（由房主保存） */
export interface RunState {
  version: number;
  floor: number;
  seed: number;
  map: FloorMap;
  currentRoomId: number;
  /** 全隊擊殺數 */
  kills: number;
  players: Record<string, PlayerRun>;
  /** 房主的玩家 id（接續存檔時用來認回自己） */
  hostId: string;
  /** 本層各玩家造成的傷害與戰鬥時間（DPS 表用） */
  floorDamage: Record<string, number>;
  floorCombatTime: number;
}

export interface NewPlayer {
  id: string;
  name: string;
  classId: ClassId;
  color: number;
  autoAttack: boolean;
}

export function emptyEquipment(): Record<EquipSlot, string | null> {
  return Object.fromEntries(EQUIP_SLOTS.map((s) => [s, null])) as Record<EquipSlot, string | null>;
}

export function createPlayerRun(p: NewPlayer): PlayerRun {
  const equipment = emptyEquipment();
  const stats = computeStats(p.classId, equipment);
  return {
    ...p,
    gold: PLAYER_CONFIG.startGold,
    goldEarned: 0,
    kills: 0,
    equipment,
    potions: Array(PLAYER_CONFIG.potionSlots).fill(null),
    unlockedPotions: [],
    altarEffects: [],
    usedCells: [],
    hp: stats.maxHp,
    mp: stats.maxMp,
    level: 1,
    xp: 0,
    skillRanks: [0, 0, 0, 0],
  };
}

export function createRun(players: NewPlayer[], seed: number, hostId: string): RunState {
  const floor = 1;
  const map = generateFloor({ floor, seed });
  return {
    version: RUN_STATE_VERSION,
    floor,
    seed,
    map,
    currentRoomId: map.startId,
    kills: 0,
    players: Object.fromEntries(players.map((p) => [p.id, createPlayerRun(p)])),
    hostId,
    floorDamage: {},
    floorCombatTime: 0,
  };
}

/**
 * 讀檔時把舊版本存檔轉成目前格式，無法轉換時回傳 null（主選單就不會出現「繼續」）。
 * v4 → v5：加入等級與技能等級。v4 之前的單人格式直接作廢。
 */
export function migrateRun(data: RunState): RunState | null {
  if (data.version === 4) {
    for (const p of Object.values(data.players)) Object.assign(p, { level: 1, xp: 0, skillRanks: [0, 0, 0, 0] });
    data.version = RUN_STATE_VERSION;
  }
  if (data.version !== RUN_STATE_VERSION) return null;
  // 舊存檔沒有 DPS 統計，補上預設值
  data.floorDamage ??= {};
  data.floorCombatTime ??= 0;
  return data;
}

export function addGold(p: PlayerRun, amount: number) {
  p.gold += amount;
  p.goldEarned += amount;
}

export function playerStats(p: PlayerRun) {
  return computeStats(p.classId, p.equipment, p.altarEffects, p.level);
}
