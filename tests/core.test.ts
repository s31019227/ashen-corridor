import { describe, expect, it } from 'vitest';
import { bfsDistances, generateFloor, isBossReachable, markCleared } from '../src/core/mapGen';
import { calcDamage } from '../src/core/damage';
import { canTransition } from '../src/core/roomTransition';
import { selectTarget, type TargetCandidate } from '../src/core/targeting';
import { cdReady, cdTick, cdTrigger, cooldown } from '../src/core/cooldown';
import { createPlayerRun, createRun, migrateRun, type NewPlayer } from '../src/core/runState';
import type { ClassId } from '../src/core/types';

const np = (classId: ClassId, id = 'p1'): NewPlayer => ({ id, name: id, classId, color: 0xffffff, autoAttack: true });
import { computeStats } from '../src/core/stats';
import { buyItem, carryPotion, resolveShopItem } from '../src/core/inventory';
import { neighbors } from '../src/core/mapGen';
import { ENEMIES } from '../src/config/enemies';
import { stepSim } from '../src/sim/step';
import { applyAction } from '../src/sim/actions';
import { hitEnemy } from '../src/sim/combat';
import { createWorld, ROOM_BOUNDS } from '../src/sim/world';
import type { PlayerEntity, Sim } from '../src/sim/types';
import { difficultyLevel, difficultyScale } from '../src/core/difficulty';
import { CLASSES } from '../src/config/classes';
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
    const cd = cooldown(2);
    cdTrigger(cd);
    expect(cdReady(cd)).toBe(false);
    cdTick(cd, 2.5);
    expect(cdReady(cd)).toBe(true);
  });
});

describe('inventory', () => {
  it('weapons are class-locked, armor is not', () => {
    const run = createPlayerRun(np('warrior'));
    run.gold = 1000;
    expect(buyItem(run, 'ember_wand')).toBe('wrongClass');
    expect(buyItem(run, 'iron_greatsword')).toBe('ok');
    expect(run.equipment.weapon).toBe('iron_greatsword');
    expect(buyItem(run, 'iron_greatsword')).toBe('owned');
    expect(buyItem(run, 'linen_helmet')).toBe('ok');
    run.gold = 0;
    expect(buyItem(run, 'ironguard_chest')).toBe('noGold');
  });

  it('starts without potions; buying unlocks, carrying swaps for free', () => {
    const run = createPlayerRun(np('mage'));
    expect(run.potions).toEqual([null]);
    run.gold = 1000;
    expect(buyItem(run, 'potion:mp')).toBe('ok');
    expect(run.potions).toEqual(['mp']);
    expect(buyItem(run, 'potion:hp')).toBe('ok');
    expect(run.potions).toEqual(['hp']);
    const gold = run.gold;
    expect(carryPotion(run, 'mp')).toBe(true);
    expect(run.potions).toEqual(['mp']);
    expect(run.gold).toBe(gold);
    expect(carryPotion(run, 'balanced')).toBe(false); // 未解鎖
    expect(buyItem(run, 'potion:mp')).toBe('owned');
  });
});

describe('shops', () => {
  it('every shop has random equipment and some potions', () => {
    const stocks = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const map = generateFloor({ floor: 1, seed });
      const shops = map.cells.filter((c) => c.type === 'shop' || c.type === 'start');
      expect(shops.length).toBe(MAP_CONFIG.counts.shop);
      for (const c of shops) {
        expect(c.shopStock!.some((id) => id.startsWith('potion:'))).toBe(true);
        expect(c.shopStock!.some((id) => !id.startsWith('potion:'))).toBe(true);
      }
      stocks.add(map.cells[map.startId].shopStock!.join());
    }
    expect(stocks.size).toBeGreaterThan(20); // 起始商店不是固定商品
  });
});

describe('difficulty', () => {
  it('rises only with newly explored rooms', () => {
    const map = generateFloor({ floor: 1, seed: 9 });
    expect(difficultyLevel(map)).toBe(0);
    map.cells[1].visited = true;
    map.cells[2].visited = true;
    expect(difficultyLevel(map)).toBe(2);
    map.cells[1].visited = true; // 重複探索
    expect(difficultyLevel(map)).toBe(2);
    expect(difficultyScale(10).hp).toBeCloseTo(1.4);
  });
});

describe('assassin', () => {
  it('melee hits harder than thrown daggers', () => {
    expect(CLASSES.assassin.meleeDamageMult).toBe(1.3);
    expect(CLASSES.assassin.rangedDamageMult).toBe(0.9);
  });
});

describe('altar effects', () => {
  it('every altar room gets an effect', () => {
    const map = generateFloor({ floor: 1, seed: 11 });
    for (const c of map.cells.filter((c) => c.type === 'altar')) expect(c.altarEffect).toBeTruthy();
  });
  it('modify computed stats', () => {
    const run = createPlayerRun(np('warrior'));
    const base = computeStats('warrior', run.equipment);
    const blessed = computeStats('warrior', run.equipment, ['bloodpact']);
    expect(blessed.atk).toBe(Math.round(base.atk * 1.2));
    expect(blessed.maxHp).toBe(Math.round(base.maxHp * 0.85));
    const iron = computeStats('warrior', run.equipment, ['ironoath']);
    expect(iron.def).toBe(base.def + 3);
  });
});

