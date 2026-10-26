import Phaser from 'phaser';
import { THEME } from '../config/theme';
import { textStyle } from './text';

/** 場景建立後多久內忽略點擊（毫秒） */
export const CLICK_GUARD_MS = 250;

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  color?: number;
  textColor?: string;
}

/** 色塊按鈕。點擊時停止事件往下層場景傳遞。 */
export class Button extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private baseColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    const w = opts.width ?? 220;
    const h = opts.height ?? 52;
    this.baseColor = opts.color ?? THEME.button;
    this.bg = scene.add.rectangle(0, 0, w, h, this.baseColor).setStrokeStyle(2, THEME.panelBorder);
    this.label = scene.add
      .text(0, 0, text, textStyle(opts.fontSize ?? 20, opts.textColor ?? THEME.text, { align: 'center' }))
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    // 場景剛建立時忽略點擊，避免上一個畫面的同一次點擊穿透過來
    const createdAt = scene.time.now;
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => this.enabled && this.bg.setFillStyle(THEME.buttonHover));
    this.bg.on('pointerout', () => this.bg.setFillStyle(this.enabled ? this.baseColor : THEME.buttonDisabled));
    this.bg.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (this.enabled && scene.time.now - createdAt > CLICK_GUARD_MS) onClick();
      },
    );
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.bg.setFillStyle(enabled ? this.baseColor : THEME.buttonDisabled);
    this.label.setAlpha(enabled ? 1 : 0.5);
    return this;
  }

  setText(text: string) {
    this.label.setText(text);
    return this;
  }
}
