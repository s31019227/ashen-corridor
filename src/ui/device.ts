// 裝置判斷

/** 主要輸入為觸控（手機、平板） */
export function isTouchPrimary(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

/** 手機：觸控為主且螢幕短邊較小。畫面會等比縮小，所以文字要放大才看得清楚 */
export function isPhone(): boolean {
  // 網址加上 ?phone=1 可在電腦上預覽手機版字級
  if (typeof location !== 'undefined' && new URL(location.href).searchParams.has('phone')) return true;
  return isTouchPrimary() && Math.min(screen.width, screen.height) <= 600;
}

/** 手機上的文字放大倍率（小字放大較多，大標題幾乎不變） */
export const PHONE_FONT_SCALE = 1.35;
