import type Phaser from 'phaser';

// 全螢幕：Android / 電腦用瀏覽器的全螢幕 API；iPhone 的 Safari 不支援，
// 改用「分享 → 加入主畫面」，從主畫面打開時會以全螢幕 App 模式執行（見 public/manifest.webmanifest）。

export function fullscreenSupported(game: Phaser.Game): boolean {
  return game.device.fullscreen.available;
}

/** 是否從主畫面以 App 模式開啟 */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches === true;
}

/** 切換全螢幕；回傳 false 表示這個瀏覽器不支援（呼叫端顯示「加入主畫面」提示） */
export function toggleFullscreen(game: Phaser.Game): boolean {
  if (!fullscreenSupported(game)) return false;
  if (game.scale.isFullscreen) {
    game.scale.stopFullscreen();
    return true;
  }
  game.scale.startFullscreen();
  // 手機進入全螢幕後鎖定橫向（只有部分瀏覽器支援，失敗就算了）
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation?.lock?.('landscape').catch(() => {});
  return true;
}
