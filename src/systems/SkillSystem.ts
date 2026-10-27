import { CLASSES, rankValue, type SkillDef } from '../config/classes';
import { PLAYER_CONFIG } from '../config/player';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { enemyRadius, hitEnemy, skillTarget } from '../sim/combat';
import { addBuff, addShield, attackPower, attackRange, heal } from '../sim/effects';
import { enemyDef, addStatus } from '../sim/status';
import { addZone } from '../sim/zones';
import { ROOM_BOUNDS } from '../sim/world';
import { addHealThreat, taunt } from '../sim/threat';
import type { EnemyEntity, PlayerEntity, ProjectileEntity, Sim } from '../sim/types';

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
    const damage = calcDamage((attackPower(sim, p) * v(ctx, 'ratio')) / 100, enemyDef(target));
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
      const amount = (p.stats.maxHp * v(ctx, 'shield')) / 100;
      addShield(ally, `domain:${p.id}`, amount, v(ctx, 'shieldDuration'));
      addHealThreat(sim, p.id, amount); // 幫隊友加護盾也產生仇恨
    }
    const atk = attackPower(sim, p);
    for (const e of sim.world.enemies) {
      if (!e.alive || edgeDist(p, R, e, enemyRadius(e)) > range) continue;
      e.root = Math.max(e.root, v(ctx, 'root'));
      hitEnemy(sim, p.id, e, calcDamage((atk * v(ctx, 'ratio')) / 100, enemyDef(e)), 0, false);
    }
    addBuff(p, ctx.skill.id, v(ctx, 'selfDrDuration'), { damageReduction: v(ctx, 'selfDr') });
    sim.events.push({ k: 'aoe', x: p.x, y: p.y, r: R + range, color: 0xe0d090 });
    announce(ctx);
  },

  // ── 遊俠 ──
  /** 多重射擊：對射程內最近的數個敵人各射一箭 */
  multishot: (ctx) => {
    const { sim, player: p } = ctx;
    const range = attackRange(sim, p);
    const inRange = aliveEnemies(sim)
      .map((e) => ({ e, d: edgeDist(p, R, e, enemyRadius(e)) }))
      .filter((x) => x.d <= range)
      .sort((a, b) => a.d - b.d)
      .slice(0, v(ctx, 'count'))
      .map((x) => x.e);
    const targets = inRange.length > 0 ? inRange : [skillTarget(sim, p, range)].filter((e) => e !== null);
    if (targets.length === 0) return noTarget(ctx);
    for (const e of targets) shoot(ctx, e, { ratio: v(ctx, 'ratio'), kind: 'arrow' });
    announce(ctx);
  },
  /** 翻滾：往移動方向（沒在移動就往面向）位移，之後短暫加速 */
  roll: (ctx) => {
    const { sim, player: p } = ctx;
    const mv = sim.moves[p.id];
    const len = mv ? Math.hypot(mv.x, mv.y) : 0;
    const dx = len > 0.1 ? mv!.x / len : p.fx;
    const dy = len > 0.1 ? mv!.y / len : p.fy;
    teleport(p, p.x + dx * v(ctx, 'distance'), p.y + dy * v(ctx, 'distance'));
    addBuff(p, ctx.skill.id, v(ctx, 'duration'), { moveSpeed: v(ctx, 'speed') });
    announce(ctx);
  },
  /** 捕獸夾：射出帶陷阱的箭，命中造成傷害並定身 */
  snare: (ctx) => {
    const target = skillTarget(ctx.sim, ctx.player, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    shoot(ctx, target, { ratio: v(ctx, 'ratio'), kind: 'arrow', root: v(ctx, 'root') });
    announce(ctx);
  },
  /** 箭雨：在目標位置降下數波箭雨 */
  arrowrain: (ctx) => {
    const target = skillTarget(ctx.sim, ctx.player, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    addZone(ctx.sim, {
      ownerId: ctx.player.id,
      kind: 'damage',
      x: target.x,
      y: target.y,
      r: v(ctx, 'radius'),
      delay: 0.3,
      interval: 0.5,
      ticks: v(ctx, 'waves'),
      amount: v(ctx, 'ratio'),
      color: 0x9ad070,
    });
    announce(ctx);
  },

  // ── 刺客 ──
  /** 飛刀扇：對周圍所有敵人各丟一把飛刀 */
  fanknives: (ctx) => {
    const { sim, player: p } = ctx;
    const targets = aliveEnemies(sim).filter((e) => edgeDist(p, R, e, enemyRadius(e)) <= v(ctx, 'range'));
    if (targets.length === 0) return noTarget(ctx);
    for (const e of targets) shoot(ctx, e, { ratio: v(ctx, 'ratio'), kind: 'dagger' });
    announce(ctx);
  },
  /** 暗影步：瞬移到目標背後，下一次普攻傷害提高 */
  shadowstep: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const behind = enemyRadius(target) + R + 6;
    teleport(p, target.x + (dx / len) * behind, target.y + (dy / len) * behind);
    p.fx = -dx / len;
    p.fy = -dy / len;
    p.lockedId = target.id;
    p.empower = { mult: v(ctx, 'mult'), lifesteal: p.empower?.lifesteal ?? 0 };
    announce(ctx);
  },
  /** 淬毒：一段時間內普攻附加中毒 */
  poison: (ctx) => {
    addBuff(ctx.player, ctx.skill.id, v(ctx, 'duration'), { poisonDot: v(ctx, 'dot'), poisonTime: v(ctx, 'dotTime') });
    announce(ctx);
  },
  /** 死亡印記：標記目標，延遲後爆發 */
  deathmark: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    addStatus(target, {
      id: `deathmark:${p.id}`,
      kind: 'mark',
      ownerId: p.id,
      remaining: v(ctx, 'delay'),
      duration: v(ctx, 'delay'),
      value: (attackPower(sim, p) * v(ctx, 'ratio')) / 100,
    });
    announce(ctx);
  },

  // ── 牧師 ──
  /** 治癒：治療範圍內血量比例最低的隊友（含自己） */
  heal: (ctx) => {
    const { sim, player: p } = ctx;
    const allies = Object.values(sim.world.players).filter(
      (a) => a.connected && !a.dead && edgeDist(p, R, a, R) <= v(ctx, 'range'),
    );
    allies.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
    const target = allies[0] ?? p;
    heal(sim, target, (target.stats.maxHp * v(ctx, 'heal')) / 100, p.id);
    sim.events.push({ k: 'aoe', x: target.x, y: target.y, r: R + 20, color: 0xf0e0a0 });
    announce(ctx);
  },
  /** 驅逐：擊退周圍敵人並造成傷害 */
  repel: (ctx) => {
    const { sim, player: p } = ctx;
    const atk = attackPower(sim, p);
    for (const e of aliveEnemies(sim)) {
      if (edgeDist(p, R, e, enemyRadius(e)) > v(ctx, 'radius')) continue;
      hitEnemy(sim, p.id, e, calcDamage((atk * v(ctx, 'ratio')) / 100, enemyDef(e)), v(ctx, 'knockback'), false);
    }
    sim.events.push({ k: 'aoe', x: p.x, y: p.y, r: R + v(ctx, 'radius'), color: 0xf0e0a0 });
    announce(ctx);
  },
  /** 祝福：範圍內所有隊友（含自己）減傷 */
  blessing: (ctx) => {
    const { sim, player: p } = ctx;
    for (const a of Object.values(sim.world.players)) {
      if (!a.connected || a.dead || edgeDist(p, R, a, R) > v(ctx, 'range')) continue;
      addBuff(a, ctx.skill.id, v(ctx, 'duration'), { damageReduction: v(ctx, 'dr') });
    }
    announce(ctx);
  },
  /** 聖域：在腳下展開持續治療的領域 */
  sanctuary: (ctx) => {
    const p = ctx.player;
    addZone(ctx.sim, {
      ownerId: p.id,
      kind: 'heal',
      x: p.x,
      y: p.y,
      r: v(ctx, 'radius'),
      delay: 0,
      interval: 1,
      ticks: v(ctx, 'duration'),
      amount: v(ctx, 'heal'),
      color: 0xf0e0a0,
    });
    announce(ctx);
  },

  // ── 法師 ──
  /** 火焰箭：高傷害單體 */
  firebolt: (ctx) => {
    const target = skillTarget(ctx.sim, ctx.player, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    shoot(ctx, target, { ratio: v(ctx, 'ratio'), kind: 'fire' });
    announce(ctx);
  },
  /** 冰霜新星：周圍敵人受到傷害並緩速 */
  frostnova: (ctx) => {
    const { sim, player: p } = ctx;
    const atk = attackPower(sim, p);
    for (const e of aliveEnemies(sim)) {
      if (edgeDist(p, R, e, enemyRadius(e)) > v(ctx, 'radius')) continue;
      hitEnemy(sim, p.id, e, calcDamage((atk * v(ctx, 'ratio')) / 100, enemyDef(e)), 0, false);
      addStatus(e, { id: `frostnova:${p.id}`, kind: 'slow', ownerId: p.id, remaining: v(ctx, 'duration'), value: v(ctx, 'slow') });
    }
    sim.events.push({ k: 'aoe', x: p.x, y: p.y, r: R + v(ctx, 'radius'), color: 0x80c8ff });
    announce(ctx);
  },
  /** 引燃：目標持續燃燒 */
  ignite: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    shoot(ctx, target, {
      ratio: 0,
      kind: 'fire',
      statuses: [{ id: `ignite:${p.id}`, kind: 'dot', ownerId: p.id, remaining: v(ctx, 'duration'), value: (attackPower(sim, p) * v(ctx, 'dot')) / 100 }],
    });
    announce(ctx);
  },
  /** 隕星：延遲後轟炸目標位置 */
  meteor: (ctx) => {
    const target = skillTarget(ctx.sim, ctx.player, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    addZone(ctx.sim, {
      ownerId: ctx.player.id,
      kind: 'damage',
      x: target.x,
      y: target.y,
      r: v(ctx, 'radius'),
      delay: v(ctx, 'delay'),
      interval: 1,
      ticks: 1,
      amount: v(ctx, 'ratio'),
      color: 0xff8040,
    });
    announce(ctx);
  },

  // ── 術士 ──
  /** 妖術：命中造成傷害並緩速 */
  hex: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    shoot(ctx, target, {
      ratio: v(ctx, 'ratio'),
      kind: 'hex',
      statuses: [{ id: `hex:${p.id}`, kind: 'slow', ownerId: p.id, remaining: v(ctx, 'duration'), value: v(ctx, 'slow') }],
    });
    announce(ctx);
  },
  /** 衰弱：大幅降低目標防禦並使其受到更多傷害 */
  weaken: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    const remaining = v(ctx, 'duration');
    addStatus(target, { id: `weaken-armor:${p.id}`, kind: 'armorPct', ownerId: p.id, remaining, value: v(ctx, 'armor') });
    addStatus(target, { id: `weaken-vuln:${p.id}`, kind: 'vuln', ownerId: p.id, remaining, value: v(ctx, 'vuln') });
    sim.events.push({ k: 'aoe', x: target.x, y: target.y, r: enemyRadius(target) + 16, color: 0xa040c0 });
    announce(ctx);
  },
  /** 瘟疫：持續傷害，目標死亡時擴散給附近的敵人 */
  plague: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    const duration = v(ctx, 'duration');
    shoot(ctx, target, {
      ratio: 0,
      kind: 'hex',
      statuses: [
        {
          id: `plague:${p.id}`,
          kind: 'dot',
          ownerId: p.id,
          remaining: duration,
          duration,
          spread: v(ctx, 'spread'),
          value: (attackPower(sim, p) * v(ctx, 'dot')) / 100,
        },
      ],
    });
    announce(ctx);
  },
  /** 厄運：延遲後對目標造成巨大傷害 */
  doom: (ctx) => {
    const { sim, player: p } = ctx;
    const target = skillTarget(sim, p, v(ctx, 'range'));
    if (!target) return noTarget(ctx);
    addStatus(target, {
      id: `doom:${p.id}`,
      kind: 'mark',
      ownerId: p.id,
      remaining: v(ctx, 'delay'),
      duration: v(ctx, 'delay'),
      value: (attackPower(sim, p) * v(ctx, 'ratio')) / 100,
    });
    announce(ctx);
  },
};

