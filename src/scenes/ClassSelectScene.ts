import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { computeStats } from '../core/stats';
import { emptyEquipment } from '../core/runState';
import { CLASS_IDS, type ClassId } from '../core/types';
import { t } from '../i18n';
import { net } from '../net/client';
import { loadGame } from '../save/storage';
import { Button } from '../ui/Button';
import { renderSkillList } from '../ui/classDetail';
import { isPhone } from '../ui/device';
import { addText } from '../ui/text';
import { SCENES } from './keys';

export class ClassSelectScene extends Phaser.Scene {
  private selected: ClassId = 'warrior';
  private cards = new Map<ClassId, Phaser.GameObjects.Rectangle>();
  private detail!: Phaser.GameObjects.Container;

  constructor() {
    super(SCENES.classSelect);
  }

  create() {
    const { width, height } = GAME_CONFIG;
    addText(this, width / 2, 48, t('classSelect.title'), 36).setOrigin(0.5);

    const cardW = 150;
    const gap = 14;
    const startX = width / 2 - ((cardW + gap) * CLASS_IDS.length - gap) / 2 + cardW / 2;
    CLASS_IDS.forEach((id, i) => {
      const def = CLASSES[id];
      const x = startX + i * (cardW + gap);
      const card = this.add.rectangle(x, 150, cardW, 110, THEME.panel).setStrokeStyle(2, THEME.panelBorder);
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(id));
      this.add.circle(x, 128, 18, def.color);
      addText(this, x, 168, t(def.nameKey), 20).setOrigin(0.5);
      addText(this, x, 192, t(`attackStyle.${def.attackStyle}`), 13, THEME.textDim).setOrigin(0.5);
      this.cards.set(id, card);
    });

    this.add.rectangle(width / 2, 432, width - 120, 364, THEME.panel).setStrokeStyle(2, THEME.panelBorder);
    this.detail = this.add.container(0, 0);

    new Button(this, width / 2 - 130, height - 50, t('classSelect.back'), () => this.scene.start(SCENES.menu), {
      width: 200,
    });
    new Button(this, width / 2 + 130, height - 50, t('classSelect.start'), () => net.startSolo(this.selected), {
      width: 200,
      color: THEME.accent,
    });
    if (loadGame()) {
      addText(this, width / 2, height - 88, t('classSelect.overwriteWarn'), 14, THEME.textRed).setOrigin(0.5);
    }

    this.select(this.selected);
  }

  private select(id: ClassId) {
    this.selected = id;
    for (const [cid, card] of this.cards) {
      card.setStrokeStyle(cid === id ? 3 : 2, cid === id ? THEME.gold : THEME.panelBorder);
    }
    this.renderDetail(id);
  }

  private renderDetail(id: ClassId) {
    this.detail.removeAll(true);
    const def = CLASSES[id];
    const stats = computeStats(id, emptyEquipment());
    const left = 90;
    let y = 270;

    // 依實際文字高度往下排（手機版字比較大）
    const line = (x: number, text: string, size = 16, color: string = THEME.text, gap = 10) => {
      const obj = addText(this, x, y, text, size, color, { wordWrap: { width: 430 } });
      this.detail.add(obj);
      y = obj.y + obj.height + gap;
      return obj;
    };

    line(left, `${t(def.nameKey)}  —  ${t(def.roleKey)}`, 24, THEME.text, 12);
    line(left, `${t('classSelect.attack')}：${t(`attackStyle.${def.attackStyle}`)}  /  ${def.attackRange}px  /  ${def.attackInterval}s`);
    const statKeys = ['maxHp', 'maxMp', 'atk', 'def', 'moveSpeed'] as const;
    line(left, statKeys.map((k) => `${t(`stat.${k}`)} ${stats[k]}`).join('   '), 15, THEME.textDim, 16);
    line(left, t('classSelect.levelHint'), 13, THEME.textDim);

    // 右欄：被動與技能說明（各等級數值以 / 分隔）
    renderSkillList(this, this.detail, id, 560, 262, 620, isPhone());
  }
}
