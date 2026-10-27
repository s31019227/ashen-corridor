import { ENEMIES, type EnemySkillDef } from '../config/enemies';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { cdReady, cdTick, cdTrigger } from '../core/cooldown';
import { calcDamage } from '../core/damage';
import { clamp, dist, edgeDist, pointSegmentDist } from '../core/geometry';
import { enemyRadius, hitEnemy } from './combat';
import { absorbWithShields, damageTakenMult, hpLock, passiveSkillRank } from './effects';
import type { EnemyEntity, PlayerEntity, Sim, TelegraphEntity } from './types';
import { ROOM_BOUNDS } from './world';

// 怪物 AI 與技能預警。怪物會追擊最近的活著玩家。

const PLAYER_RADIUS = PLAYER_CONFIG.radius;

function alivePlayers(sim: Sim): PlayerEntity[] {
  return Object.values(sim.world.players).filter((p) => p.connected && !p.dead);
}

/** 怪物的目標：被嘲諷時攻擊嘲諷者，否則最近的活著玩家 */
function targetPlayer(sim: Sim, e: EnemyEntity): PlayerEntity | null {
  if (e.tauntId) {
    const t = sim.world.players[e.tauntId];
    if (t?.connected && !t.dead) return t;
    e.tauntId = null;
  }
  return nearestPlayer(sim, e);
}

