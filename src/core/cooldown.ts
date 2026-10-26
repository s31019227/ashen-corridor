// 冷卻計時器。用純資料物件（不是 class），才能直接放進連線快照傳給其他玩家。

export interface Cooldown {
  remaining: number;
  duration: number;
}

export function cooldown(duration = 0): Cooldown {
  return { remaining: 0, duration };
}

export function cdReady(cd: Cooldown): boolean {
  return cd.remaining <= 0;
}

/** 剩餘比例，1 = 剛觸發，0 = 可使用 */
export function cdProgress(cd: Cooldown): number {
  return cd.duration > 0 ? Math.max(0, cd.remaining / cd.duration) : 0;
}

export function cdTrigger(cd: Cooldown, duration = cd.duration) {
  cd.duration = duration;
  cd.remaining = duration;
}

export function cdTick(cd: Cooldown, dt: number) {
  if (cd.remaining > 0) cd.remaining = Math.max(0, cd.remaining - dt);
}
