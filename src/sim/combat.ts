import { CLASSES } from '../config/classes';
import { ENEMIES } from '../config/enemies';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { cdReady, cdTick, cdTrigger } from '../core/cooldown';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { addXp } from '../core/leveling';
import { addGold } from '../core/runState';
import { attackInterval, attackPower, attackRange, heal } from './effects';
import { addDamageThreat } from './threat';
import { addStack, addStatus, enemyDamageTakenMult, enemyDef, spreadOnDeath, tickStatuses } from './status';
import { onLevelUp } from './world';
import { selectTarget } from '../core/targeting';
import type { EnemyEntity, PlayerEntity, Sim } from './types';

// 玩家普攻：選目標、自動攻擊、投射物、擊殺。選目標規則在 core/targeting.ts。

const PLAYER_RADIUS = PLAYER_CONFIG.radius;

export function enemyRadius(e: EnemyEntity) {
  return ENEMIES[e.defId].radius;
}

/**
 * 技能選目標：鎖定的敵人在技能範圍內就打鎖定目標，否則打最近的敵人（不限範圍，朝它施放）。
 * 沒有任何敵人時回傳 null。
 */
export function skillTarget(sim: Sim, p: PlayerEntity, range: number): EnemyEntity | null {
  const alive = sim.world.enemies.filter((e) => e.alive);
  const locked = alive.find((e) => e.id === p.lockedId);
  if (locked && edgeDist(p, PLAYER_RADIUS, locked, enemyRadius(locked)) <= range) return locked;
  let best: EnemyEntity | null = null;
  let bestD = Infinity;
  for (const e of alive) {
    const d = edgeDist(p, PLAYER_RADIUS, e, enemyRadius(e));
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** 根據鎖定與預設規則選出普攻目標 */
function refreshTarget(sim: Sim, p: PlayerEntity) {
  const def = CLASSES[sim.run.players[p.id].classId];
  const result = selectTarget({
    attacker: { x: p.x, y: p.y, radius: PLAYER_RADIUS },
    range: attackRange(sim, p),
    style: def.attackStyle,
    enemies: sim.world.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, radius: enemyRadius(e), alive: e.alive })),
    lockedId: p.lockedId,
    previousId: p.lastAttackedId,
  });
  if (result.clearLock) p.lockedId = null;
  p.targetId = result.targetId;
}

/** 普攻只有兩種模式：自動普攻，或完全不普攻（由攻擊鍵切換） */
export function updatePlayerAttacks(sim: Sim, dt: number) {
  for (const p of Object.values(sim.world.players)) {
    cdTick(p.attackCd, dt);
    if (!p.connected || p.dead) {
      p.targetId = null;
      continue;
    }
    refreshTarget(sim, p);
    if (sim.run.players[p.id].autoAttack) tryAttack(sim, p);
  }
  updateProjectiles(sim, dt);
}

function tryAttack(sim: Sim, p: PlayerEntity) {
  const target = sim.world.enemies.find((e) => e.id === p.targetId && e.alive);
  if (!target || !cdReady(p.attackCd)) return;
  cdTrigger(p.attackCd, attackInterval(sim, p));
  p.lastAttackedId = target.id;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  p.fx = dx / len;
  p.fy = dy / len;

  const classId = sim.run.players[p.id].classId;
  const def = CLASSES[classId];
  const useMelee =
    def.attackStyle === 'melee' ||
    (def.attackStyle === 'hybrid' && edgeDist(p, PLAYER_RADIUS, target, enemyRadius(target)) <= (def.meleeRange ?? 0));
  const styleMult = useMelee ? (def.meleeDamageMult ?? 1) : (def.rangedDamageMult ?? 1);
  const empower = p.empower;
  p.empower = null;
  const mult = styleMult * (empower?.mult ?? 1) * passiveHitMult(sim, p, target);
  const lifesteal = empower?.lifesteal ?? 0;
  const crit = Math.random() * 100 < p.stats.critChance;
  let damage = calcDamage(attackPower(sim, p) * mult, enemyDef(target));
  if (crit) damage = Math.round(damage * PLAYER_CONFIG.critMultiplier);

  if (useMelee) {
    sim.events.push({
      k: 'slash',
      x: p.x,
      y: p.y,
      angle: Math.atan2(dy, dx),
      r: PLAYER_RADIUS + Math.min(attackRange(sim, p), 60) * 0.8,
    });
    hitEnemy(sim, p.id, target, damage, def.attackKnockback, crit);
    healFromLifesteal(sim, p, damage, lifesteal);
    onBasicHit(sim, p, target, damage);
  } else {
    sim.world.projectiles.push({
      id: sim.world.nextId++,
      ownerId: p.id,
      x: p.x,
      y: p.y,
      targetId: target.id,
      damage,
      knockback: def.attackKnockback,
      crit,
      lifesteal,
      basic: true,
      kind: classId === 'ranger' ? 'arrow' : classId === 'assassin' ? 'dagger' : undefined,
      color: def.color,
    });
  }
}

/** 普攻的被動傷害加成：遊俠距離越遠越痛、刺客打「目標不是自己」的敵人 */
function passiveHitMult(sim: Sim, p: PlayerEntity, target: EnemyEntity): number {
  const classId = sim.run.players[p.id].classId;
  const values = CLASSES[classId].passive.values;
  if (classId === 'ranger') {
    const d = edgeDist(p, PLAYER_RADIUS, target, enemyRadius(target));
    return 1 + (values.maxBonus * Math.min(1, Math.max(0, d) / attackRange(sim, p))) / 100;
  }
  if (classId === 'assassin' && target.targetId !== p.id) return 1 + values.bonus / 100;
  return 1;
}

