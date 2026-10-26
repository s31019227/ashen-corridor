import { CLASSES } from '../config/classes';
import { ENEMIES } from '../config/enemies';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { cdReady, cdTick, cdTrigger } from '../core/cooldown';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { addGold } from '../core/runState';
import { selectTarget } from '../core/targeting';
import type { EnemyEntity, PlayerEntity, Sim } from './types';

// 玩家普攻：選目標、自動攻擊、投射物、擊殺。選目標規則在 core/targeting.ts。

const PLAYER_RADIUS = PLAYER_CONFIG.radius;

export function enemyRadius(e: EnemyEntity) {
  return ENEMIES[e.defId].radius;
}

export function attackRange(sim: Sim, p: PlayerEntity) {
  return CLASSES[sim.run.players[p.id].classId].attackRange + p.stats.attackRange;
}

export function attackInterval(sim: Sim, p: PlayerEntity) {
  return CLASSES[sim.run.players[p.id].classId].attackInterval / (1 + p.stats.attackSpeed / 100);
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

  const def = CLASSES[sim.run.players[p.id].classId];
  const useMelee =
    def.attackStyle === 'melee' ||
    (def.attackStyle === 'hybrid' && edgeDist(p, PLAYER_RADIUS, target, enemyRadius(target)) <= (def.meleeRange ?? 0));
  const mult = useMelee ? (def.meleeDamageMult ?? 1) : (def.rangedDamageMult ?? 1);
  const crit = Math.random() * 100 < p.stats.critChance;
  let damage = calcDamage(p.stats.atk * mult, ENEMIES[target.defId].def);
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
      color: def.color,
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
      hitEnemy(sim, proj.ownerId, target, proj.damage, proj.knockback, proj.crit);
      return false;
    }
    proj.x += (dx / d) * move;
    proj.y += (dy / d) * move;
    return true;
  });
}

export function hitEnemy(sim: Sim, ownerId: string, e: EnemyEntity, damage: number, knockback: number, crit: boolean) {
  if (!e.alive) return;
  e.hp = Math.max(0, e.hp - damage);
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

/** 擊殺：每位在線玩家都拿到一份金幣 */
function killEnemy(sim: Sim, ownerId: string, e: EnemyEntity) {
  e.alive = false;
  const [min, max] = ENEMIES[e.defId].goldDrop;
  const gold = Math.round((min + Math.floor(Math.random() * (max - min + 1))) * sim.world.difficulty.gold);
  for (const p of Object.values(sim.world.players)) {
    if (p.connected) addGold(sim.run.players[p.id], gold);
    if (p.lockedId === e.id) p.lockedId = null;
  }
  sim.run.kills++;
  const owner = sim.run.players[ownerId];
  if (owner) owner.kills++;
  sim.events.push({ k: 'kill', id: e.id }, { k: 'gold', x: e.x, y: e.y, v: gold });
}
