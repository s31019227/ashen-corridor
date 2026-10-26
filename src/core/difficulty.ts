import { DIFFICULTY_CONFIG } from '../config/difficulty';
import type { FloorMap } from './types';

/** 目前難度等級：已探索（visited）格數 − 1。重複進入已探索的格子不會增加 */
export function difficultyLevel(map: FloorMap): number {
  return Math.max(0, map.cells.filter((c) => c.visited).length - 1);
}

export interface DifficultyScale {
  hp: number;
  atk: number;
  gold: number;
}

export function difficultyScale(level: number): DifficultyScale {
  const c = DIFFICULTY_CONFIG;
  return {
    hp: 1 + (c.hpPerLevel * level) / 100,
    atk: 1 + (c.atkPerLevel * level) / 100,
    gold: 1 + (c.goldPerLevel * level) / 100,
  };
}
