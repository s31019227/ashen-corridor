import { THREAT_CONFIG } from '../config/threat';
import type { EnemyEntity, PlayerEntity, Sim } from './types';

// 仇恨值計算。怪物的目標選擇在 sim/enemies.ts 的 targetPlayer()。

function classMult(sim: Sim, pid: string): number {
  const classId = sim.run.players[pid]?.classId;
  return (classId && THREAT_CONFIG.classMultiplier[classId]) ?? 1;
}

/** 對某隻怪物增加仇恨（已套用職業倍率） */
export function addThreat(sim: Sim, e: EnemyEntity, pid: string, amount: number) {
  if (!e.alive || amount <= 0 || !sim.world.players[pid]) return;
  e.threat[pid] = (e.threat[pid] ?? 0) + amount * classMult(sim, pid);
}

/** 造成傷害產生的仇恨 */
export function addDamageThreat(sim: Sim, e: EnemyEntity, pid: string, damage: number) {
  addThreat(sim, e, pid, damage * THREAT_CONFIG.damageRatio);
}

/** 治療或幫隊友加護盾：加到所有已經有人有仇恨（戰鬥中）的怪物身上 */
export function addHealThreat(sim: Sim, pid: string, amount: number) {
  for (const e of sim.world.enemies) {
    if (Object.keys(e.threat).length > 0) addThreat(sim, e, pid, amount * THREAT_CONFIG.healRatio);
  }
}

/** 玩家倒下或離線：從所有怪物的仇恨表移除 */
export function clearThreat(sim: Sim, pid: string) {
  for (const e of sim.world.enemies) delete e.threat[pid];
}

/** 仇恨最高、還能被攻擊的玩家；沒有人有仇恨時回傳 null */
export function topThreatPlayer(sim: Sim, e: EnemyEntity): PlayerEntity | null {
  let best: PlayerEntity | null = null;
  let bestThreat = 0;
  for (const [pid, value] of Object.entries(e.threat)) {
    const p = sim.world.players[pid];
    if (!p?.connected || p.dead) {
      delete e.threat[pid];
      continue;
    }
    if (value > bestThreat) {
      best = p;
      bestThreat = value;
    }
  }
  return best;
}

/** 騎士嘲諷：自己的仇恨變成這隻怪物目前最高仇恨的 tauntRatio 倍，立刻成為目標 */
export function taunt(e: EnemyEntity, pid: string) {
  const top = Math.max(0, ...Object.values(e.threat));
  e.threat[pid] = Math.max(e.threat[pid] ?? 0, top * THREAT_CONFIG.tauntRatio, 1);
}
