import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import type { ClassId } from '../core/types';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { addText } from '../ui/text';
import { startNewRun } from './flow';
import { SCENES } from './keys';

interface ResultData {
  victory: boolean;
  kills: number;
  gold: number;
  floor: number;
  classId?: ClassId;
}

/** 結算畫面（通關或死亡） */
export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() {
    super(SCENES.result);
  }

  init(data: ResultData) {
    this.result = data;
  }

  create() {
    const { width, height } = GAME_CONFIG;
    const r = this.result;
    this.cameras.main.fadeIn(400, 0, 0, 0);

    addText(this, width / 2, height / 2 - 150, r.victory ? t('result.victory', { floor: r.floor }) : t('result.defeat'), 48, r.victory ? THEME.textGold : THEME.textRed, {
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);
    addText(this, width / 2, height / 2 - 50, t('result.kills', { kills: r.kills }), 24).setOrigin(0.5);
    addText(this, width / 2, height / 2, t('result.gold', { gold: r.gold }), 24, THEME.textGold).setOrigin(0.5);

    const classId = r.classId;
    const restart = new Button(this, width / 2 - 130, height / 2 + 120, t('result.restart'), () => {
      if (classId) startNewRun(this, classId);
    }, { width: 220, color: THEME.accent });
    if (!classId) restart.setEnabled(false);
    new Button(this, width / 2 + 130, height / 2 + 120, t('result.menu'), () => this.scene.start(SCENES.menu), {
      width: 220,
    });
  }
}
