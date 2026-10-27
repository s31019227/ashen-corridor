import { ENEMIES } from '../config/enemies';
import { calcDamage } from '../core/damage';
import { dist } from '../core/geometry';
import type { EnemyEntity, EnemyStatus, Sim } from './types';

// 怪物身上的異常狀態：持續傷害、緩速、降防、易傷、延遲爆發。
// 同一個 id（來源技能 + 施放者）重複施放會刷新，不會疊加（降防層數除外）。

export function addStatus(e: EnemyEntity, status: Omit<EnemyStatus, 'timer'> & { timer?: number }) {
  if (!e.alive) return;
  e.statuses = e.statuses.filter((s) => s.id !== status.id);
  e.statuses.push({ timer: 0, ...status });
}

/** 疊層型狀態（例如術士腐化）：每次 +1 層並刷新時間 */
export function addStack(e: EnemyEntity, id: string, ownerId: string, maxStacks: number, perStack: number, duration: number) {
  if (!e.alive) return;
  const existing = e.statuses.find((s) => s.id === id);
  if (existing) {
    existing.stacks = Math.min(maxStacks, (existing.stacks ?? 1) + 1);
    existing.value = perStack * existing.stacks;
    existing.remaining = duration;
    return;
  }
  e.statuses.push({ id, kind: 'armor', ownerId, remaining: duration, value: perStack, stacks: 1, timer: 0 });
}

/** 怪物目前的防禦：先扣固定降防，再乘上百分比降防 */
export function enemyDef(e: EnemyEntity): number {
  const flat = e.statuses.filter((s) => s.kind === 'armor').reduce((sum, s) => sum + s.value, 0);
  const pct = Math.max(0, ...e.statuses.filter((s) => s.kind === 'armorPct').map((s) => s.value));
  return Math.max(0, (ENEMIES[e.defId].def - flat) * (1 - pct / 100));
}

/** 受到傷害的倍率（易傷） */
export function enemyDamageTakenMult(e: EnemyEntity): number {
  return 1 + Math.max(0, ...e.statuses.filter((s) => s.kind === 'vuln').map((s) => s.value)) / 100;
}

/** 移動速度倍率（多個緩速取最強的） */
export function enemySpeedMult(e: EnemyEntity): number {
  return 1 - Math.min(90, Math.max(0, ...e.statuses.filter((s) => s.kind === 'slow').map((s) => s.value))) / 100;
}

/**
 * 推進狀態時間。hit 由呼叫端傳入（避免循環引用 combat.ts）。
 * dot：每秒造成 value（防禦前）傷害；mark：時間到造成 value（防禦前）傷害。
 */
export function tickStatuses(
  sim: Sim,
  e: EnemyEntity,
  dt: number,
  hit: (ownerId: string, e: EnemyEntity, damage: number) => void,
) {
  for (const s of e.statuses) {
    s.remaining -= dt;
    if (s.kind === 'dot') {
      s.timer += dt;
      while (s.timer >= 1 && e.alive) {
        s.timer -= 1;
        hit(s.ownerId, e, calcDamage(s.value, enemyDef(e)));
      }
    } else if (s.kind === 'mark' && s.remaining <= 0 && e.alive) {
      hit(s.ownerId, e, calcDamage(s.value, enemyDef(e)));
      sim.events.push({ k: 'aoe', x: e.x, y: e.y, r: ENEMIES[e.defId].radius + 30, color: 0xa040c0 });
    }
  }
  e.statuses = e.statuses.filter((s) => s.remaining > 0);
}

/** 怪物死亡時：會擴散的持續傷害（瘟疫）傳給附近最近的怪物 */
export function spreadOnDeath(sim: Sim, dead: EnemyEntity) {
  for (const s of dead.statuses) {
    if (s.kind !== 'dot' || !s.spread) continue;
    let best: EnemyEntity | null = null;
    let bestD = s.spread;
    for (const o of sim.world.enemies) {
      if (!o.alive || o === dead) continue;
      const d = dist(o, dead);
      if (d <= bestD) {
        best = o;
        bestD = d;
      }
    }
    if (best) addStatus(best, { ...s, remaining: s.duration ?? s.remaining, timer: 0 });
  }
}
