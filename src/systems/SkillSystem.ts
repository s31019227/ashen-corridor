import type { SkillDef } from '../config/classes';
import type { PlayerEntity, Sim } from '../sim/types';

export interface SkillContext {
  sim: Sim;
  player: PlayerEntity;
  skill: SkillDef;
  /** 0–2：小技能，3：大招 */
  index: number;
}

export type SkillHandler = (ctx: SkillContext) => void;

/**
 * 技能效果註冊表：key 為技能 id，在房主的模擬中執行（多人時效果才會同步）。
 * 本階段職業為白板，尚未註冊的技能會使用 defaultHandler（只顯示名稱）。
 * 之後實作技能時在這裡加上 handler 即可，例如：
 *   SKILL_HANDLERS.cleave = ({ sim, player }) => { ... };
 */
export const SKILL_HANDLERS: Record<string, SkillHandler> = {};

const defaultHandler: SkillHandler = ({ sim, player, index }) => {
  sim.events.push({ k: 'skill', pid: player.id, skillIndex: index });
};

export function runSkill(ctx: SkillContext) {
  (SKILL_HANDLERS[ctx.skill.id] ?? defaultHandler)(ctx);
}