describe('save migration', () => {
  it('drops saves from older versions', () => {
    const run = createRun([np('mage')], 5, 'p1');
    expect(migrateRun(run)).toBe(run);
    expect(migrateRun({ ...run, version: 3 })).toBeNull();
  });
});

describe('simulation (multiplayer)', () => {
  const setup = (roomType: 'mob' | 'empty') => {
    const run = createRun([np('warrior', 'a'), np('mage', 'b')], 3, 'a');
    const room = run.map.cells.find((c) => c.type === roomType && Object.keys(neighbors(run.map, c.id)).length > 0)!;
    const sim: Sim = { run, world: createWorld(run, room.id, null, new Set(['a', 'b'])), moves: {}, events: [] };
    return { sim, room };
  };

  it('changes room only when all alive players are at the same edge', () => {
    const { sim, room } = setup('empty');
    const [dir] = Object.keys(neighbors(sim.run.map, room.id));
    const edge = (p: PlayerEntity) => {
      if (dir === 'up') p.y = ROOM_BOUNDS.top + 10;
      if (dir === 'down') p.y = ROOM_BOUNDS.bottom - 10;
      if (dir === 'left') p.x = ROOM_BOUNDS.left + 10;
      if (dir === 'right') p.x = ROOM_BOUNDS.right - 10;
    };
    edge(sim.world.players.a);
    stepSim(sim, 0.016);
    expect(sim.world.roomId).toBe(room.id);
    edge(sim.world.players.b);
    stepSim(sim, 0.016);
    expect(sim.world.roomId).not.toBe(room.id);
  });

  it('a dead player does not block the transition and revives in the next room', () => {
    const { sim, room } = setup('empty');
    const [dir] = Object.keys(neighbors(sim.run.map, room.id));
    sim.world.players.b.dead = true;
    const a = sim.world.players.a;
    if (dir === 'up') a.y = ROOM_BOUNDS.top + 10;
    if (dir === 'down') a.y = ROOM_BOUNDS.bottom - 10;
    if (dir === 'left') a.x = ROOM_BOUNDS.left + 10;
    if (dir === 'right') a.x = ROOM_BOUNDS.right - 10;
    stepSim(sim, 0.016);
    expect(sim.world.roomId).not.toBe(room.id);
    expect(sim.world.players.b.dead).toBe(false);
    expect(sim.world.players.b.hp).toBeGreaterThan(0);
  });

  it('gives kill gold to every player and revives the fallen when the room is cleared', () => {
    const { sim } = setup('mob');
    const goldA = sim.run.players.a.gold;
    const goldB = sim.run.players.b.gold;
    sim.world.players.b.dead = true;
    for (const e of sim.world.enemies) hitEnemy(sim, 'a', e, 99999, 0, false);
    stepSim(sim, 0.016);
    expect(sim.run.players.a.gold).toBeGreaterThan(goldA);
    expect(sim.run.players.b.gold - goldB).toBe(sim.run.players.a.gold - goldA);
    expect(sim.world.players.b.dead).toBe(false);
    expect(sim.run.map.cells[sim.world.roomId].type).toBe('empty');
  });

  it('ends in defeat when every connected player is down', () => {
    const { sim } = setup('mob');
    sim.world.players.a.dead = true;
    sim.world.players.b.dead = true;
    stepSim(sim, 0.016);
    expect(sim.world.ending?.victory).toBe(false);
  });

  it('scales enemy hp with player count', () => {
    const run1 = createRun([np('warrior', 'a')], 3, 'a');
    const run2 = createRun([np('warrior', 'a'), np('mage', 'b')], 3, 'a');
    const mob = run1.map.cells.find((c) => c.type === 'mob')!.id;
    const w1 = createWorld(run1, mob, null, new Set(['a']));
    const w2 = createWorld(run2, mob, null, new Set(['a', 'b']));
    const ratio = (w: typeof w1) => w.enemies[0].maxHp / ENEMIES[w.enemies[0].defId].maxHp;
    expect(ratio(w2) / ratio(w1)).toBeCloseTo(1.6, 1);
  });

  it('buy action only works in a shop room for items it sells', () => {
    const run = createRun([np('warrior', 'a')], 3, 'a');
    const sim: Sim = { run, world: createWorld(run, run.map.startId, null, new Set(['a'])), moves: {}, events: [] };
    const item = run.map.cells[run.map.startId].shopStock!.find((id) => id.startsWith('potion:'))!;
    run.players.a.gold = 1000;
    applyAction(sim, 'a', { k: 'buy', item });
    expect(run.players.a.potions[0]).toBe(item.slice('potion:'.length));
    applyAction(sim, 'a', { k: 'buy', item: 'not_sold_here' });
    expect(run.players.a.gold).toBe(1000 - resolveShopItem(item)!.price);
  });
});
