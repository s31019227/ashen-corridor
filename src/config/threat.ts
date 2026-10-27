import type { ClassId } from '../core/types';

// 仇恨值：怪物攻擊仇恨最高的玩家（沒有轉移門檻，誰最高就打誰）。
// 還沒有人有仇恨時（剛進格子），怪物追最近的玩家。

export const THREAT_CONFIG = {
  /** 造成傷害：傷害量 × 1 */
  damageRatio: 1,
  /** 治療（自己或隊友）與幫隊友加護盾：量 × 0.5，加到所有已有仇恨的怪物身上 */
  healRatio: 0.5,
  /** 職業產生仇恨的倍率（沒列出的為 1） */
  classMultiplier: { knight: 2.5 } as Partial<Record<ClassId, number>>,
  /** 騎士嘲諷：自己的仇恨變成該怪物目前最高仇恨的這個倍數 */
  tauntRatio: 1.1,
};
