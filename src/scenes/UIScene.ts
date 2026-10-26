import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { ACTION_KEY_LABEL, type GameAction } from '../config/keybinds';
import { PLAYER_CONFIG } from '../config/player';
import { POTIONS } from '../config/potions';
import { difficultyLevel } from '../core/difficulty';
import { THEME } from '../config/theme';
import type { Cooldown } from '../core/cooldown';
import { t } from '../i18n';
import { session } from '../state/session';
import { inputHub } from '../systems/InputSystem';
import { Bar } from '../ui/Bar';
import { Button, CLICK_GUARD_MS } from '../ui/Button';
import { addText } from '../ui/text';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { drawMap } from './MapScene';
import { SCENES } from './keys';
import { TOAST_EVENT, type RoomScene } from './RoomScene';

function isTouchPrimary(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

interface ActionButton {
  action: GameAction;
  container: Phaser.GameObjects.Container;
  overlay: Phaser.GameObjects.Graphics;
  cdText: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  radius: number;
  /** 方形按鈕（藥水）用 */
  square?: number;
}

/** HUD：血魔條、金幣、小地圖、技能 / 藥水按鈕、虛擬搖桿、提示訊息 */
export class UIScene extends Phaser.Scene {
  private hpBar!: Bar;
  private mpBar!: Bar;
  private goldText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;
  private dangerText!: Phaser.GameObjects.Text;
  private unlockBtn!: Button;
  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;
  private minimap!: Phaser.GameObjects.Container;
  private minimapRoomId = -1;
  private skillButtons: ActionButton[] = [];
  private potionButtons: ActionButton[] = [];
  private joystick?: VirtualJoystick;
  private createdAt = 0;

  constructor() {
    super(SCENES.ui);
  }

  private get room(): RoomScene {
    return this.scene.get(SCENES.room) as RoomScene;
  }

  create() {
    const { width, height } = GAME_CONFIG;
    const run = session.run!;
    this.skillButtons = [];
    this.potionButtons = [];
    this.minimapRoomId = -1;
    this.createdAt = this.time.now;

    // 左上：職業、血魔條、金幣
    addText(this, 20, 10, t(CLASSES[run.classId].nameKey), 16, THEME.textDim);
    this.hpBar = new Bar(this, 20, 42, 280, 18, THEME.hp);
    this.mpBar = new Bar(this, 20, 64, 280, 14, THEME.mp);
    this.goldText = addText(this, 20, 78, '', 16, THEME.textGold);
    this.killsText = addText(this, 140, 78, '', 16, THEME.textDim);

    // 上方中央：格子資訊與提示
    this.roomText = addText(this, width / 2, 14, '', 18).setOrigin(0.5, 0);
    this.toastText = addText(this, width / 2, 90, '', 20, THEME.text, { stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0);

    // 右上：小地圖、選單按鈕
    this.minimap = this.add.container(0, 0);
    const mapHit = this.add.zone(width - 200, 6, 130, 120).setOrigin(0).setInteractive({ useHandCursor: true });
    mapHit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.room.openMapView();
    });
    new Button(this, width - 36, 26, 'II', () => this.room.openPause(), { width: 48, height: 40, fontSize: 18 });
    new Button(this, width - 36, 74, t('hud.equipment'), () => inputHub.press('equipment'), {
      width: 48,
      height: 40,
      fontSize: 14,
    });
    this.dangerText = addText(this, width - 200, 130, '', 14, THEME.textRed);

    // 解除鎖定
    this.unlockBtn = new Button(this, width - 110, height - 290, t('hud.unlock'), () => this.room.unlockTarget(), {
      width: 120,
      height: 40,
      fontSize: 16,
      color: 0x4a3a1a,
    });

    this.createSkillButtons();
    this.createPotionButtons();

    // 左下：虛擬搖桿（主要輸入為觸控的裝置才顯示）
    if (isTouchPrimary()) {
      this.joystick = new VirtualJoystick(this, new Phaser.Geom.Rectangle(0, height * 0.4, width * 0.42, height * 0.6), {
        x: 150,
        y: height - 150,
      });
    }

    this.game.events.on(TOAST_EVENT, this.showToast, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(TOAST_EVENT, this.showToast, this);
      inputHub.joystick.x = 0;
      inputHub.joystick.y = 0;
    });
  }

  private makeButton(
    x: number,
    y: number,
    action: GameAction,
    text: string,
    radius: number,
    color: number,
    square?: number,
  ): ActionButton {
    const shape = square
      ? this.add.rectangle(0, 0, square, square, color).setStrokeStyle(2, THEME.panelBorder)
      : this.add.circle(0, 0, radius, color, 0.85).setStrokeStyle(2, THEME.panelBorder);
    const label = addText(this, 0, -2, text, square ? 11 : 13, THEME.text, { align: 'center' }).setOrigin(0.5);
    const keyLabel = addText(this, 0, (square ?? radius * 2) / 2 - 12, ACTION_KEY_LABEL[action] ?? '', 11, THEME.textDim).setOrigin(0.5);
    const overlay = this.add.graphics();
    const cdText = addText(this, 0, 0, '', 18, '#ffffff', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const container = this.add.container(x, y, [shape, label, keyLabel, overlay, cdText]);
    shape.setInteractive({ useHandCursor: true });
    shape.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.time.now - this.createdAt < CLICK_GUARD_MS) return;
      inputHub.press(action);
      container.setScale(0.92);
      this.time.delayedCall(90, () => container.setScale(1));
    });
    return { action, container, overlay, cdText, label, radius, square };
  }

  private createSkillButtons() {
    const { width, height } = GAME_CONFIG;
    const def = CLASSES[session.run!.classId];
    const ax = width - 90;
    const ay = height - 90;
    // 攻擊按鈕 = 自動普攻開關
    this.skillButtons.push(this.makeButton(ax, ay, 'attack', '', 52, 0x3a2020));
    const layout: [GameAction, number, number, number][] = [
      ['skill1', ax - 118, ay + 22, 36],
      ['skill2', ax - 108, ay - 72, 36],
      ['skill3', ax - 30, ay - 128, 36],
      ['ultimate', ax + 54, ay - 128, 40],
    ];
    const skills = [...def.skills, def.ultimate];
    layout.forEach(([action, x, y, r], i) => {
      this.skillButtons.push(this.makeButton(x, y, action, t(skills[i].nameKey), r, i === 3 ? 0x4a1a2a : THEME.button));
    });
  }

  private createPotionButtons() {
    const { width, height } = GAME_CONFIG;
    const size = 56;
    const gap = 8;
    // 放在技能按鈕左邊，多格時往左排
    const firstX = width - 290 - (PLAYER_CONFIG.potionSlots - 1) * (size + gap);
    for (let i = 0; i < PLAYER_CONFIG.potionSlots; i++) {
      const action = `potion${i + 1}` as GameAction;
      this.potionButtons.push(this.makeButton(firstX + i * (size + gap), height - 44, action, '', size / 2, THEME.button, size));
    }
  }

  private drawCooldown(btn: ActionButton, cd: Cooldown | undefined) {
    const g = btn.overlay;
    g.clear();
    if (!cd || cd.ready) {
      btn.cdText.setText('');
      return;
    }
    g.fillStyle(0x000000, 0.6);
    if (btn.square) {
      const h = btn.square * cd.progress;
      g.fillRect(-btn.square / 2, btn.square / 2 - h, btn.square, h);
    } else {
      const start = -Math.PI / 2;
      g.slice(0, 0, btn.radius, start, start + Math.PI * 2 * cd.progress, false).fillPath();
    }
    btn.cdText.setText(cd.remaining >= 1 ? `${Math.ceil(cd.remaining)}` : cd.remaining >= 0.1 ? cd.remaining.toFixed(1) : '');
  }

  private showToast(message: string, color: string) {
    this.toastText.setText(message).setColor(color).setAlpha(1);
    this.toastTween?.stop();
    this.toastTween = this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1400, duration: 400 });
  }

  private refreshMinimap() {
    const run = session.run!;
    if (this.minimapRoomId === run.currentRoomId) return;
    this.minimapRoomId = run.currentRoomId;
    this.minimap.removeAll(true);
    drawMap(this, run.map, GAME_CONFIG.width - 135, 66, 12, run.currentRoomId, this.minimap);
  }

  update() {
    const room = this.room;
    const run = session.run;
    if (!run || !room.player || !room.cell) return;
    const p = room.player;

    if (this.joystick) {
      inputHub.joystick.x = this.joystick.value.x;
      inputHub.joystick.y = this.joystick.value.y;
    }

    this.hpBar.setValue(p.hp, p.stats.maxHp);
    this.mpBar.setValue(p.mp, p.stats.maxMp);
    this.goldText.setText(t('hud.gold', { gold: run.gold }));
    this.killsText.setText(t('hud.kills', { kills: run.kills }));
    const roomName = t(`room.${room.cell.type}`);
    const left = room.aliveEnemies.length;
    this.roomText.setText(left > 0 ? `${roomName}・${t('hud.enemiesLeft', { count: left })}` : roomName);
    this.dangerText.setText(t('hud.danger', { level: difficultyLevel(run.map) }));
    const auto = session.settings.autoAttack;
    const attackBtn = this.skillButtons[0];
    attackBtn.label.setText(`${t('hud.autoAttack')}\n${t(auto ? 'settings.on' : 'settings.off')}`);
    (attackBtn.container.list[0] as Phaser.GameObjects.Arc).setFillStyle(auto ? 0x8b2e2e : 0x2a2830, 0.9);
    this.unlockBtn.setVisible(p.lockedId !== null);
    this.refreshMinimap();

    this.skillButtons.forEach((btn, i) => this.drawCooldown(btn, i === 0 ? p.attackCd : p.skillCds[i - 1]));
    this.potionButtons.forEach((btn, i) => {
      const potionId = run.potions[i];
      const def = potionId ? POTIONS[potionId] : null;
      btn.label.setText(def ? t(def.shortKey) : '');
      (btn.container.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(def ? def.color : THEME.button, def ? 0.8 : 0.4);
      this.drawCooldown(btn, potionId ? p.potionCds[i] : undefined);
    });
  }
}
