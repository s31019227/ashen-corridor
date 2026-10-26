import Phaser from 'phaser';
import { net } from '../net/client';
import type { Phase } from '../net/protocol';
import { inputHub } from '../systems/InputSystem';
import { SCENES } from './keys';

// 場景之間的切換集中在這裡：連線狀態的「階段」改變時自動換畫面，
// 房主與加入者看到的畫面因此保持一致。

const ALL_SCENES = Object.values(SCENES);

/** 停掉所有場景後啟動指定場景 */
export function switchTo(game: Phaser.Game, key: string, data?: object) {
  for (const k of ALL_SCENES) {
    if (k !== key && (game.scene.isActive(k) || game.scene.isPaused(k) || game.scene.isSleeping(k))) game.scene.stop(k);
  }
  inputHub.reset();
  game.scene.start(key, data);
}

/** 進入格子畫面（戰鬥場景 + HUD） */
export function enterRoom(scene: Phaser.Scene) {
  scene.scene.start(SCENES.room);
  scene.scene.launch(SCENES.ui);
}

/** 離開房間 / 結束單人遊戲，回主選單 */
export function goToMenu(game: Phaser.Game, message?: string) {
  net.leave();
  switchTo(game, SCENES.menu, { message });
}

/** 依階段切換畫面 */
export function attachRouter(game: Phaser.Game) {
  net.on('phase', (phase: Phase) => {
    if (phase === 'lobby') switchTo(game, SCENES.lobby);
    else if (phase === 'play') switchTo(game, SCENES.map, { mode: 'intro' });
    else if (phase === 'result') switchTo(game, SCENES.result);
  });
  net.on('reject', (reason: string) => switchTo(game, SCENES.menu, { message: reason === 'full' ? 'net.full' : 'net.inProgress' }));
  net.on('closed', () => switchTo(game, SCENES.menu, { message: 'net.hostClosed' }));
}
