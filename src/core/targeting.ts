import { edgeDist } from './geometry';
import type { AttackStyle, Vec2 } from './types';

export interface TargetCandidate extends Vec2 {
  id: number;
  radius: number;
  alive: boolean;
}

export interface Attacker extends Vec2 {
  radius: number;
}

export interface TargetQuery {
  attacker: Attacker;
  /** 攻擊範圍（邊緣到邊緣） */
  range: number;
  style: AttackStyle;
  enemies: readonly TargetCandidate[];
  /** 玩家點擊鎖定的目標 */
  lockedId: number | null;
  /** 上一次攻擊的目標，近戰預設會優先延續 */
  previousId?: number | null;
}

export interface TargetResult {
  /** 這次要攻擊的目標，null 表示不攻擊 */
  targetId: number | null;
  /** 鎖定目標已死亡或消失，呼叫端應解除鎖定 */
  clearLock: boolean;
}

export function inRange(attacker: Attacker, enemy: TargetCandidate, range: number): boolean {
  return edgeDist(attacker, attacker.radius, enemy, enemy.radius) <= range;
}

/**
 * 普攻選目標。
 * - 有鎖定：只攻擊鎖定目標；目標不在範圍內時不攻擊任何人。
 * - 鎖定目標死亡：回報 clearLock，並回到預設行為。
 * - 預設：遠程（含投擲）攻擊範圍內最近的敵人；近戰攻擊範圍內任一敵人（優先延續上一個目標）。
 */
export function selectTarget(q: TargetQuery): TargetResult {
  let clearLock = false;
  if (q.lockedId !== null) {
    const locked = q.enemies.find((e) => e.id === q.lockedId && e.alive);
    if (locked) {
      return { targetId: inRange(q.attacker, locked, q.range) ? locked.id : null, clearLock: false };
    }
    clearLock = true;
  }

  const candidates = q.enemies.filter((e) => e.alive && inRange(q.attacker, e, q.range));
  if (candidates.length === 0) return { targetId: null, clearLock };

  if (q.style === 'melee') {
    const prev = candidates.find((e) => e.id === q.previousId);
    return { targetId: (prev ?? candidates[0]).id, clearLock };
  }

  let best = candidates[0];
  let bestDist = Infinity;
  for (const e of candidates) {
    const d = edgeDist(q.attacker, q.attacker.radius, e, e.radius);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return { targetId: best.id, clearLock };
}
