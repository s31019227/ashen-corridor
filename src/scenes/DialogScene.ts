import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { Button } from '../ui/Button';
import { addBackdrop, addPanel } from '../ui/Panel';
import { addText } from '../ui/text';
import { net } from '../net/client';
import { SCENES } from './keys';

export interface DialogData {
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
}

/** 通用確認對話框 */
export class DialogScene extends Phaser.Scene {
  private data_!: DialogData;

  constructor() {
    super(SCENES.dialog);
  }

  init(data: DialogData) {
    this.data_ = data;
  }

  create() {
    const { width, height } = GAME_CONFIG;
    const d = this.data_;
    addBackdrop(this, 0.6, () => this.close(false));
    // 面板高度依文字行數調整
    const text = addText(this, width / 2, 0, d.message, 20, THEME.text, {
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: 520 },
    }).setOrigin(0.5, 0);
    const panelH = text.height + 150;
    const top = height / 2 - panelH / 2;
    addPanel(this, width / 2, height / 2, 600, panelH);
    text.setY(top + 40).setDepth(1);
    const btnY = top + panelH - 50;
    new Button(this, width / 2 - 110, btnY, d.cancelText, () => this.close(false), { width: 180 });
    new Button(this, width / 2 + 110, btnY, d.confirmText, () => this.close(true), {
      width: 180,
      color: THEME.accent,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close(false));
  }

  private close(confirmed: boolean) {
    net.popUi();
    this.scene.stop();
    if (confirmed) this.data_.onConfirm();
  }
}
