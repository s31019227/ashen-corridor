import Phaser from 'phaser';
import { CLASSES, rankValue } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { ACTION_KEY_LABEL, type GameAction } from '../config/keybinds';
import { PLAYER_CONFIG } from '../config/player';
import { POTIONS } from '../config/potions';
import { difficultyLevel } from '../core/difficulty';
import { LEVEL_CONFIG } from '../config/leveling';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { canLearn, skillPoints, xpForNext } from '../core/leveling';
import { passiveAttackMult, shieldTotal } from '../sim/effects';
import { THEME } from '../config/theme';
import { cdProgress, type Cooldown } from '../core/cooldown';
import { t } from '../i18n';
import { net } from '../net/client';
import { inputHub } from '../systems/InputSystem';
import { Bar } from '../ui/Bar';
import { Button, CLICK_GUARD_MS } from '../ui/Button';
import { addText } from '../ui/text';
import { isStandalone, toggleFullscreen } from '../ui/fullscreen';
import { isTouchPrimary } from '../ui/device';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { DpsMeter } from '../ui/DpsMeter';
import { drawMap } from './MapScene';
import { SCENES } from './keys';
import { TOAST_EVENT, type RoomScene } from './RoomScene';


interface ActionButton {
  action: GameAction;
  container: Phaser.GameObjects.Container;
  /** 按鈕底圖（圓形技能鈕或方形藥水鈕） */
  shape: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
  overlay: Phaser.GameObjects.Graphics;
  cdText: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  radius: number;
  /** 方形按鈕（藥水）用 */
  square?: number;
  /** 技能按鈕：等級顯示與學習（+）按鈕 */
  rankText?: Phaser.GameObjects.Text;
  learnBtn?: Phaser.GameObjects.Container;
  /** 技能給自己的 buff / 護盾還剩多久：按鈕外圈倒數 */
  durRing?: Phaser.GameObjects.Graphics;
  /** 名稱下方的耗魔量（藍字） */
  mpText?: Phaser.GameObjects.Text;
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
  private dps!: DpsMeter;
  private teamRows = new Map<string, { name: Phaser.GameObjects.Text; bar: Bar; state: Phaser.GameObjects.Text }>();
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
    this.teamRows = new Map();
    this.minimapRoomId = -1;
    this.createdAt = this.time.now;

    // 左上：職業、血魔條、金幣
    addText(this, 20, 6, `${t(CLASSES[me.classId].nameKey)}${net.isMultiplayer ? `　${me.name}` : ''}`, 14, THEME.textDim);
    this.hpBar = new Bar(this, 20, 42, 280, 18, THEME.hp);
    this.mpBar = new Bar(this, 20, 64, 280, 14, THEME.mp, true);
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
    // DPS 表（點一下切換本房／本層）
    this.dps = new DpsMeter(this, width - 250, 160, 230);
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
    return { action, container, shape, overlay, cdText, label, radius, square };
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
      // 技能名稱往上一點，下面放藍色耗魔量
      btn.label.setY(-7);
      btn.mpText = addText(this, 0, 9, '', 11, '#7aa0ff').setOrigin(0.5);
      btn.container.addAt(btn.mpText, btn.container.getIndex(btn.label) + 1);
      btn.learnBtn = this.makeLearnButton(x + r * 0.75, y - r * 0.75, `learn${i + 1}` as GameAction);
      btn.durRing = this.add.graphics();
      btn.container.add(btn.durRing);
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
      // 還沒學：半透明；魔力不足：變暗並顯示藍色「MP」（在下面判斷）
      btn.container.setAlpha(rank > 0 ? 1 : 0.4);
      btn.rankText!.setText(rank > 0 ? `${'●'.repeat(rank)}${'○'.repeat(skill.maxRank - rank)}` : '');
      btn.learnBtn!.setVisible(!p.dead && canLearn(me, i));
      if (skill.kind === 'passive') btn.cdText.setText(rank > 0 ? t('skillInfo.passiveShort') : '');
      // 耗魔量：還沒學時顯示 1 級的消耗；不耗魔的技能不顯示
      const mpCost = rankValue(skill.mpCost, Math.max(1, rank));
      btn.mpText!.setText(skill.kind !== 'passive' && mpCost > 0 ? `${mpCost}` : '');
      // 魔力不足：技能按鈕變暗（開關技能關閉時不耗魔，不算）
      const turningOff = skill.kind === 'toggle' && p.toggles[skill.id];
      const cost = rank > 0 && skill.kind !== 'passive' && !turningOff ? rankValue(skill.mpCost, rank) : 0;
      if (cost > 0 && p.mp < cost) {
        btn.container.setAlpha(0.35);
        btn.overlay.fillStyle(0x0a1030, 0.75).fillCircle(0, 0, btn.radius);
        if (!btn.cdText.text) btn.cdText.setText('MP').setColor('#7aa0ff');
      } else {
        btn.cdText.setColor('#ffffff');
      }
      this.drawDurationRing(btn, skill.id);
      const on = skill.kind === 'toggle' && p.toggles[skill.id];
      btn.shape.setStrokeStyle(on ? 4 : 2, on ? 0xe06030 : THEME.panelBorder);
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

