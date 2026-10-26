import { ALTAR_EFFECTS } from '../config/altar';
import { MAP_CONFIG } from '../config/map';
import { EQUIPMENT } from '../config/equipment';
import { SHOP_CONFIG, potionItemId } from '../config/shop';
import { Rng } from './rng';
import { DIRS, DIR_DELTA, POTION_IDS, type Dir, type FloorMap, type MapCell, type RoomType } from './types';

export interface MapGenOptions {
  floor: number;
  seed: number;
  width?: number;
  height?: number;
  totalCells?: number;
}

const key = (x: number, y: number) => `${x},${y}`;

/** 取得某格在指定方向的相鄰格 id（沒有則為 undefined） */
export function neighborId(map: FloorMap, cellId: number, dir: Dir): number | undefined {
  const cell = map.cells[cellId];
  const { dx, dy } = DIR_DELTA[dir];
  return map.cells.find((c) => c.x === cell.x + dx && c.y === cell.y + dy)?.id;
}

export function neighbors(map: FloorMap, cellId: number): Partial<Record<Dir, number>> {
  const result: Partial<Record<Dir, number>> = {};
  for (const dir of DIRS) {
    const id = neighborId(map, cellId, dir);
    if (id !== undefined) result[dir] = id;
  }
  return result;
}

/** 從起點出發的 BFS 步數，無法到達的格子不會出現在結果中 */
export function bfsDistances(map: FloorMap, fromId: number): Map<number, number> {
  const distances = new Map<number, number>([[fromId, 0]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of Object.values(neighbors(map, id))) {
      if (next !== undefined && !distances.has(next)) {
        distances.set(next, distances.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  return distances;
}

export function isBossReachable(map: FloorMap): boolean {
  return bfsDistances(map, map.startId).has(map.bossId);
}

/** 長出一塊相連的格子形狀，回傳座標列表（第一個為起點） */
function growShape(rng: Rng, width: number, height: number, total: number): { x: number; y: number }[] {
  const start = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const chosen = [start];
  const taken = new Set([key(start.x, start.y)]);

  while (chosen.length < total) {
    // 收集所有可擴張的候選格，鄰居越少權重越高，讓地圖長出分支而不是一團
    const candidates: { x: number; y: number; weight: number }[] = [];
    const seen = new Set<string>();
    for (const c of chosen) {
      for (const dir of DIRS) {
        const nx = c.x + DIR_DELTA[dir].dx;
        const ny = c.y + DIR_DELTA[dir].dy;
        const k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || taken.has(k) || seen.has(k)) continue;
        seen.add(k);
        const takenNeighbors = DIRS.filter((d) => taken.has(key(nx + DIR_DELTA[d].dx, ny + DIR_DELTA[d].dy))).length;
        candidates.push({ x: nx, y: ny, weight: takenNeighbors === 1 ? 4 : 1 });
      }
    }
    if (candidates.length === 0) break;
    const pick = rng.weighted(candidates);
    chosen.push({ x: pick.x, y: pick.y });
    taken.add(key(pick.x, pick.y));
  }
  return chosen;
}

/** 隨機商品：裝備與藥水各自抽取，不保證有自己職業的武器 */
function rollShopStock(rng: Rng, cfg: { equipmentCount: number; potionCount: number; maxTier: number }): string[] {
  const equipment = rng.shuffle(Object.values(EQUIPMENT).filter((e) => e.tier <= cfg.maxTier).map((e) => e.id));
  const potions = rng.shuffle([...POTION_IDS]).map(potionItemId);
  return [...equipment.slice(0, cfg.equipmentCount), ...potions.slice(0, cfg.potionCount)];
}

function tryGenerate(rng: Rng, opts: Required<MapGenOptions>): FloorMap | null {
  const coords = growShape(rng, opts.width, opts.height, opts.totalCells);
  if (coords.length < opts.totalCells) return null;

  const cells: MapCell[] = coords.map((c, id) => ({
    id,
    x: c.x,
    y: c.y,
    type: 'empty',
    cleared: false,
    visited: false,
  }));
  const map: FloorMap = {
    floor: opts.floor,
    width: opts.width,
    height: opts.height,
    cells,
    startId: 0,
    bossId: 0,
  };

  // Boss 放在離起點最遠的格子，優先選死路
  const distances = bfsDistances(map, map.startId);
  const maxDist = Math.max(...distances.values());
  if (maxDist < MAP_CONFIG.minBossDistance) return null;
  const far = cells.filter((c) => distances.get(c.id) === maxDist);
  const deadEnds = far.filter((c) => Object.keys(neighbors(map, c.id)).length === 1);
  map.bossId = rng.pick(deadEnds.length > 0 ? deadEnds : far).id;

  cells[map.startId].type = 'start';
  cells[map.startId].visited = true;
  cells[map.startId].shopStock = rollShopStock(rng, SHOP_CONFIG.start);
  cells[map.bossId].type = 'boss';

  const { counts, specialTypes } = MAP_CONFIG;
  const types: RoomType[] = [];
  for (let i = 0; i < counts.shop - 1; i++) types.push('shop');
  for (let i = 0; i < counts.special; i++) types.push(specialTypes[i % specialTypes.length]);
  for (let i = 0; i < counts.mob; i++) types.push('mob');

  const rest = rng.shuffle(cells.filter((c) => c.id !== map.startId && c.id !== map.bossId));
  if (types.length > rest.length) return null;
  types.forEach((type, i) => {
    rest[i].type = type;
    if (type === 'shop') rest[i].shopStock = rollShopStock(rng, SHOP_CONFIG.general);
    if (type === 'altar') rest[i].altarEffect = rng.pick(ALTAR_EFFECTS).id;
  });

  if (!isBossReachable(map)) return null;
  return map;
}

/**
 * 生成一層地圖。保證起點可以走到 Boss，失敗時換一個亂數狀態重試。
 */
export function generateFloor(options: MapGenOptions): FloorMap {
  const opts: Required<MapGenOptions> = {
    width: MAP_CONFIG.gridWidth,
    height: MAP_CONFIG.gridHeight,
    totalCells: MAP_CONFIG.totalCells,
    ...options,
  };
  const rng = new Rng(opts.seed);
  for (let attempt = 0; attempt < MAP_CONFIG.maxGenAttempts; attempt++) {
    const map = tryGenerate(rng, opts);
    if (map) return map;
  }
  throw new Error(`Failed to generate floor ${opts.floor} with seed ${opts.seed}`);
}

/** 小怪格清空後變為空白格 */
export function markCleared(map: FloorMap, cellId: number) {
  const cell = map.cells[cellId];
  cell.cleared = true;
  if (cell.type === 'mob') cell.type = 'empty';
}
