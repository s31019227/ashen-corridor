import Phaser from 'phaser';
import { getAltarEffect } from '../config/altar';
import { CLASSES, rankValue } from '../config/classes';
import { ENEMIES } from '../config/enemies';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { ROOM_COLORS, THEME } from '../config/theme';
import { neighbors } from '../core/mapGen';
import { DIRS } from '../core/types';
import { t, tEvent } from '../i18n';
import { net } from '../net/client';
import { attackRange } from '../sim/effects';
import type { GameEvent, TelegraphEntity } from '../sim/types';
import { INTERACT_POS, ROOM_BOUNDS, isCombatRoom } from '../sim/world';
import { session } from '../state/session';
import { inputHub, KeyboardInput } from '../systems/InputSystem';
import { formatAltarEffect } from '../ui/statText';
import { floatText, textStyle } from '../ui/text';
import { SCENES } from './keys';

export const TOAST_EVENT = 'toast';

interface PlayerView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  facing: Phaser.GameObjects.Triangle;
  name: Phaser.GameObjects.Text;
}

interface EnemyView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  hpFill: Phaser.GameObjects.Rectangle;
  hpWidth: number;
}

const R = PLAYER_CONFIG.radius;

/**
 * 單一格子的畫面。遊戲邏輯由房主的模擬負責（sim/），這裡只做三件事：
 * 收集輸入送給房主、把模擬狀態畫出來、把一次性事件變成特效與訊息。
 */
export class RoomScene extends Phaser.Scene {
  private roomId = -1;
  private keyboard!: KeyboardInput;
  private doors!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private interactable: Phaser.GameObjects.Container | null = null;
  private players = new Map<string, PlayerView>();
  private enemies = new Map<number, EnemyView>();
  private projectiles = new Map<number, Phaser.GameObjects.Shape>();
  private lastCleared = false;
  private leaving = false;

  constructor() {
    super(SCENES.room);
  }

