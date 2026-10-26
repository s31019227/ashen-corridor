import Phaser from 'phaser';
import type { EnemyDef } from '../config/enemies';
import { THEME } from '../config/theme';
import { Cooldown } from '../core/cooldown';
import type { DifficultyScale } from '../core/difficulty';
import type { Vec2 } from '../core/types';

export class Enemy {
  readonly view: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private hpFill: Phaser.GameObjects.Rectangle;
  private hpWidth: number;

  hp: number;
  /** 依難度調整後的數值 */
  readonly maxHp: number;
  readonly atk: number;
  /** 技能傷害倍率（難度） */
  readonly damageMult: number;
  alive = true;
  readonly attackCd: Cooldown;
  readonly skillCds: Cooldown[];
  /** 施放以自身為起點的技能時原地停留的剩餘秒數 */
  castLock = 0;
  private knock = { vx: 0, vy: 0, t: 0 };
  /** caster 側移方向 */
  strafe = Math.random() < 0.5 ? 1 : -1;

  constructor(
    scene: Phaser.Scene,
    readonly id: number,
    readonly def: EnemyDef,
    public x: number,
    public y: number,
    scale: DifficultyScale = { hp: 1, atk: 1, gold: 1 },
  ) {
    this.maxHp = Math.round(def.maxHp * scale.hp);
    this.atk = Math.round(def.atk * scale.atk);
    this.damageMult = scale.atk;
    this.hp = this.maxHp;
    this.attackCd = new Cooldown(def.attackInterval);
    this.attackCd.trigger(def.attackInterval * 0.5);
    // 技能冷卻從部分開始，避免一進格子就同時放技能
    this.skillCds = def.skills.map((s) => {
      const cd = new Cooldown(s.cooldown);
      cd.trigger(s.cooldown * (0.4 + Math.random() * 0.4));
      return cd;
    });

    const r = def.radius;
    this.hpWidth = Math.max(30, r * 2);
    this.body = scene.add.circle(0, 0, r, def.color).setStrokeStyle(2, 0x1a0a0a);
    const hpBg = scene.add.rectangle(-this.hpWidth / 2, -r - 10, this.hpWidth, 5, THEME.barBg).setOrigin(0, 0.5);
    this.hpFill = scene.add.rectangle(-this.hpWidth / 2, -r - 10, this.hpWidth, 5, THEME.hp).setOrigin(0, 0.5);
    this.view = scene.add.container(x, y, [this.body, hpBg, this.hpFill]).setDepth(5);
    // 點擊範圍比身體大一點，手機比較好點
    const hit = r + 10;
    this.view.setInteractive(new Phaser.Geom.Circle(0, 0, hit), Phaser.Geom.Circle.Contains);
  }

  get radius() {
    return this.def.radius;
  }

  /** 擊退：在 0.15 秒內被推開 distance 像素（Boss 不受擊退） */
  knockback(from: Vec2, distance: number) {
    if (distance <= 0 || this.def.behavior === 'boss') return;
    const dx = this.x - from.x;
    const dy = this.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const duration = 0.15;
    this.knock = { vx: (dx / len) * (distance / duration), vy: (dy / len) * (distance / duration), t: duration };
  }

  get knockedBack() {
    return this.knock.t > 0;
  }

  applyKnockback(dt: number) {
    const step = Math.min(dt, this.knock.t);
    this.x += this.knock.vx * step;
    this.y += this.knock.vy * step;
    this.knock.t -= step;
  }

  takeDamage(amount: number) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.body.setFillStyle(0xffffff);
    this.view.scene.time.delayedCall(60, () => this.body.setFillStyle(this.def.color));
    if (this.hp <= 0) this.alive = false;
  }

  sync() {
    this.view.setPosition(this.x, this.y);
    this.hpFill.width = this.hpWidth * (this.hp / this.maxHp);
  }

  destroy() {
    const view = this.view;
    view.disableInteractive();
    view.scene.tweens.add({ targets: view, alpha: 0, scale: 0.6, duration: 250, onComplete: () => view.destroy() });
  }
}
