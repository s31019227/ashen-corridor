import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { ACTION_KEY_LABEL, type GameAction } from '../config/keybinds';
import { PLAYER_CONFIG } from '../config/player';
import { POTIONS } from '../config/potions';
import { difficultyLevel } from '../core/difficulty';
import { LEVEL_CONFIG } from '../config/leveling';
import { canLearn, skillPoints, xpForNext } from '../core/leveling';
import { passiveAttackMult } from '../sim/effects';
import { THEME } from '../config/theme';
import { cdProgress, type Cooldown } from '../core/cooldown';
import { t } from '../i18n';
import { net } from '../net/client';
import { inputHub } from '../systems/InputSystem';
import { Bar } from '../ui/Bar';
import { Button, CLICK_GUARD_MS } from '../ui/Button';
import { addText } from '../ui/text';
import { isStandalone, toggleFullscreen } from '../ui/fullscreen';
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
  /** 技能按鈕：等級顯示與學習（+）按鈕 */
  rankText?: Phaser.GameObjects.Text;
  learnBtn?: Phaser.GameObjects.Container;
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
  private teamText!: Phaser.GameObjects.Text;
  private xpBar!: Bar;
  private levelText!: Phaser.GameObjects.Text;
  private buffText!: Phaser.GameObjects.Text;
  private deadText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.ui);
  }

  private get room(): RoomScene {
    return this.scene.get(SCENES.room) as RoomScene;
  }

  create() {
    const { width, height } = GAME_CONFIG;
    const me = net.me!;
    this.skillButtons = [];
    this.potionButtons = [];
    this.minimapRoomId = -1;
    this.createdAt = this.time.now;

    // 左上：職業、血魔條、金幣
    addText(this, 20, 10, `${t(CLASSES[me.classId].nameKey)}${net.isMultiplayer ? `　${me.name}` : ''}`, 16, THEME.textDim);
    this.hpBar = new Bar(this, 20, 42, 280, 18, THEME.hp);
    this.mpBar = new Bar(this, 20, 64, 280, 14, THEME.mp);
    // 經驗條與等級
    this.xpBar = new Bar(this, 20, 80, 280, 6, 0xc9a227);
    this.levelText = addText(this, 20, 86, '', 15, THEME.textGold);
    this.goldText = addText(this, 20, 108, '', 16, THEME.textGold);
    this.killsText = addText(this, 140, 108, '', 16, THEME.textDim);
    this.buffText = addText(this, 20, 130, '', 14, '#e0a060');

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
    if (!isStandalone()) {
      new Button(this, width - 36, 122, '⛶', () => {
        if (!toggleFullscreen(this.game)) this.showToast(t('hint.addToHome'), THEME.textGold);
      }, { width: 48, height: 40, fontSize: 20 });
    }
    this.dangerText = addText(this, width - 200, 130, '', 14, THEME.textRed);
    // 多人：隊友狀態、連線狀態
    this.teamText = addText(this, 20, 154, '', 14, THEME.textDim, { lineSpacing: 4 });
    this.deadText = addText(this, width / 2, height / 2 - 120, t('msg.waitRevive'), 22, THEME.textRed, {
      stroke: '#000',
      strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setVisible(false);

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
    const def = CLASSES[net.me!.classId];
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
      const btn = this.makeButton(x, y, action, t(skills[i].nameKey), r, i === 3 ? 0x4a1a2a : THEME.button);
      btn.rankText = addText(this, 0, -r - 9, '', 11, THEME.textGold, { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      btn.container.add(btn.rankText);
      btn.learnBtn = this.makeLearnButton(x + r * 0.75, y - r * 0.75, `learn${i + 1}` as GameAction);
      this.skillButtons.push(btn);
    });
  }

  /** 技能旁的「+」：有技能點且可以學習 / 升級時出現（電腦也可按 Ctrl + 技能鍵） */
  private makeLearnButton(x: number, y: number, action: GameAction) {
    const circle = this.add.circle(0, 0, 13, 0xc9a227).setStrokeStyle(2, 0x000000);
    const plus = addText(this, 0, -1, '+', 20, '#000000').setOrigin(0.5);
    const container = this.add.container(x, y, [circle, plus]).setDepth(10);
    circle.setInteractive({ useHandCursor: true });
    circle.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      inputHub.press(action);
    });
    this.tweens.add({ targets: container, scale: 1.15, yoyo: true, repeat: -1, duration: 500 });
    return container;
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
    // 加入者的冷卻來自上一個快照，扣掉之後經過的時間讓倒數平順
    const remaining = cd ? cd.remaining - net.sinceSnap : 0;
    if (!cd || remaining <= 0) {
      btn.cdText.setText('');
      return;
    }
    const progress = cdProgress({ remaining, duration: cd.duration });
    g.fillStyle(0x000000, 0.6);
    if (btn.square) {
      const h = btn.square * progress;
      g.fillRect(-btn.square / 2, btn.square / 2 - h, btn.square, h);
    } else {
      const start = -Math.PI / 2;
      g.slice(0, 0, btn.radius, start, start + Math.PI * 2 * progress, false).fillPath();
    }
    btn.cdText.setText(remaining >= 1 ? `${Math.ceil(remaining)}` : remaining >= 0.1 ? remaining.toFixed(1) : '');
  }

  private showToast(message: string, color: string) {
    this.toastText.setText(message).setColor(color).setAlpha(1);
    this.toastTween?.stop();
    this.toastTween = this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1400, duration: 400 });
  }

  /** 等級、經驗、技能等級、可學習提示、開關技能與 buff */
  private refreshSkills() {
    const me = net.me!;
    const p = net.meEntity!;
    const def = CLASSES[me.classId];
    const skills = [...def.skills, def.ultimate];
    const maxed = me.level >= LEVEL_CONFIG.maxLevel;
    this.xpBar.setValue(maxed ? 1 : me.xp, maxed ? 1 : xpForNext(me.level), false);
    const points = skillPoints(me);
    this.levelText.setText(`Lv.${me.level}${points > 0 ? `　${t('hud.skillPoints', { n: points })}` : ''}`);
    skills.forEach((skill, i) => {
      const btn = this.skillButtons[i + 1];
      const rank = me.skillRanks[i] ?? 0;
      btn.container.setAlpha(rank > 0 ? 1 : 0.4);
      btn.rankText!.setText(rank > 0 ? `${'●'.repeat(rank)}${'○'.repeat(skill.maxRank - rank)}` : '');
      btn.learnBtn!.setVisible(!p.dead && canLearn(me, i));
      const on = skill.kind === 'toggle' && p.toggles[skill.id];
      (btn.container.list[0] as Phaser.GameObjects.Arc).setStrokeStyle(on ? 4 : 2, on ? 0xe06030 : THEME.panelBorder);
    });
    const parts = p.buffs.map((b) => {
      const skill = skills.find((s) => s.id === b.id);
      return `${skill ? t(skill.nameKey) : b.id} ${Math.ceil(b.remaining - net.sinceSnap)}s`;
    });
    if (me.classId === 'warrior' && !p.dead) {
      const bonus = Math.round((passiveAttackMult({ run: net.run!, world: net.world!, moves: {}, events: [] }, p) - 1) * 100);
      if (bonus > 0) parts.push(`${t(def.passive.nameKey)} +${bonus}%`);
    }
    this.buffText.setText(parts.join('　'));
  }

  /** 多人：列出隊友血量與連線狀態，以及自己的連線狀態 */
  private refreshTeam() {
    if (!net.isMultiplayer) return;
    const run = net.run!;
    const world = net.world!;
    const lines: string[] = [];
    if (net.status !== 'ok') lines.push(t(net.status === 'lost' ? 'net.lost' : 'net.connecting'));
    lines.push(t('hud.room', { code: net.roomCode }));
    for (const pr of Object.values(run.players)) {
      if (pr.id === net.myId) continue;
      const e = world.players[pr.id];
      const state = !e?.connected ? t('hud.offline') : e.dead ? t('hud.down') : `${Math.ceil(e.hp)}/${e.stats.maxHp}`;
      lines.push(`${pr.name}（${t(CLASSES[pr.classId].nameKey)}）${state}`);
    }
    this.teamText.setText(lines.join('\n'));
  }

  private refreshMinimap() {
    const run = net.run!;
    if (this.minimapRoomId === run.currentRoomId) return;
    this.minimapRoomId = run.currentRoomId;
    this.minimap.removeAll(true);
    drawMap(this, run.map, GAME_CONFIG.width - 135, 66, 12, run.currentRoomId, this.minimap);
  }

  update() {
    const run = net.run;
    const world = net.world;
    const me = net.me;
    const p = net.meEntity;
    if (!run || !world || !me || !p) return;
    const cell = run.map.cells[world.roomId];

    if (this.joystick) {
      inputHub.joystick.x = this.joystick.value.x;
      inputHub.joystick.y = this.joystick.value.y;
    }

    this.hpBar.setValue(p.hp, p.stats.maxHp);
    this.mpBar.setValue(p.mp, p.stats.maxMp);
    this.goldText.setText(t('hud.gold', { gold: me.gold }));
    this.killsText.setText(t('hud.kills', { kills: run.kills }));
    const roomName = t(`room.${cell.type}`);
    const left = world.enemies.length;
    this.roomText.setText(left > 0 ? `${roomName}・${t('hud.enemiesLeft', { count: left })}` : roomName);
    this.dangerText.setText(t('hud.danger', { level: difficultyLevel(run.map) }));
    const auto = me.autoAttack;
    const attackBtn = this.skillButtons[0];
    attackBtn.label.setText(`${t('hud.autoAttack')}\n${t(auto ? 'settings.on' : 'settings.off')}`);
    (attackBtn.container.list[0] as Phaser.GameObjects.Arc).setFillStyle(auto ? 0x8b2e2e : 0x2a2830, 0.9);
    this.unlockBtn.setVisible(p.lockedId !== null);
    this.refreshMinimap();
    this.deadText.setVisible(p.dead);
    this.refreshTeam();

    this.skillButtons.forEach((btn, i) => this.drawCooldown(btn, i === 0 ? p.attackCd : p.skillCds[i - 1]));
    this.refreshSkills();
    this.potionButtons.forEach((btn, i) => {
      const potionId = me.potions[i];
      const def = potionId ? POTIONS[potionId] : null;
      btn.label.setText(def ? t(def.shortKey) : '');
      (btn.container.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(def ? def.color : THEME.button, def ? 0.8 : 0.4);
      this.drawCooldown(btn, potionId ? p.potionCds[i] : undefined);
    });
  }
}
