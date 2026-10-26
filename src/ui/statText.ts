import type { AltarEffectDef } from '../config/altar';
import { STAT_KEYS } from '../core/stats';
import type { StatKey } from '../core/types';
import { t } from '../i18n';

/** 各屬性的單位 */
const STAT_UNIT: Partial<Record<StatKey, string>> = {
  attackSpeed: '%',
  critChance: '%',
  mpRegen: '%/s',
  cooldownReduction: '%',
};

const sign = (v: number) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);

/** 屬性數值加上單位，例：「15%」 */
export function formatStatValue(key: StatKey, value: number): string {
  return `${value}${STAT_UNIT[key] ?? ''}`;
}

/**
 * 屬性加成文字，例：「攻擊 +3、爆擊率 +2%」；沒有任何數值時回傳 fallback。
 * asPercent：全部視為百分比加成（祭壇的百分比效果）。
 */
export function formatStats(stats: Partial<Record<StatKey, number>>, fallback = '', asPercent = false): string {
  const parts = STAT_KEYS.filter((k) => stats[k]).map(
    (k) => `${t(`stat.${k}`)} ${sign(stats[k]!)}${asPercent ? '%' : (STAT_UNIT[k] ?? '')}`,
  );
  return parts.length > 0 ? parts.join('、') : fallback;
}

/** 祭壇契約的效果文字，例：「攻擊 +20%、最大血量 −15%」 */
export function formatAltarEffect(effect: AltarEffectDef): string {
  const parts = [formatStats(effect.flat ?? {}), formatStats(effect.percent ?? {}, '', true)].filter(Boolean);
  return parts.join('、');
}
