import Phaser from 'phaser';

/** 追蹤目標的普攻投射物 */
export class Projectile {
  readonly view: Phaser.GameObjects.Arc;
  done = false;

  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
    readonly targetId: number,
    readonly damage: number,
    readonly knockback: number,
    readonly speed: number,
    color: number,
  ) {
    this.view = scene.add.circle(x, y, 5, color).setStrokeStyle(1, 0xffffff).setDepth(8);
  }

  /** 朝目標移動，碰到時回傳 true */
  step(target: { x: number; y: number; radius: number }, dt: number): boolean {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const d = Math.hypot(dx, dy);
    const move = this.speed * dt;
    if (d <= target.radius + move) return true;
    this.x += (dx / d) * move;
    this.y += (dy / d) * move;
    this.view.setPosition(this.x, this.y);
    return false;
  }

  destroy() {
    this.done = true;
    this.view.destroy();
  }
}
