import Phaser from 'phaser';
import type { TelegraphShape } from '../config/enemies';
import { THEME } from '../config/theme';
import { dist, pointSegmentDist } from '../core/geometry';
import type { Vec2 } from '../core/types';

export interface TelegraphSpec {
  shape: TelegraphShape;
  x: number;
  y: number;
  /** circle：半徑；line：寬度 */
  size: number;
  /** line：長度 */
  length?: number;
  /** line：方向（弧度） */
  angle?: number;
  warnTime: number;
  damage: number;
}

/** 紅色預警區：時間到才判定命中 */
export class Telegraph {
  private gfx: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  done = false;

  constructor(
    private scene: Phaser.Scene,
    readonly spec: TelegraphSpec,
  ) {
    this.gfx = scene.add.graphics().setDepth(2);
    this.draw();
  }

  /** 推進時間，預警結束的那一幀回傳 true */
  update(dt: number): boolean {
    if (this.done) return false;
    this.elapsed += dt;
    if (this.elapsed >= this.spec.warnTime) {
      this.done = true;
      this.flash();
      return true;
    }
    this.draw();
    return false;
  }

  hits(p: Vec2, radius: number): boolean {
    const s = this.spec;
    if (s.shape === 'circle') return dist(p, s) <= s.size + radius;
    const a = s.angle ?? 0;
    const len = s.length ?? 0;
    const end = { x: s.x + Math.cos(a) * len, y: s.y + Math.sin(a) * len };
    return pointSegmentDist(p, s, end) <= s.size / 2 + radius;
  }

  /** 畫出形狀；fillProgress 為內層填滿比例 */
  private paint(outerAlpha: number, innerAlpha: number, fillProgress: number, color: number = THEME.telegraph) {
    const s = this.spec;
    const g = this.gfx;
    g.clear();
    if (s.shape === 'circle') {
      g.fillStyle(color, outerAlpha).fillCircle(s.x, s.y, s.size);
      g.lineStyle(2, color, 0.7).strokeCircle(s.x, s.y, s.size);
      g.fillStyle(color, innerAlpha).fillCircle(s.x, s.y, s.size * fillProgress);
      return;
    }
    const len = s.length ?? 0;
    g.save();
    g.translateCanvas(s.x, s.y);
    g.rotateCanvas(s.angle ?? 0);
    g.fillStyle(color, outerAlpha).fillRect(0, -s.size / 2, len, s.size);
    g.lineStyle(2, color, 0.7).strokeRect(0, -s.size / 2, len, s.size);
    g.fillStyle(color, innerAlpha).fillRect(0, -s.size / 2, len * fillProgress, s.size);
    g.restore();
  }

  private draw() {
    this.paint(0.12, 0.3, Math.min(1, this.elapsed / this.spec.warnTime));
  }

  private flash() {
    this.paint(0.5, 0.3, 1, 0xff6040);
    this.scene.tweens.add({ targets: this.gfx, alpha: 0, duration: 250, onComplete: () => this.gfx.destroy() });
  }

  destroy() {
    this.gfx.destroy();
  }
}
