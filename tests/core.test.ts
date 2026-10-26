import { describe, expect, it } from 'vitest';
import { bfsDistances, generateFloor, isBossReachable, markCleared } from '../src/core/mapGen';
import { calcDamage } from '../src/core/damage';
import { canTransition } from '../src/core/roomTransition';
import { selectTarget, type TargetCandidate } from '../src/core/targeting';
import { Cooldown } from '../src/core/cooldown';
import { createRun } from '../src/core/runState';
import { buyItem } from '../src/core/inventory';
import { MAP_CONFIG } from '../src/config/map';

describe('mapGen', () => {
  it('generates valid floors for many seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const map = generateFloor({ floor: 1, seed });
      expect(map.cells.length).toBe(MAP_CONFIG.totalCells);
      expect(isBossReachable(map)).toBe(true);
      expect(bfsDistances(map, map.startId).size).toBe(map.cells.length);
      const count = (type: string) => map.cells.filter((c) => c.type === type).length;
      expect(count('start')).toBe(1);
      expect(count('boss')).toBe(1);
      expect(count('shop')).toBe(MAP_CONFIG.counts.shop - 1);
      expect(count('mob')).toBe(MAP_CONFIG.counts.mob);
      expect(count('altar') + count('treasure') + count('rest')).toBe(MAP_CONFIG.counts.special);
      expect(map.cells[map.startId].type).toBe('start');
      expect(bfsDistances(map, map.startId).get(map.bossId)).toBeGreaterThanOrEqual(MAP_CONFIG.minBossDistance);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(generateFloor({ floor: 1, seed: 42 })).toEqual(generateFloor({ floor: 1, seed: 42 }));
  });

  it('turns cleared mob rooms into empty rooms', () => {
    const map = generateFloor({ floor: 1, seed: 7 });
    const mob = map.cells.find((c) => c.type === 'mob')!;
    markCleared(map, mob.id);
    expect(mob.type).toBe('empty');
    expect(mob.cleared).toBe(true);
  });
});

describe('damage', () => {
  it('is atk - def with minimum 1', () => {
    expect(calcDamage(10, 3)).toBe(7);
    expect(calcDamage(3, 10)).toBe(1);
  });
});

describe('canTransition', () => {
  const bounds = { left: 0, top: 0, right: 100, bottom: 100 };
  const ctx = { cleared: true, bounds, threshold: 10, neighbors: { right: 5 } };
  it('requires cleared room, edge proximity and a neighbor', () => {
    expect(canTransition([{ x: 95, y: 50 }], ctx)).toBe('right');
    expect(canTransition([{ x: 50, y: 50 }], ctx)).toBeNull();
    expect(canTransition([{ x: 5, y: 50 }], ctx)).toBeNull();
    expect(canTransition([{ x: 95, y: 50 }], { ...ctx, cleared: false })).toBeNull();
  });
  it('requires all players at the same edge', () => {
    expect(canTransition([{ x: 95, y: 50 }, { x: 50, y: 50 }], ctx)).toBeNull();
    expect(canTransition([{ x: 95, y: 50 }, { x: 92, y: 10 }], ctx)).toBe('right');
  });
});

describe('selectTarget', () => {
  const attacker = { x: 0, y: 0, radius: 10 };
  const e = (id: number, x: number, alive = true): TargetCandidate => ({ id, x, y: 0, radius: 10, alive });
  const enemies = [e(1, 200), e(2, 60), e(3, 500)];

  it('ranged picks nearest in range', () => {
    expect(selectTarget({ attacker, range: 300, style: 'ranged', enemies, lockedId: null }).targetId).toBe(2);
  });
  it('locked target out of range means no attack', () => {
    expect(selectTarget({ attacker, range: 300, style: 'ranged', enemies, lockedId: 3 }).targetId).toBeNull();
    expect(selectTarget({ attacker, range: 300, style: 'melee', enemies, lockedId: 3 }).targetId).toBeNull();
  });
  it('locked target in range is attacked even if not nearest', () => {
    expect(selectTarget({ attacker, range: 300, style: 'ranged', enemies, lockedId: 1 }).targetId).toBe(1);
  });
  it('dead locked target clears lock and falls back', () => {
    const r = selectTarget({ attacker, range: 300, style: 'ranged', enemies: [e(1, 100, false), e(2, 60)], lockedId: 1 });
    expect(r.clearLock).toBe(true);
    expect(r.targetId).toBe(2);
  });
  it('melee keeps previous target', () => {
    const near = [e(1, 30), e(2, 25)];
    expect(selectTarget({ attacker, range: 20, style: 'melee', enemies: near, lockedId: null, previousId: 2 }).targetId).toBe(2);
  });
});

describe('cooldown', () => {
  it('ticks down', () => {
    const cd = new Cooldown(2);
    cd.trigger();
    expect(cd.ready).toBe(false);
    cd.tick(2.5);
    expect(cd.ready).toBe(true);
  });
});

describe('inventory', () => {
  it('buys equipment and potions', () => {
    const run = createRun('warrior', 1);
    run.gold = 100;
    expect(buyItem(run, 'rusted_blade')).toBe('ok');
    expect(run.equipment.weapon).toBe('rusted_blade');
    expect(buyItem(run, 'rusted_blade')).toBe('owned');
    expect(buyItem(run, 'potion:mp')).toBe('ok');
    expect(run.potions).toContain('mp');
    run.gold = 0;
    expect(buyItem(run, 'iron_cap')).toBe('noGold');
  });
});
