import Phaser from 'phaser';
import { createRun } from '../core/runState';
import { randomSeed } from '../core/rng';
import type { ClassId } from '../core/types';
import { clearRun, loadRun } from '../save/storage';
import { session } from '../state/session';
import { inputHub } from '../systems/InputSystem';
import { SCENES } from './keys';

// 場景之間的流程切換集中在這裡。

const GAMEPLAY_SCENES = [SCENES.room, SCENES.ui, SCENES.shop, SCENES.dialog, SCENES.settings, SCENES.map];

function stopGameplay(scene: Phaser.Scene) {
  for (const key of GAMEPLAY_SCENES) {
    if (scene.scene.isActive(key) || scene.scene.isPaused(key) || scene.scene.isSleeping(key)) scene.scene.stop(key);
  }
  inputHub.reset();
  session.cooldowns = {};
}

export function startNewRun(scene: Phaser.Scene, classId: ClassId) {
  session.run = createRun(classId, randomSeed());
  session.save();
  stopGameplay(scene);
  scene.scene.start(SCENES.map, { mode: 'intro' });
}

export function continueRun(scene: Phaser.Scene): boolean {
  const run = loadRun();
  if (!run) return false;
  session.run = run;
  stopGameplay(scene);
  scene.scene.start(SCENES.map, { mode: 'intro' });
  return true;
}

/** 進入目前所在的格子（開始戰鬥場景與 HUD） */
export function enterRoom(scene: Phaser.Scene) {
  scene.scene.start(SCENES.room, {});
  scene.scene.launch(SCENES.ui);
}

export function goToMenu(scene: Phaser.Scene) {
  session.save();
  stopGameplay(scene);
  scene.scene.start(SCENES.menu);
}

/** 結算：清除存檔（死亡或通關都視為本局結束） */
export function endRun(scene: Phaser.Scene, victory: boolean) {
  const run = session.run;
  clearRun();
  stopGameplay(scene);
  scene.scene.start(SCENES.result, {
    victory,
    kills: run?.kills ?? 0,
    gold: run?.goldEarned ?? 0,
    floor: run?.floor ?? 1,
    classId: run?.classId,
  });
  session.run = null;
}
