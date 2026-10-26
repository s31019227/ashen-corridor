import Phaser from 'phaser';
import type { EnemySkillDef } from '../config/enemies';
import { calcDamage } from '../core/damage';
import { clamp, dist, edgeDist } from '../core/geometry';
import type { RoomBounds } from '../core/roomTransition';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { Telegraph } from '../entities/Telegraph';

/** 怪物 AI 與技能預警 */
export class EnemySystem {
  private telegraphs: Telegraph[] = [];

  constructor(
    private scene: Phaser.Scene,
    private player: Player,
    private bounds: RoomBounds,
  ) {}

  update(enemies: Enemy[], dt: number) {
    const alive = enemies.filter((e) => e.alive);
    for (const e of alive) this.updateEnemy(e, dt);
    this.separate(alive);
    for (const e of alive) {
      e.x = clamp(e.x, this.bounds.left + e.radius, this.bounds.right - e.radius);
      e.y = clamp(e.y, this.bounds.top + e.radius, this.bounds.bottom - e.radius);
      e.sync();
    }
    this.updateTelegraphs(dt);
  }

  private updateEnemy(e: Enemy, dt: number) {
    const p = this.player;
    e.attackCd.tick(dt);
    for (const cd of e.skillCds) cd.tick(dt);

    if (e.knockedBack) {
      e.applyKnockback(dt);
      return;
    }
    if (e.castLock > 0) {
      e.castLock -= dt;
      return;
    }

    // 技能：冷卻好且在施放距離內就施放
    const d = dist(e, p);
    for (let i = 0; i < e.def.skills.length; i++) {
      const skill = e.def.skills[i];
      if (e.skillCds[i].ready && d <= skill.castRange) {
        this.cast(e, skill);
        e.skillCds[i].trigger();
        return;
      }
    }

    // 移動
    const gap = edgeDist(e, e.radius, p, p.radius);
    const dx = (p.x - e.x) / (d || 1);
    const dy = (p.y - e.y) / (d || 1);
    const speed = e.def.moveSpeed * dt;
    if (e.def.behavior === 'caster') {
      const preferred = e.def.preferredDistance ?? 200;
      if (d < preferred - 40) {
        e.x -= dx * speed;
        e.y -= dy * speed;
      } else if (d > preferred + 40) {
        e.x += dx * speed;
        e.y += dy * speed;
      } else {
        e.x += -dy * speed * 0.5 * e.strafe;
        e.y += dx * speed * 0.5 * e.strafe;
        if (Math.random() < dt * 0.3) e.strafe *= -1;
      }
    } else if (gap > e.def.attackRange) {
      e.x += dx * speed;
      e.y += dy * speed;
    }

    // 接觸攻擊
    if (gap <= e.def.attackRange + 2 && e.attackCd.ready) {
      e.attackCd.trigger();
      p.takeDamage(calcDamage(e.def.atk, p.stats.def));
    }
  }

  private cast(e: Enemy, skill: EnemySkillDef) {
    const p = this.player;
    const fromSelf = skill.origin === 'self';
    const angle = Math.atan2(p.y - e.y, p.x - e.x);
    const tg = new Telegraph(this.scene, {
      shape: skill.shape,
      x: fromSelf ? e.x : p.x,
      y: fromSelf ? e.y : p.y,
      size: skill.size,
      length: skill.length,
      angle,
      warnTime: skill.warnTime,
      damage: skill.damage,
    });
    this.telegraphs.push(tg);
    // 以自身為起點的技能：施放期間站著不動，給玩家躲避的機會
    if (fromSelf) e.castLock = skill.warnTime;
  }

  private updateTelegraphs(dt: number) {
    const p = this.player;
    for (const tg of this.telegraphs) {
      if (tg.update(dt) && tg.hits(p, p.radius)) {
        p.takeDamage(calcDamage(tg.spec.damage, p.stats.def), true);
      }
    }
    this.telegraphs = this.telegraphs.filter((tg) => !tg.done);
  }

  /** 怪物之間互相推開，避免疊在一起 */
  private separate(enemies: Enemy[]) {
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i];
        const b = enemies[j];
        const overlap = -edgeDist(a, a.radius, b, b.radius);
        if (overlap <= 0) continue;
        const d = dist(a, b) || 1;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;
      }
    }
  }

  /** 清除所有預警（Boss 死亡或換格時） */
  clear() {
    for (const tg of this.telegraphs) tg.destroy();
    this.telegraphs = [];
  }
}