/** 普攻命中時觸發的被動：牧師治療隊友、術士降防、刺客淬毒 */
function onBasicHit(sim: Sim, p: PlayerEntity, target: EnemyEntity, damage: number) {
  const classId = sim.run.players[p.id].classId;
  const values = CLASSES[classId].passive.values;
  if (classId === 'priest') {
    const allies = Object.values(sim.world.players).filter(
      (a) => a.connected && !a.dead && a.hp < a.stats.maxHp && edgeDist(p, PLAYER_RADIUS, a, PLAYER_RADIUS) <= values.range,
    );
    allies.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
    if (allies[0]) heal(sim, allies[0], (damage * values.healRatio) / 100, p.id);
  }
  if (classId === 'warlock') {
    addStack(target, `corruption:${p.id}`, p.id, values.maxStacks, values.armorPerStack, values.duration);
  }
  const poison = p.buffs.find((b) => b.mods.poisonDot);
  if (poison) {
    addStatus(target, {
      id: `poison:${p.id}`,
      kind: 'dot',
      ownerId: p.id,
      remaining: poison.mods.poisonTime ?? 3,
      value: (attackPower(sim, p) * poison.mods.poisonDot!) / 100,
    });
  }
}

function updateProjectiles(sim: Sim, dt: number) {
  const speed = GAME_CONFIG.combat.projectileSpeed;
  sim.world.projectiles = sim.world.projectiles.filter((proj) => {
    const target = sim.world.enemies.find((e) => e.id === proj.targetId && e.alive);
    if (!target) return false;
    const dx = target.x - proj.x;
    const dy = target.y - proj.y;
    const d = Math.hypot(dx, dy);
    const move = speed * dt;
    if (d <= enemyRadius(target) + move) {
      // 只附加狀態的投射物（引燃、瘟疫）傷害為 0，不顯示傷害數字
      if (proj.damage > 0) hitEnemy(sim, proj.ownerId, target, proj.damage, proj.knockback, proj.crit);
      if (proj.stun && target.alive) target.stun = Math.max(target.stun, proj.stun);
      if (proj.root && target.alive) target.root = Math.max(target.root, proj.root);
      for (const st of proj.statuses ?? []) addStatus(target, st);
      const owner = sim.world.players[proj.ownerId];
      if (owner) healFromLifesteal(sim, owner, proj.damage, proj.lifesteal);
      if (owner && proj.basic) onBasicHit(sim, owner, target, proj.damage);
      return false;
    }
    proj.x += (dx / d) * move;
    proj.y += (dy / d) * move;
    return true;
  });
}

export function hitEnemy(sim: Sim, ownerId: string, e: EnemyEntity, damage: number, knockback: number, crit: boolean) {
  if (!e.alive) return;
  damage = Math.round(damage * enemyDamageTakenMult(e)); // 易傷
  // DPS 表只算實際打掉的血量（不含溢出傷害）
  const dealt = Math.min(e.hp, damage);
  sim.world.damage[ownerId] = (sim.world.damage[ownerId] ?? 0) + dealt;
  sim.run.floorDamage[ownerId] = (sim.run.floorDamage[ownerId] ?? 0) + dealt;
  e.hp = Math.max(0, e.hp - damage);
  addDamageThreat(sim, e, ownerId, damage);
  sim.events.push({ k: 'dmg', x: e.x, y: e.y - enemyRadius(e) - 12, v: damage, crit });
  const owner = sim.world.players[ownerId];
  if (owner && knockback > 0 && ENEMIES[e.defId].behavior !== 'boss') {
    const dx = e.x - owner.x;
    const dy = e.y - owner.y;
    const len = Math.hypot(dx, dy) || 1;
    const duration = 0.15;
    e.kvx = (dx / len) * (knockback / duration);
    e.kvy = (dy / len) * (knockback / duration);
    e.kt = duration;
  }
  if (e.hp <= 0) killEnemy(sim, ownerId, e);
}

function healFromLifesteal(sim: Sim, p: PlayerEntity, damage: number, lifesteal: number) {
  if (lifesteal <= 0 || p.dead) return;
  heal(sim, p, (damage * lifesteal) / 100);
}

/** 怪物的異常狀態（持續傷害、延遲爆發等）每幀推進 */
export function updateEnemyStatuses(sim: Sim, dt: number) {
  for (const e of sim.world.enemies) {
    if (e.alive) tickStatuses(sim, e, dt, (ownerId, enemy, damage) => hitEnemy(sim, ownerId, enemy, damage, 0, false));
  }
}

/** 擊殺：每位在線玩家都拿到一份金幣與經驗 */
function killEnemy(sim: Sim, ownerId: string, e: EnemyEntity) {
  e.alive = false;
  spreadOnDeath(sim, e);
  const [min, max] = ENEMIES[e.defId].goldDrop;
  const gold = Math.round((min + Math.floor(Math.random() * (max - min + 1))) * sim.world.difficulty.gold);
  const xp = ENEMIES[e.defId].xp;
  for (const p of Object.values(sim.world.players)) {
    if (p.lockedId === e.id) p.lockedId = null;
    if (!p.connected) continue;
    const pr = sim.run.players[p.id];
    addGold(pr, gold);
    const levels = addXp(pr, xp);
    if (levels > 0) onLevelUp(sim, p.id);
  }
  sim.run.kills++;
  const owner = sim.run.players[ownerId];
  if (owner) owner.kills++;
  sim.events.push({ k: 'kill', id: e.id }, { k: 'gold', x: e.x, y: e.y, v: gold });
}
