import { CLASSES, rankValue, type SkillDef } from '../config/classes';
import { PLAYER_CONFIG } from '../config/player';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { ENEMIES } from '../config/enemies';
import { enemyRadius, hitEnemy } from '../sim/combat';
import { addBuff } from '../sim/effects';
import type { PlayerEntity, Sim } from '../sim/types';

export interface SkillContext {
  sim: Sim;
  player: PlayerEntity;
  skill: SkillDef;
  /** 0–2：小技能，3：大招 */
  index: number;
  /** 技能等級（1 起） */
  rank: number;
}

export type SkillHandler = (ctx: SkillContext) => void;

/** 取技能在目前等級的數值 */
const v = (ctx: SkillContext, key: string) => rankValue(ctx.skill.values[key], ctx.rank);

/**
 * 技能效果註冊表：key 為技能 id，在房主的模擬中執行（多人時效果自動同步）。
 * 尚未註冊的技能會使用 defaultHandler（只顯示名稱）。
 * 攻擊技能選目標請用 sim/combat.ts 的 skillTarget()（鎖定目標在範圍內優先，否則最近的敵人）。
 */
export const SKILL_HANDLERS: Record<string, SkillHandler> = {
  // ── 戰士 ──
  /** 重擊：下一次普攻造成多倍傷害並吸血 */
  heavystrike: (ctx) => {
    ctx.player.empower = { mult: v(ctx, 'mult'), lifesteal: v(ctx, 'lifesteal') };
    announce(ctx);
  },
  /** 獻祭（開關）：每秒燃燒自身血量，對周圍敵人造成傷害（每秒結算在 updateToggles） */
  sacrifice: (ctx) => {
    const p = ctx.player;
    p.toggles.sacrifice = !p.toggles.sacrifice;
    p.toggleTick = 0;
    ctx.sim.events.push({
      k: 'toast',
      pid: p.id,
      key: p.toggles.sacrifice ? 'msg.toggleOn' : 'msg.toggleOff',
      params: { name: ctx.skill.nameKey },
      color: p.toggles.sacrifice ? '#d05050' : '#8a8680',
    });
  },
  /** 衝鋒：移動速度、攻擊速度、減傷提高 */
  charge: (ctx) => {
    const bonus = v(ctx, 'bonus');
    addBuff(ctx.player, ctx.skill.id, v(ctx, 'duration'), { moveSpeed: bonus, attackSpeed: bonus, damageReduction: bonus });
    announce(ctx);
  },
  /** 狂怒：鎖血、攻擊範圍提高，移動速度、攻擊速度、減傷提高 */
  rage: (ctx) => {
    const bonus = v(ctx, 'bonus');
    addBuff(ctx.player, ctx.skill.id, v(ctx, 'duration'), {
      moveSpeed: bonus,
      attackSpeed: bonus,
      damageReduction: bonus,
      attackRange: v(ctx, 'range'),
      hpFloor: v(ctx, 'hpFloor'),
    });
    announce(ctx);
  },
};

/** 在角色頭上顯示技能名稱 */
function announce({ sim, player, index }: SkillContext) {
  sim.events.push({ k: 'skill', pid: player.id, skillIndex: index, implemented: true });
}

const defaultHandler: SkillHandler = ({ sim, player, index }) => {
  sim.events.push({ k: 'skill', pid: player.id, skillIndex: index });
};

export function runSkill(ctx: SkillContext) {
  (SKILL_HANDLERS[ctx.skill.id] ?? defaultHandler)(ctx);
}

/** 開關型技能的持續效果，每秒結算一次 */
export function updateToggles(sim: Sim, p: PlayerEntity, dt: number) {
  const pr = sim.run.players[p.id];
  const def = CLASSES[pr.classId];
  if (!p.toggles.sacrifice) return;
  p.toggleTick += dt;
  if (p.toggleTick < 1) return;
  p.toggleTick -= 1;

  const index = def.skills.findIndex((s) => s.id === 'sacrifice');
  const skill = def.skills[index];
  const rank = pr.skillRanks[index] ?? 0;
  if (!skill || rank <= 0) {
    p.toggles.sacrifice = false;
    return;
  }
  // 燃燒自身血量（不會因此倒下）
  p.hp = Math.max(1, p.hp - rankValue(skill.values.selfDamage, rank));
  const range = rankValue(skill.values.range, rank);
  const ratio = rankValue(skill.values.ratio, rank);
  for (const e of sim.world.enemies) {
    if (!e.alive || edgeDist(p, PLAYER_CONFIG.radius, e, enemyRadius(e)) > range) continue;
    hitEnemy(sim, p.id, e, calcDamage((p.stats.atk * ratio) / 100, ENEMIES[e.defId].def), 0, false);
  }
}
