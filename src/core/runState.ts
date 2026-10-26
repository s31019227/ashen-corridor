import { PLAYER_CONFIG } from '../config/player';
import { generateFloor } from './mapGen';
import { computeStats } from './stats';
import { EQUIP_SLOTS, type ClassId, type EquipSlot, type FloorMap, type PotionId } from './types';

export const RUN_STATE_VERSION = 3;

/** 一局遊戲的狀態，也是存檔內容 */
export interface RunState {
  version: number;
  classId: ClassId;
  floor: number;
  seed: number;
  gold: number;
  /** 本局累計擊殺數 */
  kills: number;
  /** 本局累計獲得金幣（結算用） */
  goldEarned: number;
  equipment: Record<EquipSlot, string | null>;
  /** 藥水欄（格數見 PLAYER_CONFIG.potionSlots），開局為空 */
  potions: (PotionId | null)[];
  /** 已解鎖（買過）的藥水，在商店可免費切換攜帶 */
  unlockedPotions: PotionId[];
  /** 已接受的祭壇契約 id */
  altarEffects: string[];
  hp: number;
  mp: number;
  map: FloorMap;
  currentRoomId: number;
}

export function emptyEquipment(): Record<EquipSlot, string | null> {
  return Object.fromEntries(EQUIP_SLOTS.map((s) => [s, null])) as Record<EquipSlot, string | null>;
}

export function createRun(classId: ClassId, seed: number): RunState {
  const equipment = emptyEquipment();
  const stats = computeStats(classId, equipment);
  const floor = 1;
  const map = generateFloor({ floor, seed });
  return {
    version: RUN_STATE_VERSION,
    classId,
    floor,
    seed,
    gold: PLAYER_CONFIG.startGold,
    kills: 0,
    goldEarned: 0,
    equipment,
    potions: Array(PLAYER_CONFIG.potionSlots).fill(null),
    unlockedPotions: [],
    altarEffects: [],
    hp: stats.maxHp,
    mp: stats.maxMp,
    map,
    currentRoomId: map.startId,
  };
}

/**
 * 讀檔時把舊版本存檔轉成目前格式，無法轉換時回傳 null（主選單就不會出現「繼續」）。
 * v3 重做了裝備與商店，舊存檔的裝備 id 已不存在，因此 v1、v2 存檔直接作廢。
 */
export function migrateRun(data: RunState): RunState | null {
  return data.version === RUN_STATE_VERSION ? data : null;
}

export function addGold(run: RunState, amount: number) {
  run.gold += amount;
  run.goldEarned += amount;
}
