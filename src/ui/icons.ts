import Phaser from 'phaser';
import { THEME } from '../config/theme';
import type { ArmorType, EquipSlot } from '../core/types';

// 裝備部位圖示（向量畫的佔位美術）。防具依類型上色：重甲灰、輕甲棕、布甲紫。

const ARMOR_COLOR: Record<ArmorType, number> = {
  heavy: 0xa4abb8,
  light: 0xb07a46,
  cloth: 0x9a7ad0,
};
const METAL = 0xd8d8e0;
const GOLD = 0xd4af37;

/** 在 (x, y) 畫一個部位圖示（含底框），size 為底框邊長 */
export function addSlotIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  slot: EquipSlot,
  armorType?: ArmorType,
  size = 34,
  dim = false,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, size, size, 0x0e0e14).setStrokeStyle(1, THEME.panelBorder);
  const g = scene.add.graphics();
  const k = size / 34; // 圖形以 34px 為基準繪製
  const color = armorType ? ARMOR_COLOR[armorType] : slot === 'ring' ? GOLD : METAL;
  draw(g, slot, color, k);
  const c = scene.add.container(x, y, [bg, g]);
  if (dim) g.setAlpha(0.35);
  return c;
}

function draw(g: Phaser.GameObjects.Graphics, slot: EquipSlot, color: number, k: number) {
  const p = (x: number, y: number) => new Phaser.Math.Vector2(x * k, y * k);
  switch (slot) {
    case 'weapon':
      // 劍：斜向劍身、護手、握柄、劍首
      g.lineStyle(4 * k, color, 1).lineBetween(-7 * k, 7 * k, 10 * k, -10 * k);
      g.lineStyle(3 * k, GOLD, 1).lineBetween(-10 * k, 2 * k, -2 * k, 10 * k);
      g.lineStyle(3 * k, 0x7a5030, 1).lineBetween(-7 * k, 7 * k, -11 * k, 11 * k);
      g.fillStyle(GOLD, 1).fillCircle(-12 * k, 12 * k, 2.5 * k);
      break;
    case 'helmet':
      // 頭盔：半圓盔頂 + 帽緣 + 眼縫
      g.fillStyle(color, 1).slice(0, 2 * k, 11 * k, Math.PI, 0, false).fillPath();
      g.fillRect(-13 * k, 2 * k, 26 * k, 4 * k);
      g.fillRect(-9 * k, 6 * k, 18 * k, 6 * k);
      g.fillStyle(0x0e0e14, 1).fillRect(-6 * k, -2 * k, 12 * k, 2.5 * k);
      break;
    case 'chest':
      // 胸甲：肩膀較寬的軀幹
      g.fillStyle(color, 1).fillPoints([p(-13, -9), p(-5, -12), p(0, -8), p(5, -12), p(13, -9), p(10, -2), p(9, 12), p(-9, 12), p(-10, -2)], true);
      g.lineStyle(1.5 * k, 0x0e0e14, 0.7).lineBetween(0, -8 * k, 0, 12 * k);
      break;
    case 'legs':
      // 護腿：腰帶 + 兩條腿
      g.fillStyle(color, 1).fillRect(-10 * k, -12 * k, 20 * k, 5 * k);
      g.fillRect(-10 * k, -7 * k, 8 * k, 19 * k);
      g.fillRect(2 * k, -7 * k, 8 * k, 19 * k);
      break;
    case 'boots':
      // 長靴：L 形
      g.fillStyle(color, 1).fillPoints([p(-9, -12), p(1, -12), p(1, 4), p(12, 6), p(12, 12), p(-9, 12)], true);
      g.fillStyle(0x0e0e14, 0.5).fillRect(-9 * k, 9 * k, 21 * k, 3 * k);
      break;
    case 'ring':
      // 戒指：圓環 + 寶石
      g.lineStyle(3.5 * k, color, 1).strokeCircle(0, 3 * k, 8 * k);
      g.fillStyle(0xc03040, 1).fillPoints([p(0, -12), p(5, -7), p(0, -2), p(-5, -7)], true);
      break;
  }
}

/** 藥水瓶圖示 */
export function addPotionIcon(scene: Phaser.Scene, x: number, y: number, liquid: number, size = 34): Phaser.GameObjects.Container {
  const k = size / 34;
  const bg = scene.add.rectangle(0, 0, size, size, 0x0e0e14).setStrokeStyle(1, THEME.panelBorder);
  const g = scene.add.graphics();
  g.fillStyle(0x8a8680, 1).fillRect(-3 * k, -13 * k, 6 * k, 6 * k);
  g.fillStyle(liquid, 1).fillCircle(0, 4 * k, 9 * k);
  g.lineStyle(1.5 * k, 0xd8d4cc, 0.6).strokeCircle(0, 4 * k, 9 * k);
  return scene.add.container(x, y, [bg, g]);
}
