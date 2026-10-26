import Phaser from 'phaser';
import { THEME } from '../config/theme';
import { textStyle } from './text';

/** 血條 / 魔力條 */
export class Bar extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Rectangle;
  private barWidth: number;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number) {
    super(scene, x, y);
    this.barWidth = w;
    const bg = scene.add.rectangle(0, 0, w, h, THEME.barBg).setOrigin(0, 0.5).setStrokeStyle(1, THEME.panelBorder);
    this.fill = scene.add.rectangle(0, 0, w, h, color).setOrigin(0, 0.5);
    this.label = scene.add.text(w / 2, 0, '', textStyle(Math.max(11, h - 6))).setOrigin(0.5);
    this.add([bg, this.fill, this.label]);
    scene.add.existing(this);
  }

  setValue(value: number, max: number, showText = true) {
    const ratio = max > 0 ? Phaser.Math.Clamp(value / max, 0, 1) : 0;
    this.fill.width = this.barWidth * ratio;
    this.label.setText(showText ? `${Math.ceil(value)} / ${max}` : '');
  }
}
