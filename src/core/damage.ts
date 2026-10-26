// 傷害公式（佔位）：傷害 = 攻擊力 − 防禦力，最低為 1

export const MIN_DAMAGE = 1;

export function calcDamage(atk: number, def: number): number {
  return Math.max(MIN_DAMAGE, Math.round(atk - def));
}
