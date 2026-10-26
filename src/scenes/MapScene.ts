import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { ROOM_COLORS, THEME } from '../config/theme';
import { bfsDistances, neighbors } from '../core/mapGen';
import type { FloorMap, RoomType } from '../core/types';
import { t } from '../i18n';
import { net } from '../net/client';
import { Button } from '../ui/Button';
import { addBackdrop } from '../ui/Panel';
import { addText } from '../ui/text';
import { enterRoom } from './flow';
import { SCENES } from './keys';

type MapMode = 'intro' | 'view';

const LEGEND_TYPES: RoomType[] = ['start', 'shop', 'mob', 'boss', 'altar', 'treasure', 'rest', 'empty'];

/** 在任意場景中畫出地圖，回傳每格的圖形（依 id 排列） */
export function drawMap(
  scene: Phaser.Scene,
  map: FloorMap,
  cx: number,
  cy: number,
  cellSize: number,
  currentId: number | null,
  container?: Phaser.GameObjects.Container,
): { cells: Phaser.GameObjects.Container[]; links: Phaser.GameObjects.Graphics } {
  const gap = Math.max(2, cellSize * 0.18);
  const step = cellSize + gap;
  const originX = cx - (map.width * step) / 2 + step / 2;
  const originY = cy - (map.height * step) / 2 + step / 2;
  const pos = (x: number, y: number) => ({ x: originX + x * step, y: originY + y * step });

  // 相鄰格之間的通道
  const links = scene.add.graphics();
  links.lineStyle(Math.max(2, cellSize * 0.12), THEME.panelBorder, 1);
  for (const cell of map.cells) {
    const n = neighbors(map, cell.id);
    for (const dir of ['right', 'down'] as const) {
      const other = n[dir];
      if (other === undefined) continue;
      const a = pos(cell.x, cell.y);
      const b = pos(map.cells[other].x, map.cells[other].y);
      links.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  container?.add(links);

  const cells = map.cells.map((cell) => {
    const p = pos(cell.x, cell.y);
    const c = scene.add.container(p.x, p.y);
    const rect = scene.add.rectangle(0, 0, cellSize, cellSize, ROOM_COLORS[cell.type]).setStrokeStyle(
      cell.id === currentId ? 3 : 1,
      cell.id === currentId ? 0xffffff : 0x000000,
    );
    c.add(rect);
    if (cellSize >= 36) {
      const label = t(`room.${cell.type}`);
      c.add(addText(scene, 0, 0, label.slice(0, 2), Math.round(cellSize * 0.28)).setOrigin(0.5));
    }
    if (cell.id === currentId) {
      c.add(scene.add.circle(0, cellSize * 0.32, Math.max(3, cellSize * 0.1), 0xffffff));
    }
    container?.add(c);
    return c;
  });
  return { cells, links };
}

/**
 * 地圖總覽。
 * - intro：進入一層時，格子由起點向外逐格出現，結束後進入格子。
 * - view：遊戲中查看地圖（暫停戰鬥場景）。
 */
export class MapScene extends Phaser.Scene {
  private mode: MapMode = 'intro';
  private done = false;

  constructor() {
    super(SCENES.map);
  }

  init(data: { mode?: MapMode }) {
    this.mode = data.mode ?? 'intro';
    this.done = false;
  }

  create() {
    const run = net.run;
    if (!run) {
      this.scene.start(SCENES.menu);
      return;
    }
    const { width, height } = GAME_CONFIG;
    const map = run.map;

    // 接續存檔或中途重新連線時不在起點，直接進入格子，不播開場動畫
    if (this.mode === 'intro' && run.currentRoomId !== map.startId) {
      this.enter();
      return;
    }

    if (this.mode === 'view') addBackdrop(this, 0.85, () => this.close());

    addText(this, width / 2, 44, t('map.title', { floor: run.floor }), 32).setOrigin(0.5);
    const { cells, links } = drawMap(this, map, width / 2 - 90, height / 2 + 10, 62, run.currentRoomId);
    this.drawLegend(width - 200, 150);

    if (this.mode === 'view') {
      new Button(this, width / 2, height - 44, t('map.close'), () => this.close(), { width: 180 });
      return;
    }

    // 開場動畫：依與起點的距離逐格出現
    const distances = bfsDistances(map, map.startId);
    const order = [...map.cells].sort((a, b) => (distances.get(a.id)! - distances.get(b.id)!) || a.id - b.id);
    const { cellRevealIntervalMs, cellRevealDurationMs, autoEnterDelayMs } = GAME_CONFIG.mapIntro;
    cells.forEach((c) => c.setScale(0).setAlpha(0));
    order.forEach((cell, i) => {
      this.tweens.add({
        targets: cells[cell.id],
        scale: 1,
        alpha: 1,
        duration: cellRevealDurationMs,
        delay: i * cellRevealIntervalMs,
        ease: 'Back.easeOut',
      });
    });
    const total = order.length * cellRevealIntervalMs + cellRevealDurationMs;
    links.setAlpha(0);
    this.tweens.add({ targets: links, alpha: 1, duration: total });
    const hint = addText(this, width / 2, height - 44, t('map.tapToEnter'), 18, THEME.textDim).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: hint, alpha: 1, delay: total, duration: 300 });
    this.time.delayedCall(total + autoEnterDelayMs, () => this.enter());
    // 稍等一下才接受跳過，避免上一個畫面的點擊直接跳過動畫
    this.time.delayedCall(400, () => {
      this.input.once('pointerdown', () => this.enter());
      this.input.keyboard?.once('keydown', () => this.enter());
    });
  }

  private drawLegend(x: number, y: number) {
    addText(this, x, y - 36, t('map.legend'), 18, THEME.textDim);
    LEGEND_TYPES.forEach((type, i) => {
      this.add.rectangle(x + 10, y + i * 34, 20, 20, ROOM_COLORS[type]);
      addText(this, x + 30, y + i * 34, t(`room.${type}`), 16).setOrigin(0, 0.5);
    });
  }

  private enter() {
    if (this.done) return;
    this.done = true;
    enterRoom(this);
  }

  private close() {
    net.popUi();
    this.scene.stop();
  }
}
