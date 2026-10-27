import { GAME_CONFIG } from '../config/game';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { PLAYER_CONFIG } from '../config/player';
import { cdTick } from '../core/cooldown';
import { markCleared, neighbors } from '../core/mapGen';
import { canTransition } from '../core/roomTransition';
import { triggerInteract } from './actions';
import { hpLock, moveSpeed, tickPlayerTimers } from './effects';
import { updateToggles } from '../systems/SkillSystem';
import { updatePlayerAttacks } from './combat';
import { updateEnemies } from './enemies';
import type { PlayerEntity, Sim } from './types';
import { INTERACT_POS, ROOM_BOUNDS, createWorld, isCombatRoom, syncRunFromWorld } from './world';

const R = PLAYER_CONFIG.radius;

/** 推進模擬 dt 秒（房主呼叫；單人模式也是同一套） */
export function stepSim(sim: Sim, dt: number) {
  const w = sim.world;
  if (w.ending) {
    w.ending.delay -= dt;
    return;
  }
  movePlayers(sim, dt);
  updateRevives(sim, dt);
  // 戰鬥時間：本格有人造成過傷害、而且還有怪物時才累計
  if (Object.keys(sim.world.damage).length > 0 && isCombatRoom(sim.run, sim.world.roomId)) {
    sim.world.combatTime += dt;
    sim.run.floorCombatTime += dt;
  }
  updatePlayerAttacks(sim, dt);
  updateEnemies(sim, dt);
  updateInteractables(sim);
  checkCleared(sim);
  checkDefeat(sim);
  if (!sim.world.ending) checkTransition(sim);
  // 血量鎖定（戰士大招）：鎖定期間血量固定，治療與扣血都不會改變
  for (const p of Object.values(sim.world.players)) {
    const lock = hpLock(p);
    if (lock !== null && !p.dead) p.hp = lock;
  }
  syncRunFromWorld(sim);
}

function movePlayers(sim: Sim, dt: number) {
  for (const p of Object.values(sim.world.players)) {
    for (const cd of p.skillCds) cdTick(cd, dt);
    for (const cd of p.potionCds) cdTick(cd, dt);
    if (p.invuln > 0) p.invuln -= dt;
    tickPlayerTimers(sim, p, dt);
    if (!p.connected || p.dead) continue;
    updateToggles(sim, p, dt);
    p.mp = Math.min(p.stats.maxMp, p.mp + (p.stats.maxMp * p.stats.mpRegen * dt) / 100);
    const mv = sim.moves[p.id];
    if (!mv) continue;
    let { x, y } = mv;
    const len = Math.hypot(x, y);
    if (len < 0.01) continue;
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const b = ROOM_BOUNDS;
    const speed = moveSpeed(p);
    p.x = Math.max(b.left + R, Math.min(b.right - R, p.x + x * speed * dt));
    p.y = Math.max(b.top + R, Math.min(b.bottom - R, p.y + y * speed * dt));
    const l = Math.hypot(x, y);
    p.fx = x / l;
    p.fy = y / l;
  }
}

function updateInteractables(sim: Sim) {
  const type = sim.run.map.cells[sim.world.roomId].type;
  if (!['start', 'shop', 'altar', 'treasure', 'rest'].includes(type)) return;
  const r = GAME_CONFIG.room.interactRadius;
  for (const p of Object.values(sim.world.players)) {
    if (!p.connected || p.dead) continue;
    const d = Math.hypot(p.x - INTERACT_POS.x, p.y - INTERACT_POS.y);
    if (p.interactArmed && d <= r) {
      p.interactArmed = false;
      triggerInteract(sim, p.id);
    } else if (!p.interactArmed && d > r + 30) {
      p.interactArmed = true;
    }
  }
}

/** 復活：血量、魔力回到設定的比例，仇恨從零開始 */
export function revivePlayer(sim: Sim, p: PlayerEntity) {
  const { reviveHpPercent, reviveMpPercent } = MULTIPLAYER_CONFIG;
  p.dead = false;
  p.reviveProgress = 0;
  p.hp = Math.max(1, Math.round((p.stats.maxHp * reviveHpPercent) / 100));
  p.mp = Math.round((p.stats.maxMp * reviveMpPercent) / 100);
  p.invuln = 1;
  sim.events.push({ k: 'revive', pid: p.id });
}

/**
 * 墓碑復活：倒地的人原地變成墓碑，活著的隊友站在半徑 reviveRadius 的圈內累積進度，
 * 滿 reviveTime 秒就救起來；圈內沒人時每秒扣掉總進度的 reviveDecayPercentPerSec%。
 */
function updateRevives(sim: Sim, dt: number) {
  const { reviveRadius, reviveTime, reviveDecayPercentPerSec } = MULTIPLAYER_CONFIG;
  const players = Object.values(sim.world.players);
  for (const p of players) {
    if (!p.dead || !p.connected) continue;
    const helped = players.some(
      (o) => o !== p && o.connected && !o.dead && Math.hypot(o.x - p.x, o.y - p.y) <= reviveRadius,
    );
    if (helped) p.reviveProgress += dt;
    else p.reviveProgress = Math.max(0, p.reviveProgress - (reviveTime * reviveDecayPercentPerSec * dt) / 100);
    if (p.reviveProgress >= reviveTime) revivePlayer(sim, p);
  }
}

/** 戰鬥格清空：標記清除、倒地隊友復活；Boss 格清空則進入結算倒數 */
function checkCleared(sim: Sim) {
  const w = sim.world;
  if (!isCombatRoom(sim.run, w.roomId) || w.enemies.length > 0) return;
  const wasBoss = sim.run.map.cells[w.roomId].type === 'boss';
  markCleared(sim.run.map, w.roomId);
  w.telegraphs = [];
  sim.events.push({ k: 'cleared', roomId: w.roomId });
  for (const p of Object.values(w.players)) {
    sim.events.push({ k: 'toast', pid: p.id, key: 'hud.roomCleared', color: '#7fb069' });
    if (p.dead && p.connected) revivePlayer(sim, p);
  }
  if (wasBoss) w.ending = { victory: true, delay: 1.2 };
}

function checkDefeat(sim: Sim) {
  const online = Object.values(sim.world.players).filter((p) => p.connected);
  if (online.length > 0 && online.every((p) => p.dead)) sim.world.ending = { victory: false, delay: 0.8 };
}

/** 所有活著的玩家都靠近同一個有相鄰格的邊緣時換格 */
function checkTransition(sim: Sim) {
  const w = sim.world;
  const alive = Object.values(w.players).filter((p) => p.connected && !p.dead);
  const n = neighbors(sim.run.map, w.roomId);
  const dir = canTransition(alive, {
    cleared: !isCombatRoom(sim.run, w.roomId),
    bounds: ROOM_BOUNDS,
    threshold: GAME_CONFIG.room.edgeThreshold + R,
    neighbors: n,
  });
  if (!dir) return;
  syncRunFromWorld(sim);
  const connected = new Set(Object.values(w.players).filter((p) => p.connected).map((p) => p.id));
  sim.world = createWorld(sim.run, n[dir]!, dir, connected, w);
  sim.events.push({ k: 'room', roomId: sim.world.roomId, fromDir: dir });
}