  /** 技能給自己的 buff 或護盾還在時，在按鈕外圈畫一圈倒數（從頂端順時針減少） */
  private drawDurationRing(btn: ActionButton, skillId: string) {
    const g = btn.durRing!;
    g.clear();
    const p = net.meEntity!;
    const timer = p.buffs.find((b) => b.id === skillId) ?? p.shields.find((sh) => sh.id === skillId);
    if (!timer || timer.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, (timer.remaining - net.sinceSnap) / timer.duration));
    if (ratio <= 0) return;
    const start = -Math.PI / 2;
    g.lineStyle(5, 0x000000, 0.5).strokeCircle(0, 0, btn.radius + 5);
    g.lineStyle(4, 0xffd060, 1);
    g.beginPath();
    g.arc(0, 0, btn.radius + 5, start, start + Math.PI * 2 * ratio, false);
    g.strokePath();
  }

  /** 多人：列出隊友血量與連線狀態，以及自己的連線狀態 */
  private refreshTeam() {
    if (!net.isMultiplayer) return;
    const run = net.run!;
    const world = net.world!;
    const lines: string[] = [];
    if (net.status !== 'ok') lines.push(t(net.status === 'lost' ? 'net.lost' : 'net.connecting'));
    lines.push(t('hud.room', { code: net.roomCode }));
    this.teamText.setText(lines.join('\n'));

    // 隊友：名字（職業）＋血條（含護盾）＋狀態
    let y = this.teamText.y + this.teamText.height + 8;
    const ids = Object.keys(run.players).filter((id) => id !== net.myId);
    for (const id of ids) {
      const pr = run.players[id];
      const e = world.players[id];
      let row = this.teamRows.get(id);
      if (!row) {
        const name = addText(this, 20, 0, '', 13, THEME.text);
        const bar = new Bar(this, 20, 0, 180, 10, THEME.hp);
        const state = addText(this, 206, 0, '', 12, THEME.textDim).setOrigin(0, 0.5);
        row = { name, bar, state };
        this.teamRows.set(id, row);
      }
      row.name.setY(y).setText(`${pr.name}（${t(CLASSES[pr.classId].nameKey)}）`).setColor(`#${pr.color.toString(16).padStart(6, '0')}`);
      const barY = y + row.name.height + 7;
      row.bar.setY(barY);
      row.state.setY(barY);
      if (!e?.connected) {
        row.bar.setValue(0, 1, false);
        row.state.setText(t('hud.offline')).setColor(THEME.textDim);
      } else if (e.dead) {
        const pct = Math.floor((e.reviveProgress / MULTIPLAYER_CONFIG.reviveTime) * 100);
        row.bar.setValue(0, e.stats.maxHp, false);
        row.state.setText(t('hud.downRevive', { pct })).setColor(THEME.textRed);
      } else {
        row.bar.setValue(e.hp, e.stats.maxHp, false, shieldTotal(e));
        row.state.setText(`${Math.ceil(e.hp)}`).setColor(THEME.textDim);
      }
      y = barY + 14;
    }
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

    this.hpBar.setValue(p.hp, p.stats.maxHp, true, shieldTotal(p));
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
    attackBtn.shape.setFillStyle(auto ? 0x8b2e2e : 0x2a2830, 0.9);
    this.unlockBtn.setVisible(p.lockedId !== null);
    this.refreshMinimap();
    this.dps.update(this.time.now);
    this.deadText.setVisible(p.dead);
    if (p.dead) {
      const pct = Math.floor((p.reviveProgress / MULTIPLAYER_CONFIG.reviveTime) * 100);
      this.deadText.setText(t('msg.waitRevive', { pct }));
    }
    this.refreshTeam();

    this.skillButtons.forEach((btn, i) => this.drawCooldown(btn, i === 0 ? p.attackCd : p.skillCds[i - 1]));
    this.refreshSkills();
    this.potionButtons.forEach((btn, i) => {
      const potionId = me.potions[i];
      const def = potionId ? POTIONS[potionId] : null;
      btn.label.setText(def ? t(def.shortKey) : '');
      btn.shape.setFillStyle(def ? def.color : THEME.button, def ? 0.8 : 0.4);
      this.drawCooldown(btn, potionId ? p.potionCds[i] : undefined);
    });
  }
}
