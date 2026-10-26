import type { SkillDef } from '../config/classes';
import { THEME } from '../config/theme';
import type { Player } from '../entities/Player';
import { t } from '../i18n';
import { floatText } from '../ui/text';
import type Phaser from 'phaser';

export interface SkillContext {
  scene: Phaser.Scene;
  player: Player;
  skill: SkillDef;
  toast: (msg: string, color?: string) => void;
}

export type SkillHandler = (ctx: SkillContext) => void;

/**
 * 技能效果註冊表：key 為技能 id。
 * 本階段職業為白板，尚未註冊的技能會使用 defaultHandler（只顯示名稱）。
 * 之後實作技能時在這裡加上 handler 即可，例如：
 *   SKILL_HANDLERS.cleave = (ctx) => { ... };
 */
export const SKILL_HANDLERS: Record<string, SkillHandler> = {};

const defaultHandler: SkillHandler = ({ scene, player, skill, toast }) => {
  floatText(scene, player.x, player.y - 40, t(skill.nameKey), THEME.textGold, 20);
  toast(t('msg.skillNotImplemented', { name: t(skill.nameKey) }));
};

/** 使用技能。index 0–2 為小技能，3 為大招。 */
export function useSkill(
  scene: Phaser.Scene,
  player: Player,
  index: number,
  toast: (msg: string, color?: string) => void,
): boolean {
  const def = player.classDef;
  const skill = index < 3 ? def.skills[index] : def.ultimate;
  const cd = player.skillCds[index];
  if (!skill || !cd) return false;
  if (!cd.ready) {
    toast(t('msg.onCooldown'), THEME.textDim);
    return false;
  }
  if (player.mp < skill.mpCost) {
    toast(t('msg.notEnoughMp'), THEME.textRed);
    return false;
  }
  player.mp -= skill.mpCost;
  cd.trigger(skill.cooldown);
  (SKILL_HANDLERS[skill.id] ?? defaultHandler)({ scene, player, skill, toast });
  return true;
}
