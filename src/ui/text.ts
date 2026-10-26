import Phaser from 'phaser';
import { THEME } from '../config/theme';

export function textStyle(size = 18, color = THEME.text, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return { fontFamily: THEME.font, fontSize: `${size}px`, color, ...extra } as Phaser.Types.GameObjects.Text.TextStyle;
}

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 18,
  color: string = THEME.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
) {
  return scene.add.text(x, y, text, textStyle(size, color, extra));
}

/** 浮動文字（傷害、提示），往上飄後消失 */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string = THEME.text, size = 18) {
  const label = addText(scene, x, y, text, size, color, { stroke: '#000000', strokeThickness: 3 })
    .setOrigin(0.5)
    .setDepth(1000);
  scene.tweens.add({
    targets: label,
    y: y - 40,
    alpha: 0,
    duration: 800,
    ease: 'Cubic.easeOut',
    onComplete: () => label.destroy(),
  });
}
