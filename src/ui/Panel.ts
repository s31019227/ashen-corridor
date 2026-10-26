import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';

/** 全畫面半透明遮罩，吃掉點擊避免傳到下層 */
export function addBackdrop(scene: Phaser.Scene, alpha = 0.7, onClick?: () => void) {
  const { width, height } = GAME_CONFIG;
  const r = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, alpha).setInteractive();
  r.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    onClick?.();
  });
  return r;
}

export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const r = scene.add.rectangle(x, y, w, h, THEME.panel).setStrokeStyle(2, THEME.panelBorder);
  r.setInteractive(); // 讓面板本身吃掉點擊，不觸發背後的遮罩
  return r;
}
