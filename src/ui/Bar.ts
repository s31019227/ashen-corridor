import Phaser from 'phaser';
import { THEME } from '../config/theme';
import { textStyle } from './text';

/** 血條 / 魔力條 */
export class Bar extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Rectangle;
  /** 額外的量（護盾），接在主值後面 */
  private extraFill: Phaser.GameObjects.Rectangle;
  private barWidth: number;
  private label: Phaser.GameObjects.Text;

  /**
   * roundDown：數字無條件捨去（魔力用：4.6 要顯示 4，否則會看到 5 卻放不出耗魔 5 的技能）；
   * 預設無條件進位（血量用：0.4 血還活著時顯示 1）。
   */
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, private roundDown = false) {
    super(scene, x, y);
    this.barWidth = w;
    const bg = scene.add.rectangle(0, 0, w, h, THEME.barBg).setOrigin(0, 0.5).setStrokeStyle(1, THEME.panelBorder);
    this.fill = scene.add.rectangle(0, 0, w, h, color).setOrigin(0, 0.5);
    this.extraFill = scene.add.rectangle(0, 0, 0, h, 0xd8ecff, 0.85).setOrigin(0, 0.5);
    this.label = scene.add.text(w / 2, 0, '', textStyle(Math.max(11, h - 6))).setOrigin(0.5);
    this.add([bg, this.fill, this.extraFill, this.label]);
    scene.add.existing(this);
  }

  /** extra：接在後面的額外量（例如護盾），超過長度的部分不畫 */
  setValue(value: number, max: number, showText = true, extra = 0) {
    const ratio = max > 0 ? Phaser.Math.Clamp(value / max, 0, 1) : 0;
    this.fill.width = this.barWidth * ratio;
    const extraRatio = max > 0 ? Phaser.Math.Clamp(extra / max, 0, 1 - ratio) : 0;
    this.extraFill.x = this.fill.width;
    this.extraFill.width = this.barWidth * extraRatio;
    const shield = extra > 0 ? ` (+${Math.ceil(extra)})` : '';
    const shown = this.roundDown ? Math.floor(value) : Math.ceil(value);
    this.label.setText(showText ? `${shown} / ${max}${shield}` : '');
  }
}
