import { DIRS, type Dir, type Vec2 } from './types';

export interface RoomBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TransitionContext {
  /** 格子內敵人是否已全部清除 */
  cleared: boolean;
  bounds: RoomBounds;
  /** 距離邊緣多少以內算「靠近」 */
  threshold: number;
  /** 各方向相鄰格的 id */
  neighbors: Partial<Record<Dir, number>>;
}

/** 回傳某個位置靠近的所有邊（角落時可能有兩個） */
export function edgesNear(p: Vec2, bounds: RoomBounds, threshold: number): Dir[] {
  return DIRS.filter((dir) => {
    switch (dir) {
      case 'up':
        return p.y - bounds.top <= threshold;
      case 'down':
        return bounds.bottom - p.y <= threshold;
      case 'left':
        return p.x - bounds.left <= threshold;
      case 'right':
        return bounds.right - p.x <= threshold;
    }
  });
}

/**
 * 判斷是否可以換格，可以時回傳方向。
 * 規則：格子已清空，且「所有玩家」都靠近同一個有相鄰格的邊緣。
 * 目前只傳入一個玩家；多人時傳入全部玩家的位置即可，不需要改這個函式。
 */
export function canTransition(players: readonly Vec2[], ctx: TransitionContext): Dir | null {
  if (!ctx.cleared || players.length === 0) return null;
  const perPlayer = players.map((p) => edgesNear(p, ctx.bounds, ctx.threshold));
  for (const dir of DIRS) {
    if (ctx.neighbors[dir] === undefined) continue;
    if (perPlayer.every((edges) => edges.includes(dir))) return dir;
  }
  return null;
}
