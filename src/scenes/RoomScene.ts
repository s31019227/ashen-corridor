import Phaser from 'phaser';
import { BOSS_ID, ENEMIES, MOB_POOL } from '../config/enemies';
import { GAME_CONFIG } from '../config/game';
import { ROOM_EVENT_CONFIG } from '../config/map';
import { ROOM_COLORS, THEME } from '../config/theme';
import { markCleared, neighbors } from '../core/mapGen';
import { Rng, randomSeed } from '../core/rng';
import { canTransition, type RoomBounds } from '../core/roomTransition';
import { addGold, type RunState } from '../core/runState';
import { DIRS, OPPOSITE_DIR, type Dir, type MapCell } from '../core/types';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { t } from '../i18n';
import { session } from '../state/session';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { inputHub, KeyboardInput } from '../systems/InputSystem';
import { usePotion } from '../systems/PotionSystem';
import { useSkill } from '../systems/SkillSystem';
import { floatText } from '../ui/text';
import { endRun } from './flow';
import { SCENES } from './keys';

interface RoomData {
  /** 從哪個方向進來（玩家剛才往哪個方向走） */
  fromDir?: Dir;
}

interface Interactable {
  view: Phaser.GameObjects.Container;
  x: number;
  y: number;
  armed: boolean;
  trigger: () => void;
}

export const TOAST_EVENT = 'toast';

/** 單一格子（房間）內的場景：移動、戰鬥、互動、換格 */
export class RoomScene extends Phaser.Scene {
  run!: RunState;
  cell!: MapCell;
  player!: Player;
  enemies: Enemy[] = [];
  readonly bounds: RoomBounds;

  private combat!: CombatSystem;
  private enemySystem!: EnemySystem;
  private keyboard!: KeyboardInput;
  private doors!: Phaser.GameObjects.Graphics;
  private lockRing!: Phaser.GameObjects.Graphics;
  private interactable: Interactable | null = null;
  private transitioning = false;
  private finished = false;
  private nextEnemyId = 1;

  constructor() {
    super(SCENES.room);
    const m = GAME_CONFIG.room.margin;
    this.bounds = { left: m, top: m, right: GAME_CONFIG.width - m, bottom: GAME_CONFIG.height - m };
  }

  get isCombatRoom() {
    return (this.cell.type === 'mob' || this.cell.type === 'boss') && !this.cell.cleared;
  }

  /** 敵人全部清除（非戰鬥格永遠為 true） */
  get cleared() {
    return !this.isCombatRoom;
  }

  get aliveEnemies() {
    return this.enemies.filter((e) => e.alive);
  }

