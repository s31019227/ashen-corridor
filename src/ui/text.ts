import Phaser from 'phaser';
import { THEME } from '../config/theme';
import { isPhone, PHONE_FONT_SCALE } from './device';

const FONT_SCALE = isPhone() ? PHONE_FONT_SCALE : 1;

/** 實際字級：手機上放大，最多只多放大 20px 的部分，標題不會過大 */
export function fontPx(size: number): number {
  return Math.round(size + (FONT_SCALE - 1) * Math.min(size, 20));
}

export function textStyle(size = 18, color = THEME.text, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return { fontFamily: THEME.font, fontSize: `${fontPx(size)}px`, color, ...extra } as Phaser.Types.GameObjects.Text.TextStyle;
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
