import type { RunState } from '../core/runState';
import type { ClassId } from '../core/types';
import type { GameEvent, PlayerAction, World } from '../sim/types';

// 連線訊息格式。房主負責遊戲邏輯，其他人只送輸入、收快照（與 farm-shop 相同的做法）。

export type Phase = 'lobby' | 'play' | 'result';

export interface LobbyPlayer {
  id: string;
  name: string;
  classId: ClassId;
  ready: boolean;
  connected: boolean;
  color: number;
}

export interface ResultInfo {
  victory: boolean;
  floor: number;
  kills: number;
  players: { id: string; name: string; classId: ClassId; goldEarned: number; kills: number }[];
}

/** 房主的完整狀態（快照內容） */
export interface HostState {
  phase: Phase;
  hostId: string;
  multiplayer: boolean;
  lobby: LobbyPlayer[];
  run: RunState | null;
  world: World | null;
  result: ResultInfo | null;
}

/** 加入者 → 房主 */
export type ClientMsg =
  | { t: 'move'; x: number; y: number }
  | { t: 'act'; a: PlayerAction }
  | { t: 'lobby'; classId?: ClassId; ready?: boolean; name?: string };

/** 房主 → 加入者 */
export type HostMsg =
  | { t: 'snap'; s: HostState; ev: GameEvent[] }
  | { t: 'reject'; reason: 'full' | 'inProgress' }
  | { t: 'closed' };

/** 連線時附帶的資料 */
export interface JoinMeta {
  cid: string;
  name: string;
}
