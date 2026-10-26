import Phaser from 'phaser';
import { CLASSES, type ClassDef } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { THEME } from '../config/theme';
import { Cooldown } from '../core/cooldown';
import type { RoomBounds } from '../core/roomTransition';
import type { RunState } from '../core/runState';
import { computeStats } from '../core/stats';
import type { Stats, Vec2 } from '../core/types';
import { floatText } from '../ui/text';

export class Player {
  readonly radius = PLAYER_CONFIG.radius;
  readonly classDef: ClassDef;
  readonly view: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;

  x: number;
  y: number;
  stats: Stats;
  hp: number;
  mp: number;
  facing: Vec2 = { x: 1, y: 0 };

  readonly attackCd: Cooldown;
  /** 0–2：小技能，3：大招 */
  readonly skillCds: Cooldown[];
  /** 藥水欄冷卻（每格一個，換藥水不會重置） */
  readonly potionCds: Cooldown[];

  /** 玩家點擊鎖定的敵人 */
  lockedId: number | null = null;
  /** 本幀選定的普攻目標（可能來自鎖定或預設規則） */
  targetId: number | null = null;
  lastAttackedId: number | null = null;
  private invuln = 0;
  dead = false;

  constructor(
    private scene: Phaser.Scene,
    private run: RunState,
    x: number,
    y: number,
  ) {
    this.classDef = CLASSES[run.classId];
    this.x = x;
    this.y = y;
    this.stats = computeStats(run.classId, run.equipment, run.altarEffects);
    this.hp = Math.min(run.hp, this.stats.maxHp);
    this.mp = Math.min(run.mp, this.stats.maxMp);

    this.attackCd = new Cooldown(this.classDef.attackInterval);
    this.skillCds = [...this.classDef.skills, this.classDef.ultimate].map((s) => new Cooldown(s.cooldown));
    this.potionCds = run.potions.map(() => new Cooldown(0));

    this.body = scene.add.circle(0, 0, this.radius, this.classDef.color).setStrokeStyle(2, 0xe8e0c8);
    // Triangle 的頂點座標以左上角為原點，要用非負座標才會以 (x, y) 為中心
    const facingMark = scene.add.triangle(this.radius + 6, 0, 0, 0, 0, 12, 10, 6, 0xe8e0c8);
    this.view = scene.add.container(x, y, [this.body, facingMark]).setDepth(10);
  }

  /** 普攻間隔（秒），受攻速加成影響 */
  get attackInterval() {
    return this.classDef.attackInterval / (1 + this.stats.attackSpeed / 100);
  }

  /** 普攻射程（像素），職業射程 + 裝備加成 */
  get attackRange() {
    return this.classDef.attackRange + this.stats.attackRange;
  }

  /** 裝備變更後重新計算數值 */
  refreshStats() {
    this.stats = computeStats(this.run.classId, this.run.equipment, this.run.altarEffects);
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.mp = Math.min(this.mp, this.stats.maxMp);
  }

  move(dir: Vec2, dt: number, bounds: RoomBounds) {
    if (dir.x === 0 && dir.y === 0) return;
    const speed = this.stats.moveSpeed * dt;
    this.x = Phaser.Math.Clamp(this.x + dir.x * speed, bounds.left + this.radius, bounds.right - this.radius);
    this.y = Phaser.Math.Clamp(this.y + dir.y * speed, bounds.top + this.radius, bounds.bottom - this.radius);
    this.face(dir);
  }

  face(dir: Vec2) {
    const len = Math.hypot(dir.x, dir.y);
    if (len === 0) return;
    this.facing = { x: dir.x / len, y: dir.y / len };
  }

  update(dt: number) {
    this.attackCd.tick(dt);
    for (const cd of this.skillCds) cd.tick(dt);
    for (const cd of this.potionCds) cd.tick(dt);
    if (this.invuln > 0) this.invuln -= dt;
    const regen = (this.stats.maxMp * this.stats.mpRegen * dt) / 100;
    this.mp = Math.min(this.stats.maxMp, this.mp + regen);

    this.view.setPosition(this.x, this.y);
    this.view.setRotation(Math.atan2(this.facing.y, this.facing.x));
    this.body.setAlpha(this.invuln > 0 ? 0.6 : 1);
  }

  /** 回傳實際受到的傷害；接觸傷害有短暫無敵，技能傷害（ignoreInvuln）不受影響 */
  takeDamage(amount: number, ignoreInvuln = false): number {
    if (this.dead || (!ignoreInvuln && this.invuln > 0)) return 0;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = GAME_CONFIG.combat.playerHitInvulnSec;
    floatText(this.scene, this.x, this.y - 24, `-${amount}`, THEME.textRed);
    this.scene.cameras.main.shake(80, 0.004);
    if (this.hp <= 0) this.dead = true;
    return amount;
  }

  heal(hpAmount: number, mpAmount: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + hpAmount);
    this.mp = Math.min(this.stats.maxMp, this.mp + mpAmount);
  }

  /** 匯出冷卻狀態，換格時帶到下一個格子 */
  exportCooldowns(): Record<string, number> {
    const out: Record<string, number> = { attack: this.attackCd.remaining };
    this.skillCds.forEach((cd, i) => (out[`skill${i}`] = cd.remaining));
    this.potionCds.forEach((cd, i) => (out[`potion${i}`] = cd.remaining));
    return out;
  }

  importCooldowns(data: Record<string, number>) {
    this.attackCd.remaining = data.attack ?? 0;
    this.skillCds.forEach((cd, i) => (cd.remaining = data[`skill${i}`] ?? 0));
    this.potionCds.forEach((cd, i) => (cd.remaining = data[`potion${i}`] ?? 0));
  }
}
