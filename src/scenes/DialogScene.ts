import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { Button } from '../ui/Button';
import { addBackdrop, addPanel } from '../ui/Panel';
import { addText } from '../ui/text';
import { SCENES } from './keys';

export interface DialogData {
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  /** 關閉後要恢復的場景，預設為戰鬥場景 */
  resume?: string;
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
    addPanel(this, width / 2, height / 2, 560, 240);
    addText(this, width / 2, height / 2 - 40, d.message, 20, THEME.text, {
      align: 'center',
      wordWrap: { width: 480 },
    }).setOrigin(0.5);
    new Button(this, width / 2 - 110, height / 2 + 60, d.cancelText, () => this.close(false), { width: 180 });
    new Button(this, width / 2 + 110, height / 2 + 60, d.confirmText, () => this.close(true), {
      width: 180,
      color: THEME.accent,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close(false));
  }

  private close(confirmed: boolean) {
    this.scene.stop();
    this.scene.resume(this.data_.resume ?? SCENES.room);
    if (confirmed) this.data_.onConfirm();
  }
}
