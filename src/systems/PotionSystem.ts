import { POTIONS } from '../config/potions';
import { THEME } from '../config/theme';
import type { RunState } from '../core/runState';
import type { Player } from '../entities/Player';
import { t } from '../i18n';
import { floatText } from '../ui/text';
import type Phaser from 'phaser';

/** 使用藥水欄第 slot 格的藥水。無限使用，藥水欄共用冷卻。 */
export function usePotion(
  scene: Phaser.Scene,
  run: RunState,
  player: Player,
  slot: number,
  toast: (msg: string, color?: string) => void,
): boolean {
  const potionId = run.potions[slot];
  if (!potionId) {
    toast(t('msg.emptyPotionSlot'), THEME.textDim);
    return false;
  }
  const def = POTIONS[potionId];
  const cd = player.potionCds[slot];
  if (!cd.ready) {
    toast(t('msg.onCooldown'), THEME.textDim);
    return false;
  }
  const hp = Math.round((player.stats.maxHp * def.hpPercent) / 100);
  const mp = Math.round((player.stats.maxMp * def.mpPercent) / 100);
  player.heal(hp, mp);
  cd.trigger(def.cooldown);
  if (hp > 0) floatText(scene, player.x - 14, player.y - 30, `+${hp}`, THEME.textGreen);
  if (mp > 0) floatText(scene, player.x + 14, player.y - 30, `+${mp}`, '#6a8ae0');
  toast(t('msg.potionUsed', { name: t(def.nameKey) }), THEME.textGreen);
  return true;
}
