import Phaser from 'phaser';
import { CLASSES, type PassiveDef, type SkillDef } from '../config/classes';
import { THEME } from '../config/theme';
import type { ClassId } from '../core/types';
import { t } from '../i18n';
import { addText } from './text';

/** 各等級數值：全部相同只顯示一個，否則以「/」串起來（例：5/4/3/2/1） */
function perRank(values: number[]): string {
  return values.every((v) => v === values[0]) ? `${values[0]}` : values.join('/');
}

export function skillParams(skill: SkillDef): Record<string, string> {
  const params: Record<string, string> = { cd: perRank(skill.cooldown), mp: perRank(skill.mpCost) };
  for (const [k, v] of Object.entries(skill.values)) params[k] = perRank(v);
  return params;
}

/** 技能標題列：名稱、類型、冷卻、魔力 */
export function skillHeader(skill: SkillDef, label: string): string {
  const name = t(skill.nameKey);
  if (skill.kind === 'toggle') return `${label} ${name}　${t('skillInfo.toggle')}`;
  return `${label} ${name}　${t('skillInfo.cdMp', skillParams(skill))}`;
}

export function skillDescription(skill: SkillDef): string {
  return t(skill.descKey, skillParams(skill));
}

export function passiveDescription(passive: PassiveDef): string {
  return t(passive.descKey, passive.values);
}

/**
 * 在指定容器中畫出職業的被動與技能說明，回傳畫到的最底部 y。
 * 選職業畫面與多人大廳共用。
 */
export function renderSkillList(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  classId: ClassId,
  x: number,
  y: number,
  width: number,
  compact = false,
  /** 傳入時在標題後顯示目前技能等級（背包頁面用） */
  ranks?: number[],
): number {
  const def = CLASSES[classId];
  const headSize = compact ? 14 : 16;
  const descSize = compact ? 12 : 13;
  const gap = compact ? 6 : 10;
  const entry = (head: string, desc: string, color: string) => {
    const h = addText(scene, x, y, head, headSize, color, { wordWrap: { width } });
    const d = addText(scene, x, y + h.height + 2, desc, descSize, THEME.textDim, { wordWrap: { width }, lineSpacing: 2 });
    container.add([h, d]);
    y = d.y + d.height + gap;
  };
  entry(`${t('classSelect.passive')} ${t(def.passive.nameKey)}`, passiveDescription(def.passive), THEME.textGold);
  const labels = ['[Q]', '[E]', '[R]', `[F] ${t('classSelect.ultimate')}`];
  [...def.skills, def.ultimate].forEach((skill, i) => {
    let head = skillHeader(skill, labels[i]);
    if (ranks) {
      const rank = ranks[i] ?? 0;
      head += rank > 0 ? `　${t('skillInfo.rank', { rank, max: skill.maxRank })}` : `　${t('skillInfo.notLearned')}`;
    }
    entry(head, skillDescription(skill), ranks && !ranks[i] ? THEME.textDim : THEME.text);
  });
  return y;
}
