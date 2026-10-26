import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { t } from '../i18n';
import { loadRun } from '../save/storage';
import { Button } from '../ui/Button';
import { addText } from '../ui/text';
import { continueRun } from './flow';
import { SCENES } from './keys';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.menu);
  }

  create() {
    const cx = GAME_CONFIG.width / 2;
    this.drawBackground();

    addText(this, cx, 170, t('game.title'), 72, THEME.text, { stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    addText(this, cx, 240, t('game.subtitle'), 20, THEME.textDim).setOrigin(0.5);

    const saved = loadRun();
    let y = 340;
    new Button(this, cx, y, t('menu.newGame'), () => this.scene.start(SCENES.classSelect));
    y += 72;
    const cont = new Button(this, cx, y, t('menu.continue'), () => continueRun(this));
    if (saved) {
      addText(
        this,
        cx,
        y + 38,
        t('menu.continueInfo', { class: t(CLASSES[saved.classId].nameKey), floor: saved.floor, gold: saved.gold }),
        14,
        THEME.textDim,
      ).setOrigin(0.5);
      y += 24;
    } else {
      cont.setEnabled(false);
    }
    y += 72;
    new Button(this, cx, y, t('menu.settings'), () => {
      this.scene.pause();
      this.scene.launch(SCENES.settings, { from: SCENES.menu });
    });
  }

  private drawBackground() {
    const g = this.add.graphics();
    // 簡單的餘燼粒子當作氛圍
    for (let i = 0; i < 60; i++) {
      const ember = this.add.circle(
        Phaser.Math.Between(0, GAME_CONFIG.width),
        Phaser.Math.Between(0, GAME_CONFIG.height),
        Phaser.Math.Between(1, 3),
        0xc0502a,
        Phaser.Math.FloatBetween(0.2, 0.6),
      );
      this.tweens.add({
        targets: ember,
        y: ember.y - Phaser.Math.Between(80, 200),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 7000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
      });
    }
    g.fillStyle(THEME.accent, 0.15).fillRect(0, GAME_CONFIG.height - 6, GAME_CONFIG.width, 6);
  }
}
