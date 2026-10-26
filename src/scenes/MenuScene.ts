import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { t } from '../i18n';
import { net } from '../net/client';
import { loadGame } from '../save/storage';
import { Button } from '../ui/Button';
import { addText } from '../ui/text';
import { SCENES } from './keys';

let autoJoinTried = false;

export class MenuScene extends Phaser.Scene {
  private message?: string;
  private joinBox: Phaser.GameObjects.DOMElement | null = null;

  constructor() {
    super(SCENES.menu);
  }

  init(data: { message?: string }) {
    this.message = data?.message;
    this.joinBox = null;
  }

  create() {
    const cx = GAME_CONFIG.width / 2;
    this.drawBackground();

    addText(this, cx, 130, t('game.title'), 72, THEME.text, { stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    addText(this, cx, 200, t('game.subtitle'), 20, THEME.textDim).setOrigin(0.5);

    // 邀請連結（?room=代碼）打開時自動加入
    const pending = net.pendingRoomFromUrl();
    if (pending && !autoJoinTried) {
      autoJoinTried = true;
      this.join(pending);
      return;
    }

    let y = 280;
    const step = 66;
    new Button(this, cx, y, t('menu.solo'), () => this.scene.start(SCENES.classSelect));
    y += step;
    new Button(this, cx, y, t('menu.host'), () => net.hostRoom());
    y += step;
    new Button(this, cx, y, t('menu.join'), () => this.showJoinBox());
    y += step;

    const saved = loadGame();
    const cont = new Button(this, cx, y, t('menu.continue'), () => saved && net.continueSaved(saved));
    if (saved) {
      const me = saved.run.players[saved.run.hostId];
      const info = t(saved.multiplayer ? 'menu.continueInfoMulti' : 'menu.continueInfo', {
        class: me ? t(CLASSES[me.classId].nameKey) : '',
        floor: saved.run.floor,
        count: Object.keys(saved.run.players).length,
      });
      addText(this, cx, y + 36, info, 14, THEME.textDim).setOrigin(0.5);
      y += 20;
    } else {
      cont.setEnabled(false);
    }
    y += step;
    new Button(this, cx, y, t('menu.settings'), () => {
      this.scene.pause();
      this.scene.launch(SCENES.settings, { from: SCENES.menu });
    });

    if (this.message) {
      addText(this, cx, GAME_CONFIG.height - 40, t(this.message), 18, THEME.textRed).setOrigin(0.5);
    }
  }

  /** 輸入房間代碼 */
  private showJoinBox() {
    if (this.joinBox) return;
    const cx = GAME_CONFIG.width / 2;
    const html = `
      <div style="display:flex;gap:8px;align-items:center;background:#16161f;border:2px solid #3a3848;padding:12px 16px;">
        <input id="join-code" maxlength="4" placeholder="${t('menu.codePlaceholder')}" autocomplete="off"
          style="width:120px;font:24px ${THEME.font};text-transform:uppercase;text-align:center;letter-spacing:6px;
          background:#0b0b10;color:#d8d4cc;border:1px solid #3a3848;padding:6px;" />
        <button id="join-go" style="font:18px ${THEME.font};padding:8px 16px;background:#8b2e2e;color:#d8d4cc;border:0;cursor:pointer;">
          ${t('menu.joinGo')}</button>
      </div>`;
    this.joinBox = this.add.dom(cx, GAME_CONFIG.height - 70).createFromHTML(html);
    const input = this.joinBox.getChildByID('join-code') as HTMLInputElement;
    const go = () => {
      const code = input.value.trim().toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(code)) this.join(code);
    };
    (this.joinBox.getChildByID('join-go') as HTMLButtonElement).onclick = go;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') go();
    };
    input.focus();
  }

  private join(code: string) {
    this.scene.start(SCENES.lobby, { joining: code });
    net.joinRoom(code);
  }

  private drawBackground() {
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
    this.add.graphics().fillStyle(THEME.accent, 0.15).fillRect(0, GAME_CONFIG.height - 6, GAME_CONFIG.width, 6);
  }
}