function aliveEnemies(sim: Sim): EnemyEntity[] {
  return sim.world.enemies.filter((e) => e.alive);
}

/** 移動到指定位置（限制在格子內） */
function teleport(p: PlayerEntity, x: number, y: number) {
  const b = ROOM_BOUNDS;
  p.x = Math.max(b.left + R, Math.min(b.right - R, x));
  p.y = Math.max(b.top + R, Math.min(b.bottom - R, y));
}

/** 技能投射物：ratio 為攻擊力 %（0 表示只附加狀態） */
function shoot(
  ctx: SkillContext,
  target: EnemyEntity,
  opts: { ratio: number; kind: ProjectileEntity['kind']; root?: number; statuses?: ProjectileEntity['statuses'] },
) {
  const { sim, player: p } = ctx;
  const damage = opts.ratio > 0 ? calcDamage((attackPower(sim, p) * opts.ratio) / 100, enemyDef(target)) : 0;
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
    root: opts.root,
    statuses: opts.statuses,
    kind: opts.kind,
    color: CLASSES[sim.run.players[p.id].classId].color,
  });
}

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

/** 施放技能時的被動：騎士嘲諷場上所有敵人（仇恨變成最高的 110%，之後仍可能被搶走） */
function onSkillCast(sim: Sim, p: PlayerEntity) {
  const classId = sim.run.players[p.id].classId;
  if (classId !== 'knight') return;
  let any = false;
  for (const e of sim.world.enemies) {
    if (!e.alive) continue;
    taunt(e, p.id);
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
    hitEnemy(sim, p.id, e, calcDamage((attackPower(sim, p) * ratio) / 100, enemyDef(e)), 0, false);
  }
}
