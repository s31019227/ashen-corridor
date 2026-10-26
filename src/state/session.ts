import { loadSettings, saveSettings, type Settings } from '../save/storage';
import { setLocale } from '../i18n';

// 本機設定（語言、自動普攻偏好）。遊戲進度改由 net/ 的房主管理。

class Session {
  settings: Settings = loadSettings();

  constructor() {
    setLocale(this.settings.locale);
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    setLocale(this.settings.locale);
    saveSettings(this.settings);
  }
}

export const session = new Session();
