import type { RunState } from '../core/runState';
import { loadSettings, saveRun, saveSettings, type Settings } from '../save/storage';
import { setLocale } from '../i18n';

// 執行期的全域狀態：目前這一局與設定。

class Session {
  run: RunState | null = null;
  settings: Settings = loadSettings();
  /** 冷卻狀態（不存檔），換格時沿用 */
  cooldowns: Record<string, number> = {};

  constructor() {
    setLocale(this.settings.locale);
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    setLocale(this.settings.locale);
    saveSettings(this.settings);
  }

  save() {
    if (this.run) saveRun(this.run);
  }
}

export const session = new Session();
