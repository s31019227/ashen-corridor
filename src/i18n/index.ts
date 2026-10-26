import { zhTW, type I18nKey } from './zh-TW';
import { en } from './en';

export type Locale = 'zh-TW' | 'en';

export const LOCALES: readonly Locale[] = ['zh-TW', 'en'];

/** 目前已完成翻譯、可選用的語言 */
export const AVAILABLE_LOCALES: readonly Locale[] = ['zh-TW'];

type Dict = Partial<Record<I18nKey, string>>;

const dictionaries: Record<Locale, Dict> = {
  'zh-TW': zhTW,
  en,
};

let current: Locale = 'zh-TW';

export function setLocale(locale: Locale) {
  current = AVAILABLE_LOCALES.includes(locale) ? locale : 'zh-TW';
}

export function getLocale(): Locale {
  return current;
}

/**
 * 取得翻譯文字。找不到或為空字串時退回中文，再找不到就回傳 key 本身。
 * 參數以 {name} 形式代入。設定檔中組出的動態 key 也走這裡，所以接受任意字串。
 */
export function t(key: I18nKey | (string & {}), params?: Record<string, string | number>): string {
  const k = key as I18nKey;
  let text = dictionaries[current][k] || zhTW[k] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/**
 * 翻譯連線事件帶來的訊息：參數值若本身是字典 key（例如物品名稱的 key），也一併翻譯。
 * 房主送的是 key 而不是文字，每個玩家才能用自己的語言顯示。
 */
export function tEvent(key: string, params?: Record<string, string | number>): string {
  if (!params) return t(key);
  const translated: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    translated[name] = typeof value === 'string' && value in zhTW ? t(value) : value;
  }
  return t(key, translated);
}
