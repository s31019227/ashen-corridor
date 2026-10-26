import { BOSS_ID, ENEMIES, MOB_POOL } from '../config/enemies';
import { GAME_CONFIG } from '../config/game';
import { ROOM_EVENT_CONFIG } from '../config/map';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { cooldown, cdTrigger } from '../core/cooldown';
import { difficultyLevel, difficultyScale } from '../core/difficulty';
import { Rng, randomSeed } from '../core/rng';
import type { RoomBounds } from '../core/roomTransition';
import { playerStats, type PlayerRun, type RunState } from '../core/runState';
import { OPPOSITE_DIR, type Dir } from '../core/types';
import { CLASSES } from '../config/classes';
import type { EnemyEntity, PlayerEntity, Sim, World } from './types';

const m = GAME_CONFIG.room.margin;
export const ROOM_BOUNDS: RoomBounds = { left: m, top: m, right: GAME_CONFIG.width - m, bottom: GAME_CONFIG.height - m };
export const ROOM_CENTER = { x: GAME_CONFIG.width / 2, y: GAME_CONFIG.height / 2 };
/** 互動物件（商人、祭壇、寶箱、休息點）的位置 */
export const INTERACT_POS = { x: ROOM_CENTER.x, y: ROOM_CENTER.y - 60 };

export function isCombatRoom(run: RunState, roomId = run.currentRoomId): boolean {
  const cell = run.map.cells[roomId];
  return (cell.type === 'mob' || cell.type === 'boss') && !cell.cleared;
}

/** 進入格子時的出生點：往右走進來 → 出現在新格子左側；多人時稍微錯開 */
function spawnPoint(fromDir: Dir | null, index: number, count: number) {
  const b = ROOM_BOUNDS;
  const off = GAME_CONFIG.room.entrySpawnOffset;
  const spread = (index - (count - 1) / 2) * 64;
  if (!fromDir) return { x: ROOM_CENTER.x + spread, y: ROOM_CENTER.y + 120 };
  switch (OPPOSITE_DIR[fromDir]) {
    case 'up':
      return { x: ROOM_CENTER.x + spread, y: b.top + off };
    case 'down':
      return { x: ROOM_CENTER.x + spread, y: b.bottom - off };
    case 'left':
      return { x: b.left + off, y: ROOM_CENTER.y + spread };
    case 'right':
      return { x: b.right - off, y: ROOM_CENTER.y + spread };
  }
}

export function createPlayerEntity(p: PlayerRun, x: number, y: number, connected: boolean): PlayerEntity {
  const stats = playerStats(p);
  const def = CLASSES[p.classId];
  return {
    id: p.id,
    x,
    y,
    fx: 1,
    fy: 0,
    hp: Math.min(p.hp, stats.maxHp),
    mp: Math.min(p.mp, stats.maxMp),
    stats,
    dead: p.hp <= 0,
    connected,
    lockedId: null,
    targetId: null,
    lastAttackedId: null,
    attackCd: cooldown(def.attackInterval),
    skillCds: [...def.skills, def.ultimate].map((s) => cooldown(s.cooldown[0])),
    potionCds: p.potions.map(() => cooldown()),
    invuln: 0,
    interactArmed: true,
    buffs: [],
    toggles: {},
    toggleTick: 0,
    empower: null,
  };
}

/**
 * 建立新格子的模擬狀態。
 * prev：上一格的模擬狀態，用來沿用冷卻、連線狀態；倒地的玩家換格後以少量血量復活。
 */
export function createWorld(run: RunState, roomId: number, fromDir: Dir | null, connected: Set<string>, prev?: World): World {
  run.currentRoomId = roomId;
  const cell = run.map.cells[roomId];
  cell.visited = true;
  const world: World = {
    roomId,
    players: {},
    enemies: [],
    projectiles: [],
    telegraphs: [],
    nextId: 1,
    difficulty: difficultyScale(difficultyLevel(run.map)),
    ending: null,
  };

  const ids = Object.keys(run.players);
  const online = ids.filter((id) => connected.has(id));
  ids.forEach((id) => {
    const p = run.players[id];
    const old = prev?.players[id];
    if (old?.dead || p.hp <= 0) p.hp = Math.max(1, Math.round(playerStats(p).maxHp * MULTIPLAYER_CONFIG.reviveHpPercent / 100));
    const pos = spawnPoint(fromDir, Math.max(0, online.indexOf(id)), online.length);
    const e = createPlayerEntity(p, pos.x, pos.y, connected.has(id));
    if (old) {
      // 換格時沿用冷卻、buff、開關技能與強化狀態
      e.attackCd = old.attackCd;
      e.skillCds = old.skillCds;
      e.potionCds = old.potionCds;
      e.buffs = old.buffs;
      e.toggles = old.toggles;
      e.empower = old.empower;
    }
    world.players[id] = e;
  });

  if (isCombatRoom(run, roomId)) spawnEnemies(world, cell.type === 'boss', online.length);
  return world;
}