  create() {
    const run = net.run;
    const world = net.world;
    if (!run || !world) {
      this.scene.start(SCENES.menu);
      return;
    }
    this.roomId = world.roomId;
    this.players = new Map();
    this.enemies = new Map();
    this.projectiles = new Map();
    this.interactable = null;
    this.leaving = false;

    this.drawRoom();
    this.doors = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(4);
    this.lastCleared = !isCombatRoom(run, this.roomId);
    this.drawDoors();
    this.createInteractable();
    this.keyboard = new KeyboardInput(this);

    const onGame = (e: GameEvent) => this.onGameEvent(e);
    net.on('game', onGame);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => net.off('game', onGame));
    this.cameras.main.fadeIn(GAME_CONFIG.room.transitionFadeMs, 0, 0, 0);
  }

  // ───────────────────────── 靜態畫面 ─────────────────────────

  private drawRoom() {
    const b = ROOM_BOUNDS;
    const w = b.right - b.left;
    const h = b.bottom - b.top;
    this.add.rectangle(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, GAME_CONFIG.width, GAME_CONFIG.height, THEME.wall);

    // 地板：點擊空地解除鎖定
    const floor = this.add.rectangle(b.left, b.top, w, h, THEME.floor).setOrigin(0).setInteractive();
    floor.on('pointerdown', () => net.act({ k: 'unlock' }));

    const grid = this.add.graphics();
    grid.lineStyle(1, THEME.floorGrid, 1);
    for (let x = b.left; x <= b.right; x += 64) grid.lineBetween(x, b.top, x, b.bottom);
    for (let y = b.top; y <= b.bottom; y += 64) grid.lineBetween(b.left, y, b.right, y);

    const cell = net.run!.map.cells[this.roomId];
    this.add.rectangle(b.left, b.top, w, h).setOrigin(0).setStrokeStyle(4, ROOM_COLORS[cell.type], 0.6);
  }

  /** 有相鄰格的邊畫出通道；清空前為紅色（關閉），清空後為綠色（開啟） */
  private drawDoors() {
    const g = this.doors;
    g.clear();
    const b = ROOM_BOUNDS;
    const n = neighbors(net.run!.map, this.roomId);
    const cleared = this.lastCleared;
    const len = 160;
    const thick = 10;
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    g.fillStyle(cleared ? THEME.doorOpen : THEME.doorClosed, 0.9);
    for (const dir of DIRS) {
      if (n[dir] === undefined) continue;
      if (dir === 'up') g.fillRect(cx - len / 2, b.top - thick, len, thick);
      if (dir === 'down') g.fillRect(cx - len / 2, b.bottom, len, thick);
      if (dir === 'left') g.fillRect(b.left - thick, cy - len / 2, thick, len);
      if (dir === 'right') g.fillRect(b.right, cy - len / 2, thick, len);
    }
    // 清空後整條邊都可以換格，用細線提示
    if (cleared) {
      g.lineStyle(2, THEME.doorOpen, 0.35);
      if (n.up !== undefined) g.lineBetween(b.left, b.top, b.right, b.top);
      if (n.down !== undefined) g.lineBetween(b.left, b.bottom, b.right, b.bottom);
      if (n.left !== undefined) g.lineBetween(b.left, b.top, b.left, b.bottom);
      if (n.right !== undefined) g.lineBetween(b.right, b.top, b.right, b.bottom);
    }
  }

  private createInteractable() {
    const type = net.run!.map.cells[this.roomId].type;
    if (!['start', 'shop', 'altar', 'treasure', 'rest'].includes(type)) return;
    const shape =
      type === 'start' || type === 'shop'
        ? this.add.rectangle(0, 0, 44, 44, ROOM_COLORS[type])
        : type === 'treasure'
          ? this.add.rectangle(0, 0, 40, 30, ROOM_COLORS[type])
          : this.add.circle(0, 0, 24, ROOM_COLORS[type]);
    shape.setStrokeStyle(2, 0xe8e0c8);
    const label = this.add
      .text(0, 38, t(`room.${type}`), textStyle(16))
      .setOrigin(0.5);
    const view = this.add.container(INTERACT_POS.x, INTERACT_POS.y, [shape, label]).setDepth(3);
    view.setInteractive(new Phaser.Geom.Circle(0, 0, 36), Phaser.Geom.Circle.Contains);
    view.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      net.act({ k: 'interact' });
    });
    this.interactable = view;
  }

  // ───────────────────────── 事件 → 特效 ─────────────────────────

  toast(message: string, color: string = THEME.text) {
    this.game.events.emit(TOAST_EVENT, message, color);
  }

  private onGameEvent(e: GameEvent) {
    const mine = 'pid' in e && e.pid === net.myId;
    switch (e.k) {
      case 'dmg':
        if (e.onPlayer) {
          floatText(this, e.x, e.y, `-${e.v}`, THEME.textRed);
          if (e.onPlayer === net.myId) this.cameras.main.shake(80, 0.004);
        } else if (e.crit) floatText(this, e.x, e.y, `${e.v}!`, THEME.textGold, 22);
        else floatText(this, e.x, e.y, `${e.v}`, THEME.text, 16);
        break;
      case 'heal': {
        const pos = net.displayPos('player', e.pid);
        if (!pos) break;
        if (e.hp > 0) floatText(this, pos.x - 14, pos.y - 30, `+${e.hp}`, THEME.textGreen);
        if (e.mp > 0) floatText(this, pos.x + 14, pos.y - 30, `+${e.mp}`, '#6a8ae0');
        break;
      }
      case 'gold':
        floatText(this, e.x, e.y, `+${e.v}G`, THEME.textGold);
        break;
      case 'slash':
        this.drawSlash(e.x, e.y, e.angle, e.r);
        break;
      case 'boom':
        this.flashTelegraph(e.tg);
        break;
      case 'kill': {
        const v = this.enemies.get(e.id);
        if (v) {
          this.enemies.delete(e.id);
          v.container.disableInteractive();
          this.tweens.add({ targets: v.container, alpha: 0, scale: 0.6, duration: 250, onComplete: () => v.container.destroy() });
        }
        break;
      }
      case 'toast':
        if (mine) this.toast(tEvent(e.key, e.params), e.color);
        break;
      case 'skill': {
        const pr = net.run?.players[e.pid];
        const pos = net.displayPos('player', e.pid);
        if (!pr || !pos) break;
        const def = CLASSES[pr.classId];
        const skill = e.skillIndex < 3 ? def.skills[e.skillIndex] : def.ultimate;
        floatText(this, pos.x, pos.y - 40, t(skill.nameKey), THEME.textGold, 20);
        if (mine && !e.implemented) this.toast(t('msg.skillNotImplemented', { name: t(skill.nameKey) }));
        break;
      }
      case 'open':
        if (mine) this.openUi(e.ui, e.cellId);
        break;
      case 'cleared':
        this.lastCleared = true;
        this.drawDoors();
        break;
      case 'revive':
        if (mine) this.toast(t('msg.revived'), THEME.textGreen);
        break;
      case 'levelup': {
        const pos = net.displayPos('player', e.pid);
        if (pos) floatText(this, pos.x, pos.y - 50, t('msg.levelUpFloat', { level: e.level }), THEME.textGold, 22);
        if (mine) this.toast(t('msg.levelUp', { level: e.level }), THEME.textGold);
        break;
      }
      case 'room':
        this.changeRoom();
        break;
      case 'aoe': {
        const g = this.add.graphics().setDepth(3);
        // 範圍技能的光：淡淡一圈，1.5 秒淡出
        g.fillStyle(e.color, 0.1).fillCircle(e.x, e.y, e.r);
        g.lineStyle(2, e.color, 0.45).strokeCircle(e.x, e.y, e.r);
        this.tweens.add({ targets: g, alpha: 0, duration: 1500, onComplete: () => g.destroy() });
        break;
      }
      case 'float':
        floatText(this, e.x, e.y, t(e.key), e.color, 18);
        break;
    }
  }

  private changeRoom() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(GAME_CONFIG.room.transitionFadeMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart());
  }

  private drawSlash(x: number, y: number, angle: number, r: number) {
    const g = this.add.graphics().setDepth(9);
    g.lineStyle(4, 0xe8e0c8, 0.9);
    g.beginPath();
    g.arc(x, y, r, angle - 0.7, angle + 0.7);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  private paintTelegraph(g: Phaser.GameObjects.Graphics, tg: TelegraphEntity, outer: number, inner: number, fill: number, color: number) {
    if (tg.shape === 'circle') {
      g.fillStyle(color, outer).fillCircle(tg.x, tg.y, tg.size);
      g.lineStyle(2, color, 0.7).strokeCircle(tg.x, tg.y, tg.size);
      g.fillStyle(color, inner).fillCircle(tg.x, tg.y, tg.size * fill);
      return;
    }
    g.save();
    g.translateCanvas(tg.x, tg.y);
    g.rotateCanvas(tg.angle);
    g.fillStyle(color, outer).fillRect(0, -tg.size / 2, tg.length, tg.size);
    g.lineStyle(2, color, 0.7).strokeRect(0, -tg.size / 2, tg.length, tg.size);
    g.fillStyle(color, inner).fillRect(0, -tg.size / 2, tg.length * fill, tg.size);
    g.restore();
  }

  private flashTelegraph(tg: TelegraphEntity) {
    const g = this.add.graphics().setDepth(2);
    this.paintTelegraph(g, tg, 0.5, 0.3, 1, 0xff6040);
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  // ───────────────────────── 介面 ─────────────────────────

  private openOverlay(key: string, data: object) {
    net.pushUi();
    this.scene.launch(key, data);
    this.scene.bringToTop(key);
  }

  private openUi(ui: 'shop' | 'altar', cellId: number) {
    if (net.uiBlocked) return;
    if (ui === 'shop') {
      this.openOverlay(SCENES.shop, { mode: 'shop', cellId });
      return;
    }
    const effect = getAltarEffect(net.run!.map.cells[cellId].altarEffect);
    if (!effect) return;
    const lines = [
      t('altar.title', { name: t(effect.nameKey) }),
      t('altar.effectLine', { effect: formatAltarEffect(effect) }),
      effect.goldCost > 0 ? t('altar.costLine', { cost: effect.goldCost }) : t('altar.freeLine'),
      t('altar.duration'),
    ];
    this.openOverlay(SCENES.dialog, {
      message: lines.join('\n'),
      confirmText: t('altar.confirm'),
      cancelText: t('altar.cancel'),
      onConfirm: () => net.act({ k: 'altar', cellId }),
    });
  }

  openMapView() {
    this.openOverlay(SCENES.map, { mode: 'view' });
  }

  openPause() {
    this.openOverlay(SCENES.settings, { from: SCENES.room });
  }

  /** 攻擊鍵：切換自動普攻（開 = 自動普攻，關 = 不普攻） */
  toggleAutoAttack() {
    const on = !(net.me?.autoAttack ?? true);
    session.updateSettings({ autoAttack: on });
    net.act({ k: 'auto', on });
    this.toast(t(on ? 'hud.autoOn' : 'hud.autoOff'), on ? THEME.textGreen : THEME.textDim);
  }

  unlockTarget() {
    net.act({ k: 'unlock' });
  }

  private handleActions() {
    const actions = inputHub.consume();
    if (net.uiBlocked) return; // 介面開著時忽略遊戲按鍵
    for (const action of actions) {
      switch (action) {
        case 'skill1':
        case 'skill2':
        case 'skill3':
          net.act({ k: 'skill', i: Number(action.slice(-1)) - 1 });
          break;
        case 'ultimate':
          net.act({ k: 'skill', i: 3 });
          break;
        case 'learn1':
        case 'learn2':
        case 'learn3':
        case 'learn4':
          net.act({ k: 'learn', i: Number(action.slice(-1)) - 1 });
          break;
        case 'potion1':
        case 'potion2':
        case 'potion3':
        case 'potion4':
        case 'potion5':
          net.act({ k: 'potion', i: Number(action.slice(-1)) - 1 });
          break;
        case 'attack':
          this.toggleAutoAttack();
          break;
        case 'unlock':
          this.unlockTarget();
          break;
        case 'equipment':
          this.openOverlay(SCENES.shop, { mode: 'equipment' });
          return;
        case 'map':
          this.openMapView();
          return;
        case 'pause':
          this.openPause();
          return;
      }
    }
  }

  // ───────────────────────── 每幀 ─────────────────────────

  update(_time: number, deltaMs: number) {
    const world = net.world;
    const run = net.run;
    if (!world || !run || this.leaving) return;
    if (world.roomId !== this.roomId) {
      this.changeRoom();
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.handleActions();
    const mv = this.keyboard.moveVector();
    net.setMove(mv.x, mv.y);
    net.updatePrediction(dt);

    if (!this.lastCleared && !isCombatRoom(run, this.roomId)) {
      this.lastCleared = true;
      this.drawDoors();
    }
    this.syncPlayers();
    this.syncEnemies();
    this.syncProjectiles();
    this.drawOverlay();

    // 自己用過的寶箱、休息點、祭壇變暗
    const used = net.me?.usedCells.includes(this.roomId) ?? false;
    this.interactable?.setAlpha(used ? 0.35 : 1);
  }

  private syncPlayers() {
    const world = net.world!;
    const run = net.run!;
    for (const [id, v] of this.players) {
      if (!world.players[id]?.connected) {
        v.container.destroy();
        this.players.delete(id);
      }
    }
    for (const p of Object.values(world.players)) {
      if (!p.connected) continue;
      const pr = run.players[p.id];
      if (!pr) continue;
      let v = this.players.get(p.id);
      if (!v) {
        const isMe = p.id === net.myId;
        const body = this.add.circle(0, 0, R, CLASSES[pr.classId].color).setStrokeStyle(isMe ? 3 : 2, pr.color);
        // Triangle 的頂點座標以左上角為原點，要用非負座標才會以 (x, y) 為中心
        const facing = this.add.triangle(R + 6, 0, 0, 0, 0, 12, 10, 6, pr.color);
        const name = this.add
          .text(0, -R - 14, net.isMultiplayer ? pr.name : '', textStyle(13))
          .setOrigin(0.5);
        const container = this.add.container(p.x, p.y, [body, facing, name]).setDepth(isMe ? 11 : 10);
        v = { container, body, facing, name };
        this.players.set(p.id, v);
      }
      const pos = net.displayPos('player', p.id) ?? p;
      v.container.setPosition(pos.x, pos.y);
      const angle = Math.atan2(p.fy, p.fx);
      v.facing.setPosition(Math.cos(angle) * (R + 6), Math.sin(angle) * (R + 6)).setRotation(angle);
      // 倒地時身體隱藏，改畫墓碑（drawTombstones）
      v.body.setAlpha(p.dead ? 0 : p.invuln > 0 ? 0.6 : 1);
      v.facing.setVisible(!p.dead);
    }
  }

  private syncEnemies() {
    const world = net.world!;
    const alive = new Set(world.enemies.map((e) => e.id));
    for (const [id, v] of this.enemies) {
      if (!alive.has(id)) {
        v.container.destroy();
        this.enemies.delete(id);
      }
    }
    for (const e of world.enemies) {
      let v = this.enemies.get(e.id);
      const def = ENEMIES[e.defId];
      if (!v) {
        const r = def.radius;
        const hpWidth = Math.max(30, r * 2);
        const body = this.add.circle(0, 0, r, def.color).setStrokeStyle(2, 0x1a0a0a);
        const hpBg = this.add.rectangle(-hpWidth / 2, -r - 10, hpWidth, 5, THEME.barBg).setOrigin(0, 0.5);
        const hpFill = this.add.rectangle(-hpWidth / 2, -r - 10, hpWidth, 5, THEME.hp).setOrigin(0, 0.5);
        const container = this.add.container(e.x, e.y, [body, hpBg, hpFill]).setDepth(5);
        // 點擊範圍比身體大一點，手機比較好點
        container.setInteractive(new Phaser.Geom.Circle(0, 0, r + 10), Phaser.Geom.Circle.Contains);
        const id = e.id;
        container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          net.act({ k: 'lock', id });
        });
        v = { container, body, hpFill, hpWidth };
        this.enemies.set(e.id, v);
      }
      const pos = net.displayPos('enemy', e.id) ?? e;
      v.container.setPosition(pos.x, pos.y);
      const width = v.hpWidth * (e.hp / e.maxHp);
      if (width < v.hpFill.width) {
        // 受傷時閃白
        const body = v.body;
        body.setFillStyle(0xffffff);
        this.time.delayedCall(60, () => body.active && body.setFillStyle(def.color));
      }
      v.hpFill.width = width;
    }
  }

  private syncProjectiles() {
    const world = net.world!;
    const ids = new Set(world.projectiles.map((p) => p.id));
    for (const [id, v] of this.projectiles) {
      if (!ids.has(id)) {
        v.destroy();
        this.projectiles.delete(id);
      }
    }
    for (const p of world.projectiles) {
      let v = this.projectiles.get(p.id);
      if (!v) {
        v = this.makeProjectile(p.kind, p.color, p.x, p.y);
        this.projectiles.set(p.id, v);
      }
      const pos = net.displayPos('proj', p.id) ?? p;
      // 箭、飛刀朝飛行方向；盾牌旋轉
      if (p.kind === 'arrow' || p.kind === 'dagger') v.setRotation(Math.atan2(pos.y - v.y, pos.x - v.x) || v.rotation);
      if (p.kind === 'shield') v.setRotation(this.time.now / 60);
      v.setPosition(pos.x, pos.y);
    }
  }

  /** 倒地的玩家：墓碑、復活圈、復活進度 */
  private drawTombstones(g: Phaser.GameObjects.Graphics) {
    const world = net.world!;
    const { reviveRadius, reviveTime } = MULTIPLAYER_CONFIG;
    const players = Object.values(world.players);
    for (const p of players) {
      if (!p.connected || !p.dead) continue;
      const helped = players.some(
        (o) => o !== p && o.connected && !o.dead && Math.hypot(o.x - p.x, o.y - p.y) <= reviveRadius,
      );
      g.fillStyle(0x80c080, helped ? 0.12 : 0.05).fillCircle(p.x, p.y, reviveRadius);
      g.lineStyle(2, helped ? 0x9ad070 : 0x707070, helped ? 0.9 : 0.5).strokeCircle(p.x, p.y, reviveRadius);
      // 墓碑
      g.fillStyle(0x6a6a74, 1).fillRoundedRect(p.x - 12, p.y - 16, 24, 30, { tl: 10, tr: 10, bl: 2, br: 2 });
      g.fillStyle(0x2a2a30, 1).fillRect(p.x - 1.5, p.y - 10, 3, 14).fillRect(p.x - 6, p.y - 6, 12, 3);
      // 進度
      const progress = Math.min(1, p.reviveProgress / reviveTime);
      if (progress > 0) {
        g.lineStyle(4, 0x9ad070, 1);
        g.beginPath();
        g.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        g.strokePath();
      }
    }
  }

  /** 技能的持續效果：獻祭光環、狂怒、衝鋒、重擊蓄力 */
  private drawSkillEffects(g: Phaser.GameObjects.Graphics) {
    const world = net.world!;
    const run = net.run!;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
    for (const p of Object.values(world.players)) {
      if (!p.connected || p.dead) continue;
      const pos = net.displayPos('player', p.id) ?? p;
      const pr = run.players[p.id];
      if (p.toggles.sacrifice && pr) {
        const def = CLASSES[pr.classId];
        const index = def.skills.findIndex((s) => s.id === 'sacrifice');
        const range = rankValue(def.skills[index]?.values.range, pr.skillRanks[index] ?? 0);
        g.fillStyle(0xd04020, 0.1 + 0.06 * pulse).fillCircle(pos.x, pos.y, R + range);
        g.lineStyle(2, 0xe06030, 0.5).strokeCircle(pos.x, pos.y, R + range);
      }
      if (p.buffs.some((b) => b.id === 'rage')) {
        g.lineStyle(4, 0xff3020, 0.5 + 0.4 * pulse).strokeCircle(pos.x, pos.y, R + 6);
      } else if (p.buffs.some((b) => b.id === 'charge')) {
        g.lineStyle(3, 0x80c0ff, 0.6).strokeCircle(pos.x, pos.y, R + 5);
      }
      if (p.shields.length > 0) {
        g.fillStyle(0x80c8ff, 0.12).fillCircle(pos.x, pos.y, R + 10);
        g.lineStyle(2, 0xa0d8ff, 0.8).strokeCircle(pos.x, pos.y, R + 10);
      }
      if (p.empower) {
        g.fillStyle(0xffd060, 0.6 + 0.4 * pulse).fillCircle(pos.x + p.fx * (R + 14), pos.y + p.fy * (R + 14), 5);
      }
    }
  }

  private makeProjectile(kind: string | undefined, color: number, x: number, y: number): Phaser.GameObjects.Shape {
    switch (kind) {
      case 'shield':
        return this.add.rectangle(x, y, 18, 22, color).setStrokeStyle(2, 0xd4af37).setDepth(8);
      case 'arrow':
        return this.add.rectangle(x, y, 22, 3, 0xe8e0c8).setDepth(8);
      case 'dagger':
        return this.add.triangle(x, y, 0, 0, 0, 8, 16, 4, 0xd0d0e0).setDepth(8);
      case 'fire':
        return this.add.circle(x, y, 8, 0xff7030).setStrokeStyle(3, 0xffc060, 0.8).setDepth(8);
      case 'hex':
        return this.add.circle(x, y, 7, 0x9040c0).setStrokeStyle(2, 0xd080ff, 0.8).setDepth(8);
      default:
        return this.add.circle(x, y, 5, color).setStrokeStyle(1, 0xffffff).setDepth(8);
    }
  }

  /** 地面範圍效果：延遲中的（隕星）畫成閃爍的警示圈，其他畫成淡色區域 */
  private drawZones(g: Phaser.GameObjects.Graphics) {
    const since = net.sinceSnap;
    for (const z of net.world!.zones) {
      if (z.timer + since < 0) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 80);
        g.fillStyle(z.color, 0.08 + 0.08 * pulse).fillCircle(z.x, z.y, z.r);
        g.lineStyle(2, z.color, 0.7).strokeCircle(z.x, z.y, z.r);
      } else {
        g.fillStyle(z.color, 0.08).fillCircle(z.x, z.y, z.r);
        g.lineStyle(1, z.color, 0.4).strokeCircle(z.x, z.y, z.r);
      }
    }
  }

  /** 怪物狀態：暈眩（黃色星環）、定身（藍色圈）、目標（頭上小三角是牠正在打的玩家顏色，打自己時加紅框） */
  private drawEnemyStatus(g: Phaser.GameObjects.Graphics) {
    const world = net.world!;
    for (const e of world.enemies) {
      const pos = net.displayPos('enemy', e.id) ?? e;
      const r = ENEMIES[e.defId].radius;
      if (e.stun > 0) {
        const a = this.time.now / 200;
        g.fillStyle(0xffe060, 1);
        for (let i = 0; i < 3; i++) {
          const ang = a + (i * Math.PI * 2) / 3;
          g.fillCircle(pos.x + Math.cos(ang) * (r * 0.8), pos.y - r - 16 + Math.sin(ang) * 4, 3);
        }
      }
      if (e.root > 0) g.lineStyle(3, 0x60a0ff, 0.9).strokeCircle(pos.x, pos.y, r + 4);
      // 異常狀態：緩速（淺藍）、持續傷害（橘點）、降防／易傷（紫）、延遲爆發（紫色倒數圈）
      const has = (kind: string) => e.statuses.some((s) => s.kind === kind);
      if (has('slow')) g.lineStyle(2, 0xa0d8ff, 0.8).strokeCircle(pos.x, pos.y, r + 2);
      if (has('armor') || has('armorPct') || has('vuln')) g.lineStyle(2, 0xb060e0, 0.8).strokeCircle(pos.x, pos.y, r + 9);
      if (has('dot')) {
        const blink = 0.5 + 0.5 * Math.sin(this.time.now / 120);
        g.fillStyle(0xff9040, 0.5 + 0.5 * blink).fillCircle(pos.x - r * 0.6, pos.y - r - 4, 3).fillCircle(pos.x + r * 0.6, pos.y - r - 2, 2.5);
      }
      const mark = e.statuses.find((s) => s.kind === 'mark');
      if (mark) {
        g.lineStyle(3, 0xc050ff, 1);
        g.beginPath();
        const ratio = Math.max(0, (mark.remaining - net.sinceSnap) / (mark.duration ?? 4));
        g.arc(pos.x, pos.y, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ratio));
        g.strokePath();
      }
      const target = e.targetId ? net.run!.players[e.targetId] : undefined;
      if (target) {
        const ty = pos.y - r - 20;
        g.fillStyle(target.color, 1).fillTriangle(pos.x - 5, ty - 6, pos.x + 5, ty - 6, pos.x, ty + 2);
        if (e.targetId === net.myId) g.lineStyle(2, 0xe04030, 0.9).strokeCircle(pos.x, pos.y, r + 7);
      }
    }
  }

  /** 紅色預警區、鎖定圈、普攻範圍 */
  private drawOverlay() {
    const g = this.overlay;
    g.clear();
    const world = net.world!;
    const since = net.sinceSnap;
    for (const tg of world.telegraphs) {
      this.paintTelegraph(g, tg, 0.12, 0.3, Math.min(1, (tg.elapsed + since) / tg.warnTime), THEME.telegraph);
    }
    this.drawZones(g);
    this.drawTombstones(g);
    this.drawSkillEffects(g);
    this.drawEnemyStatus(g);
    const me = net.meEntity;
    if (!me || me.dead) return;
    const ring =(id: number | null, width: number, alpha: number, pad: number) => {
      const e = world.enemies.find((en) => en.id === id);
      if (!e) return;
      const pos = net.displayPos('enemy', e.id) ?? e;
      g.lineStyle(width, THEME.lockRing, alpha).strokeCircle(pos.x, pos.y, ENEMIES[e.defId].radius + pad);
    };
    ring(me.lockedId, 3, 1, 8);
    if (me.targetId !== me.lockedId) ring(me.targetId, 1, 0.5, 5);
    const pos = net.displayPos('player', me.id) ?? me;
    g.lineStyle(1, 0xffffff, 0.06).strokeCircle(pos.x, pos.y, R + attackRange({ run: net.run!, world, moves: {}, events: [] }, me));
  }
}
