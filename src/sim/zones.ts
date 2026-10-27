import { PLAYER_CONFIG } from '../config/player';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { enemyRadius, hitEnemy } from './combat';
import { attackPower, heal } from './effects';
import { enemyDef } from './status';
import type { Sim, Zone } from './types';

// 地面範圍效果（箭雨、隕星、聖域…）。傷害以「結算當下」施放者的攻擊力計算。

export function addZone(sim: Sim, zone: Omit<Zone, 'id' | 'timer'>) {
  sim.world.zones.push({ ...zone, id: sim.world.nextId++, timer: -zone.delay });
}

export function updateZones(sim: Sim, dt: number) {
  for (const z of sim.world.zones) {
    z.timer += dt;
    while (z.timer >= 0 && z.ticks > 0) {
      z.timer -= z.interval;
      z.ticks--;
      tick(sim, z);
    }
  }
  sim.world.zones = sim.world.zones.filter((z) => z.ticks > 0);
}

function tick(sim: Sim, z: Zone) {
  const owner = sim.world.players[z.ownerId];
  if (!owner) return;
  sim.events.push({ k: 'aoe', x: z.x, y: z.y, r: z.r, color: z.color });
  if (z.kind === 'damage') {
    const atk = attackPower(sim, owner);
    for (const e of sim.world.enemies) {
      if (!e.alive || edgeDist(z, z.r, e, enemyRadius(e)) > 0) continue;
      hitEnemy(sim, owner.id, e, calcDamage((atk * z.amount) / 100, enemyDef(e)), 0, false);
    }
  } else {
    for (const p of Object.values(sim.world.players)) {
      if (!p.connected || p.dead || edgeDist(z, z.r, p, PLAYER_CONFIG.radius) > 0) continue;
      heal(sim, p, (p.stats.maxHp * z.amount) / 100, owner.id);
    }
  }
}
