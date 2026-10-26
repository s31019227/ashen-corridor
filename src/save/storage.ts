import { RUN_STATE_VERSION, type RunState } from '../core/runState';
import { GAME_CONFIG } from '../config/game';
import type { Locale } from '../i18n';

// localStorage 存檔。資料帶 version，格式改變時可在 migrate() 中轉換。
// 局外成長之後另開一個 key（例如 'ashen.meta'），不和單局存檔混在一起。

const RUN_KEY = 'ashen.run';
const SETTINGS_KEY = 'ashen.settings';

export interface Settings {
  autoAttack: boolean;
  locale: Locale;
}

export const DEFAULT_SETTINGS: Settings = {
  autoAttack: GAME_CONFIG.combat.autoAttackDefault,
  locale: 'zh-TW',
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 私密模式或空間不足時忽略，遊戲仍可進行
  }
}

function migrate(data: RunState): RunState | null {
  if (data.version === RUN_STATE_VERSION) return data;
  return null;
}

export function loadRun(): RunState | null {
  const data = read<RunState>(RUN_KEY);
  return data ? migrate(data) : null;
}

export function saveRun(run: RunState) {
  write(RUN_KEY, run);
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // ignore
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings: Settings) {
  write(SETTINGS_KEY, settings);
}
