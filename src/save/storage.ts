import { migrateRun, type RunState } from '../core/runState';
import { GAME_CONFIG } from '../config/game';
import type { Locale } from '../i18n';

// localStorage 存檔。資料帶 version，格式改變時在 core/runState.ts 的 migrateRun() 中轉換。
// 多人時只有房主存檔；加入的人重新連進同一個房間就會接回自己的角色。
// 局外成長之後另開一個 key（例如 'ashen.meta'），不和單局存檔混在一起。

const RUN_KEY = 'ashen.run';
const SETTINGS_KEY = 'ashen.settings';
const ROOM_CODE_KEY = 'ashen.roomCode';
const NAME_KEY = 'ashen.name';
const CID_KEY = 'ashen.cid';

export interface Settings {
  autoAttack: boolean;
  locale: Locale;
}

export interface SavedGame {
  run: RunState;
  /** 是否為多人房間（接續時會用同一個房間代碼重新開房） */
  multiplayer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoAttack: GAME_CONFIG.combat.autoAttackDefault,
  locale: 'zh-TW',
};

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 私密模式或空間不足時忽略，遊戲仍可進行
  }
}

export function loadGame(): SavedGame | null {
  const data = read<SavedGame>(localStorage, RUN_KEY);
  if (!data?.run) return null;
  const run = migrateRun(data.run);
  return run ? { ...data, run } : null;
}

export function saveGame(game: SavedGame) {
  write(localStorage, RUN_KEY, game);
}

export function clearGame() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // ignore
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(localStorage, SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings: Settings) {
  write(localStorage, SETTINGS_KEY, settings);
}

export function loadRoomCode(): string | null {
  return read<string>(localStorage, ROOM_CODE_KEY);
}

export function saveRoomCode(code: string) {
  write(localStorage, ROOM_CODE_KEY, code);
}

export function loadName(): string | null {
  return read<string>(localStorage, NAME_KEY);
}

export function saveName(name: string) {
  write(localStorage, NAME_KEY, name);
}

/** 玩家身分代碼：每個分頁一組（sessionStorage），重新整理後不變，斷線重連時用來認回角色 */
export function loadClientId(): string {
  let id = read<string>(sessionStorage, CID_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    write(sessionStorage, CID_KEY, id);
  }
  return id;
}