function nearestPlayer(sim: Sim, e: EnemyEntity): PlayerEntity | null {
  let best: PlayerEntity | null = null;
  let bestD = Infinity;
  for (const p of alivePlayers(sim)) {
    const d = dist(e, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** 對玩家造成傷害；接觸傷害有短暫無敵，技能傷害（ignoreInvuln）不受影響 */
/**
 * 對玩家造成傷害。順序：反甲（用防禦前的傷害）→ 減傷 → 護盾吸收 → 血量鎖定 → 扣血。
 * source / raw：攻擊者與計算防禦前的傷害（反甲用），沒有時不觸發反擊。
 * 接觸傷害有短暫無敵，技能傷害（ignoreInvuln）不受影響。
 */
export function damagePlayer(sim: Sim, p: PlayerEntity, amount: number, ignoreInvuln = false, source?: EnemyEntity, raw = 0) {
  if (p.dead || (!ignoreInvuln && p.invuln > 0)) return;
  if (source?.alive && raw > 0) reflectDamage(sim, p, source, raw);
  amount = Math.max(1, Math.round(amount * damageTakenMult(p, sim)));
  amount = Math.round(absorbWithShields(p, amount));
  p.invuln = GAME_CONFIG.combat.playerHitInvulnSec;
  if (amount <= 0) {
    sim.events.push({ k: 'float', x: p.x, y: p.y - 24, key: 'msg.absorbed', color: '#a0d8ff' });
    return;
  }
  // 血量鎖定（戰士大招）：鎖定期間不扣血
  const lock = hpLock(p);
  p.hp = lock !== null ? lock : Math.max(0, p.hp - amount);
  sim.events.push({ k: 'dmg', x: p.x, y: p.y - 24, v: amount, onPlayer: p.id });
  if (p.hp <= 0) {
    p.dead = true;
    p.lockedId = null;
    p.targetId = null;
    sim.events.push({ k: 'toast', pid: p.id, key: 'msg.youDied', color: '#d05050' });
  }
}

/** 騎士反甲：把「自身防禦計算前」的傷害按比例反彈給攻擊者，再扣攻擊者自己的防禦 */
function reflectDamage(sim: Sim, p: PlayerEntity, source: EnemyEntity, raw: number) {
  const { rank, values } = passiveSkillRank(sim, p, 'thorns');
  if (rank <= 0) return;
  hitEnemy(sim, p.id, source, calcDamage((raw * values.reflect) / 100, ENEMIES[source.defId].def), 0, false);
}

export function updateEnemies(sim: Sim, dt: number) {
  const alive = sim.world.enemies.filter((e) => e.alive);
  for (const e of alive) updateEnemy(sim, e, dt);
  separate(alive);
  for (const e of alive) {
    const r = enemyRadius(e);
    e.x = clamp(e.x, ROOM_BOUNDS.left + r, ROOM_BOUNDS.right - r);
    e.y = clamp(e.y, ROOM_BOUNDS.top + r, ROOM_BOUNDS.bottom - r);
  }
  sim.world.enemies = sim.world.enemies.filter((e) => e.alive);
  updateTelegraphs(sim, dt);
}

function updateEnemy(sim: Sim, e: EnemyEntity, dt: number) {
  const def = ENEMIES[e.defId];
  cdTick(e.attackCd, dt);
  for (const cd of e.skillCds) cdTick(cd, dt);

  if (e.kt > 0) {
    const step = Math.min(dt, e.kt);
    e.x += e.kvx * step;
    e.y += e.kvy * step;
    e.kt -= step;
    return;
  }
  if (e.root > 0) e.root -= dt;
  if (e.stun > 0) {
    e.stun -= dt;
    return;
  }
  if (e.castLock > 0) {
    e.castLock -= dt;
    return;
  }
  const p = targetPlayer(sim, e);
  if (!p) return;

  // 技能：冷卻好且在施放距離內就施放
  const d = dist(e, p);
  for (let i = 0; i < def.skills.length; i++) {
    const skill = def.skills[i];
    if (cdReady(e.skillCds[i]) && d <= skill.castRange) {
      cast(sim, e, p, skill);
      cdTrigger(e.skillCds[i], skill.cooldown);
      return;
    }
  }

  // 移動
  const r = enemyRadius(e);
  const gap = edgeDist(e, r, p, PLAYER_RADIUS);
  const dx = (p.x - e.x) / (d || 1);
  const dy = (p.y - e.y) / (d || 1);
  const speed = def.moveSpeed * dt;
  if (def.behavior === 'caster' && e.root <= 0) {
    const preferred = def.preferredDistance ?? 200;
    if (d < preferred - 40) {
      e.x -= dx * speed;
      e.y -= dy * speed;
    } else if (d > preferred + 40) {
      e.x += dx * speed;
      e.y += dy * speed;
    } else {
      e.x += -dy * speed * 0.5 * e.strafe;
      e.y += dx * speed * 0.5 * e.strafe;
      if (Math.random() < dt * 0.3) e.strafe *= -1;
    }
  } else if (gap > def.attackRange && e.root <= 0) {
    e.x += dx * speed;
    e.y += dy * speed;
  }

  // 接觸攻擊
  if (gap <= def.attackRange + 2 && cdReady(e.attackCd)) {
    cdTrigger(e.attackCd, def.attackInterval);
    damagePlayer(sim, p, calcDamage(e.atk, p.stats.def), false, e, e.atk);
  }
}

function cast(sim: Sim, e: EnemyEntity, p: PlayerEntity, skill: EnemySkillDef) {
  const fromSelf = skill.origin === 'self';
  sim.world.telegraphs.push({
    id: sim.world.nextId++,
    shape: skill.shape,
    x: fromSelf ? e.x : p.x,
    y: fromSelf ? e.y : p.y,
    size: skill.size,
    length: skill.length ?? 0,
    angle: Math.atan2(p.y - e.y, p.x - e.x),
    warnTime: skill.warnTime,
    elapsed: 0,
    damage: Math.round(skill.damage * e.damageMult),
    ownerId: e.id,
    reflectable: skill.reflectable,
  });
  // 以自身為起點的技能：施放期間站著不動，給玩家躲避的機會
  if (fromSelf) e.castLock = skill.warnTime;
}

export function telegraphHits(tg: TelegraphEntity, p: { x: number; y: number }, radius: number): boolean {
  if (tg.shape === 'circle') return dist(p, tg) <= tg.size + radius;
  const end = { x: tg.x + Math.cos(tg.angle) * tg.length, y: tg.y + Math.sin(tg.angle) * tg.length };
  return pointSegmentDist(p, tg, end) <= tg.size / 2 + radius;
}

function updateTelegraphs(sim: Sim, dt: number) {
  sim.world.telegraphs = sim.world.telegraphs.filter((tg) => {
    tg.elapsed += dt;
    if (tg.elapsed < tg.warnTime) return true;
    sim.events.push({ k: 'boom', tg: { ...tg } });
    for (const p of alivePlayers(sim)) {
      if (!telegraphHits(tg, p, PLAYER_RADIUS)) continue;
      // 技能預設不會被反甲反彈，設定檔標明 reflectable 的才會
      const owner = tg.reflectable ? sim.world.enemies.find((e) => e.id === tg.ownerId) : undefined;
      damagePlayer(sim, p, calcDamage(tg.damage, p.stats.def), true, owner, tg.damage);
    }
    return false;
  });
}

/** 怪物之間互相推開，避免疊在一起 */
function separate(enemies: EnemyEntity[]) {
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      const overlap = -edgeDist(a, enemyRadius(a), b, enemyRadius(b));
      if (overlap <= 0) continue;
      const d = dist(a, b) || 1;
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;
    }
  }
}
