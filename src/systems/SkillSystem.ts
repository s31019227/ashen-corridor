import { CLASSES, rankValue, type SkillDef } from '../config/classes';
import { ENEMIES } from '../config/enemies';
import { PLAYER_CONFIG } from '../config/player';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { enemyRadius, hitEnemy, skillTarget } from '../sim/combat';
import { addBuff, addShield, attackPower } from '../sim/effects';
import type { PlayerEntity, Sim } from '../sim/types';

const R = PLAYER_CONFIG.radius;

export interface SkillContext {
  sim: Sim;
  player: PlayerEntity;
  skill: SkillDef;
  /** 0–2：小技能，3：大招 */
  index: number;
  /** 技能等級（1 起） */
  rank: number;
}

/** 回傳 false 表示施放失敗（例如沒有目標），呼叫端會退還魔力與冷卻 */
export type SkillHandler = (ctx: SkillContext) => void | false;

/** 取技能在目前等級的數值 */
const v = (ctx: SkillContext, key: string) => rankValue(ctx.skill.values[key], ctx.rank);

const noTarget = ({ sim, player }: SkillContext): false => {
  sim.events.push({ k: 'toast', pid: player.id, key: 'msg.noTarget', color: '#8a8680' });
  return false;
};

/**
 * 技能效果註冊表：key 為技能 id，在房主的模擬中執行（多人時效果自動同步）。
 * 尚未註冊的技能會使用 defaultHandler（只顯示名稱）。
 * 攻擊技能選目標用 skillTarget()：鎖定目標在範圍內優先，否則朝最近的敵人施放。
 * 範圍一律以「邊緣到邊緣」計算。
 */
export const SKILL_HANDLERS: Record<string, SkillHandler> = {
  // ── 戰士 ──
  /** 重擊：下一次普攻造成多倍傷害並吸血 */
  heavystrike: (ctx) => {
    ctx.player.empower = { mult: v(ctx, 'mult'), lifesteal: v(ctx, 'lifesteal') };
    announce(ctx);
  },
  /**
   * 獻祭（開關）：每秒燃燒自身血量，對周圍敵人造成傷害（結算在 updateToggles）。
   * 光環半徑 = 角色半徑 + 範圍，光環邊緣碰到怪物邊緣就算命中。
   */
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
  /** 狂怒：血量鎖定在 hpLock%（結束時回滿），攻擊範圍提高，移動速度、攻擊速度、減傷提高 */
  rage: (ctx) => {
    const p = ctx.player;
    const bonus = v(ctx, 'bonus');
    addBuff(p, ctx.skill.id, v(ctx, 'duration'), {
      moveSpeed: bonus,
      attackSpeed: bonus,
      damageReduction: bonus,
      attackRange: v(ctx, 'range'),
      hpLock: v(ctx, 'hpLock'),
      restoreHpOnEnd: true,
    });
    p.hp = (p.stats.maxHp * v(ctx, 'hpLock')) / 100;
    announce(ctx);
  },

  // ── 騎士 ──
  /** 盾擊：丟出盾牌攻擊並暈眩目標 */
  shieldbash: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    const damage = calcDamage((attackPower(sim, p) * v(ctx, 'ratio')) / 100, ENEMIES[target.defId].def);
    sim.world.projectiles.push({
      id: sim.world.nextId++,
      ownerId: p.id,
      x: p.x,
      y: p.y,
      targetId: target.id,
      damage,
      knockback: 0,
      crit: false,
      lifesteal: 0,
      stun: v(ctx, 'stun'),
      kind: 'shield',
      color: 0xd8d8e0,
    });
    announce(ctx);
  },
  /** 聖盾：獲得最大血量 % 的護盾；時間到還有剩，回復剩餘量的 % */
  holyshield: (ctx) => {
    const p = ctx.player;
    addShield(p, ctx.skill.id, (p.stats.maxHp * v(ctx, 'shield')) / 100, v(ctx, 'duration'), v(ctx, 'heal'));
    announce(ctx);
  },
  /** 領域：範圍內隊友獲得護盾；範圍內敵人定身並受到傷害；自身大幅減傷 */
  domain: (ctx) => {
    const { sim, player: p } = ctx;
    const range = v(ctx, 'range');
    for (const ally of Object.values(sim.world.players)) {
      if (ally.id === p.id || !ally.connected || ally.dead) continue;
      if (edgeDist(p, R, ally, R) > range) continue;
      addShield(ally, `domain:${p.id}`, (p.stats.maxHp * v(ctx, 'shield')) / 100, v(ctx, 'shieldDuration'));
    }
    const atk = attackPower(sim, p);
    for (const e of sim.world.enemies) {
      if (!e.alive || edgeDist(p, R, e, enemyRadius(e)) > range) continue;
      e.root = Math.max(e.root, v(ctx, 'root'));
      hitEnemy(sim, p.id, e, calcDamage((atk * v(ctx, 'ratio')) / 100, ENEMIES[e.defId].def), 0, false);
    }
    addBuff(p, ctx.skill.id, v(ctx, 'selfDrDuration'), { damageReduction: v(ctx, 'selfDr') });
    sim.events.push({ k: 'aoe', x: p.x, y: p.y, r: R + range, color: 0xe0d090 });
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

/** 執行技能，成功時觸發職業的「施放技能時」被動；回傳是否成功 */
export function runSkill(ctx: SkillContext): boolean {
  const ok = (SKILL_HANDLERS[ctx.skill.id] ?? defaultHandler)(ctx) !== false;
  if (ok) onSkillCast(ctx.sim, ctx.player);
  return ok;
}

/** 施放技能時的被動：騎士嘲諷場上所有敵人（沒有時間限制） */
function onSkillCast(sim: Sim, p: PlayerEntity) {
  const classId = sim.run.players[p.id].classId;
  if (classId !== 'knight') return;
  let any = false;
  for (const e of sim.world.enemies) {
    if (!e.alive) continue;
    e.tauntId = p.id;
    any = true;
  }
  if (any) sim.events.push({ k: 'float', x: p.x, y: p.y - 56, key: 'msg.taunt', color: '#e05040' });
}

/** 開關型技能的持續效果，每 interval 秒結算一次 */
export function updateToggles(sim: Sim, p: PlayerEntity, dt: number) {
  const pr = sim.run.players[p.id];
  const def = CLASSES[pr.classId];
  if (!p.toggles.sacrifice) return;
  const index = def.skills.findIndex((s) => s.id === 'sacrifice');
  const skill = def.skills[index];
  const rank = pr.skillRanks[index] ?? 0;
  if (!skill || rank <= 0) {
    p.toggles.sacrifice = false;
    return;
  }
  const interval = rankValue(skill.values.interval, rank) || 1;
  p.toggleTick += dt;
  if (p.toggleTick < interval) return;
  p.toggleTick -= interval;

  // 燃燒自身血量（每秒 selfDamage，不會因此倒下）
  p.hp = Math.max(1, p.hp - rankValue(skill.values.selfDamage, rank) * interval);
  const range = rankValue(skill.values.range, rank);
  const ratio = rankValue(skill.values.ratio, rank);
  for (const e of sim.world.enemies) {
    if (!e.alive || edgeDist(p, R, e, enemyRadius(e)) > range) continue;
    hitEnemy(sim, p.id, e, calcDamage((attackPower(sim, p) * ratio) / 100, ENEMIES[e.defId].def), 0, false);
  }
}
