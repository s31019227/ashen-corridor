import Phaser from 'phaser';
import { EQUIPMENT, RARITY } from '../config/equipment';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { sellPrice } from '../core/inventory';
import { statDiff } from '../core/stats';
import { t } from '../i18n';
import { net } from '../net/client';
import { Button } from '../ui/Button';
import { addBackdrop, addPanel } from '../ui/Panel';
import { addSlotIcon } from '../ui/icons';
import { formatStats } from '../ui/statText';
import { addText } from '../ui/text';
import { SCENES } from './keys';

/** 過層獎勵：從幾件裝備中選一件直接裝上（換下的舊裝備自動賣掉），也可以跳過 */
export class RewardScene extends Phaser.Scene {
  private done = false;

  constructor() {
    super(SCENES.reward);
  }

  init() {
    this.done = false;
  }

  create() {
    const me = net.me;
    const choices = me?.rewardChoices;
    if (!me || !choices) {
      this.close();
      return;
    }
    const { width, height } = GAME_CONFIG;
    // 必須選擇或跳過，點背景不會關閉
    addBackdrop(this, 0.75);
    addPanel(this, width / 2, height / 2, 1040, 600);
    addText(this, width / 2, height / 2 - 260, t('reward.title', { floor: net.run!.floor }), 30, THEME.textGold).setOrigin(0.5);
    addText(this, width / 2, height / 2 - 224, t('reward.subtitle'), 16, THEME.textDim).setOrigin(0.5);

    const cardW = 300;
    const gap = 30;
    const left = width / 2 - ((cardW + gap) * (choices.length - 1)) / 2;
    choices.forEach((id, i) => {
      const def = EQUIPMENT[id];
      const rarity = RARITY[def.tier];
      const x = left + i * (cardW + gap);
      const y = height / 2 + 10;
      this.add.rectangle(x, y, cardW, 340, THEME.button, 0.7).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(rarity.color).color);
      addSlotIcon(this, x, y - 125, def.slot, def.armorType, 56);
      addText(this, x, y - 74, t(def.nameKey), 20, rarity.color).setOrigin(0.5);
      const sub = [t(rarity.nameKey), t(`slot.${def.slot}`), def.armorType ? t(`armor.${def.armorType}`) : ''].filter(Boolean).join('・');
      addText(this, x, y - 48, sub, 14, THEME.textDim).setOrigin(0.5);
      // 屬性、比較、換下的裝備依文字實際高度往下排（屬性多時會換行）
      let cy = y - 26;
      const stats = addText(this, x, cy, formatStats(def.stats), 14, THEME.text, { align: 'center', wordWrap: { width: cardW - 30 } }).setOrigin(0.5, 0);
      cy += stats.height + 12;

      // 與目前裝備比較，並提示舊裝備會換成多少金幣
      const currentId = me.equipment[def.slot];
      const diff = statDiff(currentId ? EQUIPMENT[currentId].stats : {}, def.stats);
      const gains = Object.fromEntries(Object.entries(diff).filter(([, v]) => v! > 0));
      const losses = Object.fromEntries(Object.entries(diff).filter(([, v]) => v! < 0));
      const lines: [string, string][] = [];
      if (Object.keys(gains).length > 0) lines.push([`▲ ${formatStats(gains)}`, THEME.textGreen]);
      if (Object.keys(losses).length > 0) lines.push([`▼ ${formatStats(losses)}`, THEME.textRed]);
      if (currentId) lines.push([t('reward.replace', { name: t(EQUIPMENT[currentId].nameKey), gold: sellPrice(currentId) }), THEME.textDim]);
      for (const [text, color] of lines) {
        const line = addText(this, x, cy, text, 12, color, { align: 'center', wordWrap: { width: cardW - 24 } }).setOrigin(0.5, 0);
        cy += line.height + 4;
      }

      new Button(this, x, y + 140, t('reward.pick'), () => this.pick(id), { width: 160, height: 40, color: THEME.accent });
    });

    new Button(this, width / 2, height / 2 + 240, t('reward.skip'), () => this.pick(null), { width: 160, height: 40 });
  }

  private pick(item: string | null) {
    if (this.done) return;
    net.act({ k: 'reward', item });
    this.close();
  }

  private close() {
    this.done = true;
    net.popUi();
    this.scene.stop();
  }
}
