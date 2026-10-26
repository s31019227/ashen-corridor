import Phaser from 'phaser';
import type { Vec2 } from '../core/types';

/**
 * 虛擬搖桿：在指定區域內按下即以按下點為中心出現搖桿。
 * value 為 -1~1 的方向向量。
 */
export class VirtualJoystick {
  readonly value: Vec2 = { x: 0, y: 0 };
  private pointerId: number | null = null;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private zone: Phaser.GameObjects.Zone;
  private center: Vec2;

  constructor(
    scene: Phaser.Scene,
    area: Phaser.Geom.Rectangle,
    private home: Vec2,
    private radius = 70,
  ) {
    this.center = { ...home };
    this.base = scene.add.circle(home.x, home.y, radius, 0xffffff, 0.08).setStrokeStyle(2, 0xffffff, 0.25).setDepth(500);
    this.knob = scene.add.circle(home.x, home.y, radius * 0.45, 0xffffff, 0.25).setDepth(501);
    this.zone = scene.add.zone(area.x, area.y, area.width, area.height).setOrigin(0).setInteractive();

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== null) return;
      this.pointerId = p.id;
      this.center = { x: p.x, y: p.y };
      this.base.setPosition(p.x, p.y);
      this.knob.setPosition(p.x, p.y);
      this.base.setAlpha(1);
    });
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once('shutdown', () => {
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.center.x;
    const dy = p.y - this.center.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, this.radius);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    this.knob.setPosition(this.center.x + nx * clamped, this.center.y + ny * clamped);
    const strength = len < 8 ? 0 : clamped / this.radius;
    this.value.x = nx * strength;
    this.value.y = ny * strength;
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.base.setPosition(this.home.x, this.home.y);
    this.knob.setPosition(this.home.x, this.home.y);
  }

  setVisible(visible: boolean) {
    this.base.setVisible(visible);
    this.knob.setVisible(visible);
    if (visible) this.zone.setInteractive();
    else this.zone.disableInteractive();
  }
}