function spawnEnemies(world: World, boss: boolean, playerCount: number) {
  const rng = new Rng(randomSeed());
  const b = ROOM_BOUNDS;
  // 多人時怪物血量提高
  const hpMult = 1 + (MULTIPLAYER_CONFIG.enemyHpPerExtraPlayer / 100) * Math.max(0, playerCount - 1);
  const scale = { ...world.difficulty, hp: world.difficulty.hp * hpMult };
  if (boss) {
    world.enemies.push(makeEnemy(world, BOSS_ID, ROOM_CENTER.x, ROOM_CENTER.y, scale));
    return;
  }
  const players = Object.values(world.players).filter((p) => p.connected);
  const { enemyCountMin, enemyCountMax } = ROOM_EVENT_CONFIG.mob;
  const count = rng.int(enemyCountMin, enemyCountMax);
  for (let i = 0; i < count; i++) {
    const def = rng.weighted(MOB_POOL);
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = rng.int(b.left + 60, b.right - 60);
      y = rng.int(b.top + 60, b.bottom - 60);
      const far = players.every((p) => Math.hypot(x - p.x, y - p.y) >= GAME_CONFIG.room.enemySpawnMinDistance);
      if (far) break;
    }
    world.enemies.push(makeEnemy(world, def.id, x, y, scale));
  }
}

function makeEnemy(world: World, defId: string, x: number, y: number, scale: { hp: number; atk: number }): EnemyEntity {
  const def = ENEMIES[defId];
  const maxHp = Math.round(def.maxHp * scale.hp);
  const attackCd = cooldown(def.attackInterval);
  cdTrigger(attackCd, def.attackInterval * 0.5);
  return {
    id: world.nextId++,
    defId,
    x,
    y,
    hp: maxHp,
    maxHp,
    atk: Math.round(def.atk * scale.atk),
    damageMult: scale.atk,
    alive: true,
    attackCd,
    // 技能冷卻從部分開始，避免一進格子就同時放技能
    skillCds: def.skills.map((s) => {
      const cd = cooldown(s.cooldown);
      cdTrigger(cd, s.cooldown * (0.4 + Math.random() * 0.4));
      cd.duration = s.cooldown;
      return cd;
    }),
    castLock: 0,
    kvx: 0,
    kvy: 0,
    kt: 0,
    strafe: Math.random() < 0.5 ? 1 : -1,
  };
}

/** 裝備、祭壇變更後重算玩家數值 */
export function refreshPlayerStats(sim: Sim, pid: string) {
  const e = sim.world.players[pid];
  const p = sim.run.players[pid];
  if (!e || !p) return;
  e.stats = playerStats(p);
  e.hp = Math.min(e.hp, e.stats.maxHp);
  e.mp = Math.min(e.mp, e.stats.maxMp);
  // 藥水欄格數改變時（目前固定一格）補齊冷卻
  while (e.potionCds.length < p.potions.length) e.potionCds.push(cooldown());
}

/** 升級：重算數值，並回復增加的最大血魔 */
export function onLevelUp(sim: Sim, pid: string) {
  const e = sim.world.players[pid];
  const p = sim.run.players[pid];
  if (!e || !p) return;
  const before = e.stats;
  refreshPlayerStats(sim, pid);
  if (!e.dead) {
    e.hp = Math.min(e.stats.maxHp, e.hp + Math.max(0, e.stats.maxHp - before.maxHp));
    e.mp = Math.min(e.stats.maxMp, e.mp + Math.max(0, e.stats.maxMp - before.maxMp));
  }
  sim.events.push({ k: 'levelup', pid, level: p.level });
}

/** 把模擬中的血魔寫回存檔資料 */
export function syncRunFromWorld(sim: Sim) {
  for (const e of Object.values(sim.world.players)) {
    const p = sim.run.players[e.id];
    if (!p) continue;
    p.hp = e.dead ? 0 : Math.round(e.hp);
    p.mp = Math.round(e.mp);
  }
}

/** 新玩家或重新連線的玩家加入目前格子 */
export function addPlayerToWorld(sim: Sim, pid: string) {
  const p = sim.run.players[pid];
  if (!p) return;
  const existing = sim.world.players[pid];
  if (existing) {
    existing.connected = true;
    return;
  }
  const others = Object.values(sim.world.players).filter((o) => o.connected);
  const anchor = others[0] ?? { x: ROOM_CENTER.x, y: ROOM_CENTER.y + 120 };
  sim.world.players[pid] = createPlayerEntity(p, anchor.x + 30, anchor.y, true);
}
