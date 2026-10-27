import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { THEME } from '../config/theme';
import { t } from '../i18n';
import { net } from '../net/client';
import { isPhone } from './device';
import { addText } from './text';

type Scope = 'room' | 'floor';

const ROWS = 4;

/**
 * DPS 表：顯示每位玩家的 DPS 與總傷害。點一下切換「本房」／「本層」。
 * DPS = 傷害 ÷ 戰鬥時間（第一次造成傷害到清空為止）。
 */
export class DpsMeter {
  private scope: Scope = 'room';
  private title: Phaser.GameObjects.Text;
  private rows: { bar: Phaser.GameObjects.Rectangle; name: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[] = [];
  private lastUpdate = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private width: number,
  ) {
    const rowH = isPhone() ? 26 : 20;
    const bg = scene.add.rectangle(x, y, width, 26 + rowH * ROWS, 0x000000, 0.35).setOrigin(0);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.scope = this.scope === 'room' ? 'floor' : 'room';
      this.lastUpdate = 0;
    });
    this.title = addText(scene, x + 6, y + 4, '', 12, THEME.textGold);
    for (let i = 0; i < ROWS; i++) {
      const ry = y + 26 + i * rowH + rowH / 2;
      const bar = scene.add.rectangle(x + 4, ry, 0, rowH - 4, 0xffffff, 0.18).setOrigin(0, 0.5);
      const name = addText(scene, x + 8, ry, '', 12).setOrigin(0, 0.5);
      const value = addText(scene, x + width - 6, ry, '', 12, THEME.text).setOrigin(1, 0.5);
      this.rows.push({ bar, name, value });
    }
  }

  update(now: number) {
    if (now - this.lastUpdate < 250) return; // 每秒更新 4 次就夠
    this.lastUpdate = now;
    const run = net.run;
    const world = net.world;
    if (!run || !world) return;
    const damage = this.scope === 'room' ? world.damage : run.floorDamage;
    const time = Math.max(1, this.scope === 'room' ? world.combatTime : run.floorCombatTime);
    this.title.setText(t(this.scope === 'room' ? 'dps.titleRoom' : 'dps.titleFloor'));

    const list = Object.values(run.players)
      .map((p) => ({ p, dmg: damage[p.id] ?? 0 }))
      .sort((a, b) => b.dmg - a.dmg);
    const top = Math.max(1, list[0]?.dmg ?? 1);
    this.rows.forEach((row, i) => {
      const entry = list[i];
      if (!entry) {
        row.bar.width = 0;
        row.name.setText('');
        row.value.setText('');
        return;
      }
      const { p, dmg } = entry;
      row.bar.width = (this.width - 8) * (dmg / top);
      row.bar.setFillStyle(p.color, p.id === net.myId ? 0.35 : 0.2);
      row.name.setText(net.isMultiplayer ? p.name : t(CLASSES[p.classId].nameKey));
      row.value.setText(`${Math.round(dmg / time)}/s  ${Math.round(dmg).toLocaleString()}`);
    });
  }
}