  create(data: RoomData) {
    const run = session.run;
    if (!run) {
      this.scene.start(SCENES.menu);
      return;
    }
    this.run = run;
    this.cell = run.map.cells[run.currentRoomId];
    this.cell.visited = true;
    this.enemies = [];
    this.interactable = null;
    this.transitioning = false;
    this.finished = false;
    this.nextEnemyId = 1;

    this.drawRoom();
    const spawn = this.spawnPoint(data.fromDir);
    this.player = new Player(this, run, spawn.x, spawn.y);
    this.player.importCooldowns(session.cooldowns);

    this.combat = new CombatSystem(this, this.player, () => this.enemies, (e) => this.onEnemyKilled(e));
    this.enemySystem = new EnemySystem(this, this.player, this.bounds);
    this.keyboard = new KeyboardInput(this);
    this.lockRing = this.add.graphics().setDepth(4);

    if (this.isCombatRoom) this.spawnEnemies();
    this.createInteractable();
    this.drawDoors();

    // 從暫停（商店、設定、地圖）回來時：裝備可能變了，重新計算數值
    // （scene.events 在 restart 之間不會清空，所以要在 shutdown 時移除）
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
      this.combat.destroy();
      this.enemySystem.clear();
    });

    this.cameras.main.fadeIn(GAME_CONFIG.room.transitionFadeMs, 0, 0, 0);
    session.save();
  }

  private onResume() {
    this.player.refreshStats();
    inputHub.consume();
  }

  // ───────────────────────── 畫面 ─────────────────────────

  private drawRoom() {
    const b = this.bounds;
    const w = b.right - b.left;
    const h = b.bottom - b.top;
    this.add.rectangle(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, GAME_CONFIG.width, GAME_CONFIG.height, THEME.wall);

    // 地板：點擊空地解除鎖定
    const floor = this.add.rectangle(b.left, b.top, w, h, THEME.floor).setOrigin(0).setInteractive();
    floor.on('pointerdown', () => this.combat.unlock());

    const grid = this.add.graphics();
    grid.lineStyle(1, THEME.floorGrid, 1);
    for (let x = b.left; x <= b.right; x += 64) grid.lineBetween(x, b.top, x, b.bottom);
    for (let y = b.top; y <= b.bottom; y += 64) grid.lineBetween(b.left, y, b.right, y);

    // 格子類型的淡色標示
    this.add
      .rectangle(b.left, b.top, w, h)
      .setOrigin(0)
      .setStrokeStyle(4, ROOM_COLORS[this.cell.type], 0.6);

    this.doors = this.add.graphics().setDepth(1);
  }

  /** 有相鄰格的邊畫出通道；清空前為紅色（關閉），清空後為綠色（開啟） */
  private drawDoors() {
    const g = this.doors;
    g.clear();
    const b = this.bounds;
    const n = neighbors(this.run.map, this.cell.id);
    const color = this.cleared ? THEME.doorOpen : THEME.doorClosed;
    const len = 160;
    const thick = 10;
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    g.fillStyle(color, 0.9);
    for (const dir of DIRS) {
      if (n[dir] === undefined) continue;
      if (dir === 'up') g.fillRect(cx - len / 2, b.top - thick, len, thick);
      if (dir === 'down') g.fillRect(cx - len / 2, b.bottom, len, thick);
      if (dir === 'left') g.fillRect(b.left - thick, cy - len / 2, thick, len);
      if (dir === 'right') g.fillRect(b.right, cy - len / 2, thick, len);
    }
    // 清空後整條邊都可以換格，用細線提示
    if (this.cleared) {
      g.lineStyle(2, THEME.doorOpen, 0.35);
      if (n.up !== undefined) g.lineBetween(b.left, b.top, b.right, b.top);
      if (n.down !== undefined) g.lineBetween(b.left, b.bottom, b.right, b.bottom);
      if (n.left !== undefined) g.lineBetween(b.left, b.top, b.left, b.bottom);
      if (n.right !== undefined) g.lineBetween(b.right, b.top, b.right, b.bottom);
    }
  }

  private spawnPoint(fromDir?: Dir) {
    const b = this.bounds;
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const off = GAME_CONFIG.room.entrySpawnOffset;
    if (!fromDir) return { x: cx, y: cy + 120 };
    // 往右走進來 → 出現在新格子的左側，依此類推
    switch (OPPOSITE_DIR[fromDir]) {
      case 'up':
        return { x: cx, y: b.top + off };
      case 'down':
        return { x: cx, y: b.bottom - off };
      case 'left':
        return { x: b.left + off, y: cy };
      case 'right':
        return { x: b.right - off, y: cy };
    }
  }

  // ───────────────────────── 敵人 ─────────────────────────

  private spawnEnemies() {
    const rng = new Rng(randomSeed());
    const b = this.bounds;
    if (this.cell.type === 'boss') {
      const far = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
      this.addEnemy(BOSS_ID, far.x, far.y);
      return;
    }
    const { enemyCountMin, enemyCountMax } = ROOM_EVENT_CONFIG.mob;
    const count = rng.int(enemyCountMin, enemyCountMax);
    for (let i = 0; i < count; i++) {
      const def = rng.weighted(MOB_POOL);
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = rng.int(b.left + 60, b.right - 60);
        y = rng.int(b.top + 60, b.bottom - 60);
        if (Math.hypot(x - this.player.x, y - this.player.y) >= GAME_CONFIG.room.enemySpawnMinDistance) break;
      }
      this.addEnemy(def.id, x, y);
    }
  }

  private addEnemy(defId: string, x: number, y: number) {
    const enemy = new Enemy(this, this.nextEnemyId++, ENEMIES[defId], x, y);
    enemy.view.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (enemy.alive) this.combat.lock(enemy.id);
      },
    );
    this.enemies.push(enemy);
  }

  private onEnemyKilled(enemy: Enemy) {
    const [min, max] = enemy.def.goldDrop;
    const gold = Phaser.Math.Between(min, max);
    addGold(this.run, gold);
    this.run.kills++;
    floatText(this, enemy.x, enemy.y, `+${gold}G`, THEME.textGold);
    enemy.destroy();
  }

  // ───────────────────────── 互動物件 ─────────────────────────

  private createInteractable() {
    const type = this.cell.type;
    const handlers: Partial<Record<MapCell['type'], () => void>> = {
      start: () => this.openShop(),
      shop: () => this.openShop(),
      altar: () => this.useAltar(),
      treasure: () => this.openTreasure(),
      rest: () => this.useRest(),
    };
    const trigger = handlers[type];
    if (!trigger) return;

    const x = (this.bounds.left + this.bounds.right) / 2;
    const y = (this.bounds.top + this.bounds.bottom) / 2 - 60;
    const used = this.cell.cleared && type !== 'start' && type !== 'shop';
    const shape =
      type === 'start' || type === 'shop'
        ? this.add.rectangle(0, 0, 44, 44, ROOM_COLORS[type])
        : type === 'treasure'
          ? this.add.rectangle(0, 0, 40, 30, ROOM_COLORS[type])
          : this.add.circle(0, 0, 24, ROOM_COLORS[type]);
    shape.setStrokeStyle(2, 0xe8e0c8).setAlpha(used ? 0.35 : 1);
    const label = this.add
      .text(0, 38, t(`room.${type}`), { fontFamily: THEME.font, fontSize: '16px', color: THEME.text })
      .setOrigin(0.5);
    const view = this.add.container(x, y, [shape, label]).setDepth(3);
    view.setInteractive(new Phaser.Geom.Circle(0, 0, 36), Phaser.Geom.Circle.Contains);
    view.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      trigger();
    });
    this.interactable = { view, x, y, armed: true, trigger };
  }

  private updateInteractable() {
    const it = this.interactable;
    if (!it) return;
    const d = Math.hypot(this.player.x - it.x, this.player.y - it.y);
    const r = GAME_CONFIG.room.interactRadius;
    if (it.armed && d <= r) {
      it.armed = false;
      it.trigger();
    } else if (!it.armed && d > r + 30) {
      it.armed = true;
    }
  }

  private markInteractableUsed() {
    this.interactable?.view.list.forEach((o) => (o as Phaser.GameObjects.Shape).setAlpha?.(0.35));
  }

  private openShop() {
    this.scene.pause();
    this.scene.launch(SCENES.shop, { mode: 'shop', cellId: this.cell.id });
  }

  private useAltar() {
    if (this.cell.cleared) {
      this.toast(t('msg.altarSpent'), THEME.textDim);
      return;
    }
    const { cost, restorePercent } = ROOM_EVENT_CONFIG.altar;
    this.scene.pause();
    this.scene.launch(SCENES.dialog, {
      message: t('altar.prompt', { cost }),
      confirmText: t('altar.confirm'),
      cancelText: t('altar.cancel'),
      onConfirm: () => {
        if (this.run.gold < cost) {
          this.toast(t('msg.altarNoGold', { cost }), THEME.textRed);
          return;
        }
        this.run.gold -= cost;
        const restoreHp = Math.random() < 0.5;
        const p = this.player;
        if (restoreHp) p.heal((p.stats.maxHp * restorePercent) / 100, 0);
        else p.heal(0, (p.stats.maxMp * restorePercent) / 100);
        this.toast(t('msg.altarUsed', { stat: t(restoreHp ? 'stat.hp' : 'stat.mp') }), THEME.textGreen);
        this.cell.cleared = true;
        this.markInteractableUsed();
        this.syncRun();
        session.save();
      },
    });
  }

  private openTreasure() {
    if (this.cell.cleared) {
      this.toast(t('msg.treasureEmpty'), THEME.textDim);
      return;
    }
    const { goldMin, goldMax } = ROOM_EVENT_CONFIG.treasure;
    const gold = Phaser.Math.Between(goldMin, goldMax);
    addGold(this.run, gold);
    this.cell.cleared = true;
    this.markInteractableUsed();
    floatText(this, this.interactable!.x, this.interactable!.y - 30, `+${gold}G`, THEME.textGold, 22);
    this.toast(t('msg.treasureOpened', { gold }), THEME.textGold);
    session.save();
  }

  private useRest() {
    if (this.cell.cleared) {
      this.toast(t('msg.restUsed'), THEME.textDim);
      return;
    }
    const { hpPercent, mpPercent } = ROOM_EVENT_CONFIG.rest;
    const p = this.player;
    p.heal((p.stats.maxHp * hpPercent) / 100, (p.stats.maxMp * mpPercent) / 100);
    this.cell.cleared = true;
    this.markInteractableUsed();
    this.toast(t('msg.rested'), THEME.textGreen);
    this.syncRun();
    session.save();
  }

  // ───────────────────────── 每幀更新 ─────────────────────────

  toast(message: string, color: string = THEME.text) {
    this.game.events.emit(TOAST_EVENT, message, color);
  }

  private handleActions() {
    for (const action of inputHub.consume()) {
      switch (action) {
        case 'skill1':
        case 'skill2':
        case 'skill3':
          useSkill(this, this.player, Number(action.slice(-1)) - 1, (m, c) => this.toast(m, c));
          break;
        case 'ultimate':
          useSkill(this, this.player, 3, (m, c) => this.toast(m, c));
          break;
        case 'potion1':
        case 'potion2':
        case 'potion3':
        case 'potion4':
        case 'potion5':
          usePotion(this, this.run, this.player, Number(action.slice(-1)) - 1, (m, c) => this.toast(m, c));
          break;
        case 'attack':
          this.combat.manualAttack();
          break;
        case 'unlock':
          this.combat.unlock();
          break;
        case 'equipment':
          this.scene.pause();
          this.scene.launch(SCENES.shop, { mode: 'equipment' });
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

  openMapView() {
    this.syncRun();
    this.scene.pause();
    this.scene.pause(SCENES.ui);
    this.scene.launch(SCENES.map, { mode: 'view' });
    this.scene.bringToTop(SCENES.map);
  }

  openPause() {
    this.syncRun();
    session.save();
    this.scene.pause();
    this.scene.pause(SCENES.ui);
    this.scene.launch(SCENES.settings, { from: SCENES.room });
  }

  /** 解除鎖定（HUD 按鈕使用） */
  unlockTarget() {
    this.combat.unlock();
  }

  update(_time: number, deltaMs: number) {
    if (!this.player || this.transitioning || this.finished) return;
    const dt = Math.min(deltaMs / 1000, 0.05);

    this.handleActions();
    if (!this.scene.isActive()) return; // 動作中開啟了商店等介面

    this.player.move(this.keyboard.moveVector(), dt, this.bounds);
    this.player.update(dt);
    this.combat.update(dt);
    this.enemySystem.update(this.enemies, dt);
    this.drawLockRing();
    this.updateInteractable();
    this.syncRun();

    if (this.player.dead) {
      this.finish(false);
      return;
    }
    this.checkCleared();
    this.checkTransition();
  }

  private drawLockRing() {
    const g = this.lockRing;
    g.clear();
    const p = this.player;
    const locked = this.enemies.find((e) => e.id === p.lockedId && e.alive);
    if (locked) {
      g.lineStyle(3, THEME.lockRing, 1).strokeCircle(locked.x, locked.y, locked.radius + 8);
    }
    const target = this.enemies.find((e) => e.id === p.targetId && e.alive);
    if (target && target !== locked) {
      g.lineStyle(1, THEME.lockRing, 0.5).strokeCircle(target.x, target.y, target.radius + 5);
    }
    // 普攻範圍提示
    g.lineStyle(1, 0xffffff, 0.06).strokeCircle(p.x, p.y, p.radius + p.classDef.attackRange);
  }

  private checkCleared() {
    if (!this.isCombatRoom || this.aliveEnemies.length > 0 || this.enemies.length === 0) return;
    const wasBoss = this.cell.type === 'boss';
    markCleared(this.run.map, this.cell.id);
    this.enemySystem.clear();
    this.drawDoors();
    this.toast(t('hud.roomCleared'), THEME.textGreen);
    session.save();
    if (wasBoss) this.finish(true);
  }

  private checkTransition() {
    const dir = canTransition([this.player], {
      cleared: this.cleared,
      bounds: this.bounds,
      threshold: GAME_CONFIG.room.edgeThreshold + this.player.radius,
      neighbors: neighbors(this.run.map, this.cell.id),
    });
    if (!dir) return;
    const next = neighbors(this.run.map, this.cell.id)[dir]!;
    this.transitioning = true;
    session.cooldowns = this.player.exportCooldowns();
    this.syncRun();
    this.run.currentRoomId = next;
    this.cameras.main.fadeOut(GAME_CONFIG.room.transitionFadeMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ fromDir: dir } satisfies RoomData);
    });
  }

  private finish(victory: boolean) {
    this.finished = true;
    this.syncRun();
    this.time.delayedCall(victory ? 1200 : 800, () => endRun(this, victory));
  }

  private syncRun() {
    if (!this.player) return;
    this.run.hp = Math.round(this.player.hp);
    this.run.mp = Math.round(this.player.mp);
  }
}
