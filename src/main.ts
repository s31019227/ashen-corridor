import Phaser from 'phaser';
import { GAME_CONFIG } from './config/game';
import { THEME } from './config/theme';
import { t } from './i18n';
import './state/session';
import { MenuScene } from './scenes/MenuScene';
import { ClassSelectScene } from './scenes/ClassSelectScene';
import { MapScene } from './scenes/MapScene';
import { RoomScene } from './scenes/RoomScene';
import { UIScene } from './scenes/UIScene';
import { ShopScene } from './scenes/ShopScene';
import { DialogScene } from './scenes/DialogScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ResultScene } from './scenes/ResultScene';

const hint = document.getElementById('rotate-hint');
if (hint) hint.textContent = t('hint.rotate');
document.title = t('game.title');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: THEME.bg,
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 4, // 同時使用搖桿與技能按鈕
  },
  render: {
    antialias: true,
  },
  scene: [MenuScene, ClassSelectScene, MapScene, RoomScene, UIScene, ShopScene, DialogScene, SettingsScene, ResultScene],
});

// 開發模式下方便在瀏覽器 console 檢查狀態
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
