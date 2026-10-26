import { PLAYER_CONFIG } from '../config/player';
import { generateFloor } from './mapGen';
import { computeStats } from './stats';
import { EQUIP_SLOTS, type ClassId, type EquipSlot, type FloorMap, type PotionId } from './types';

export const RUN_STATE_VERSION = 1;

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
  /** 5 格藥水欄 */
  potions: (PotionId | null)[];
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
    potions: [...PLAYER_CONFIG.startPotions],
    hp: stats.maxHp,
    mp: stats.maxMp,
    map,
    currentRoomId: map.startId,
  };
}

export function addGold(run: RunState, amount: number) {
  run.gold += amount;
  run.goldEarned += amount;
}
