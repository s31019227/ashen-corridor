import Phaser from 'phaser';
import { CLASSES, type SkillDef } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { computeStats } from '../core/stats';
import { emptyEquipment } from '../core/runState';
import { CLASS_IDS, type ClassId } from '../core/types';
import { t } from '../i18n';
import { loadRun } from '../save/storage';
import { Button } from '../ui/Button';
import { addText } from '../ui/text';
import { startNewRun } from './flow';
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

    this.add.rectangle(width / 2, 430, width - 120, 330, THEME.panel).setStrokeStyle(2, THEME.panelBorder);
    this.detail = this.add.container(0, 0);

    new Button(this, width / 2 - 130, height - 50, t('classSelect.back'), () => this.scene.start(SCENES.menu), {
      width: 200,
    });
    new Button(this, width / 2 + 130, height - 50, t('classSelect.start'), () => startNewRun(this, this.selected), {
      width: 200,
      color: THEME.accent,
    });
    if (loadRun()) {
      addText(this, width / 2, height - 94, t('classSelect.overwriteWarn'), 14, THEME.textRed).setOrigin(0.5);
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
    let y = 285;

    const line = (x: number, text: string, size = 16, color: string = THEME.text) => {
      const obj = addText(this, x, y, text, size, color, { wordWrap: { width: 520 } });
      this.detail.add(obj);
      return obj;
    };

    line(left, `${t(def.nameKey)}  —  ${t(def.roleKey)}`, 24);
    y += 40;
    line(
      left,
      `${t('classSelect.attack')}：${t(`attackStyle.${def.attackStyle}`)}  /  ${def.attackRange}px  /  ${def.attackInterval}s`,
    );
    y += 30;
    const statKeys = ['maxHp', 'maxMp', 'atk', 'def', 'moveSpeed'] as const;
    line(left, statKeys.map((k) => `${t(`stat.${k}`)} ${stats[k]}`).join('   '), 15, THEME.textDim);
    y += 40;
    line(left, `${t('classSelect.passive')}：${t(def.passive.nameKey)}`, 18, THEME.textGold);
    y += 26;
    line(left, t(def.passive.descKey), 14, THEME.textDim);

    // 右欄：技能
    const right = 680;
    y = 285;
    const skillLine = (label: string, s: SkillDef) => {
      const head = addText(this, right, y, `${label}  ${t(s.nameKey)}   CD ${s.cooldown}s / MP ${s.mpCost}`, 16);
      const desc = addText(this, right, y + 22, t(s.descKey), 13, THEME.textDim);
      this.detail.add([head, desc]);
      y += 54;
    };
    const keys = ['Q', 'E', 'R'];
    def.skills.forEach((s, i) => skillLine(`[${keys[i]}]`, s));
    skillLine(`[F] ${t('classSelect.ultimate')}`, def.ultimate);
  }
}
