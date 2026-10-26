// 遊戲整體設定：畫面、格子、換格、動畫

export const GAME_CONFIG = {
  /** 邏輯解析度，實際畫面依螢幕等比縮放 */
  width: 1280,
  height: 720,

  room: {
    /** 格子（房間）可活動區域與畫面邊緣的距離 */
    margin: 48,
    /** 玩家距離邊緣多少像素以內視為「靠近邊緣」 */
    edgeThreshold: 28,
    /** 換格後玩家出現在新格子時與邊緣的距離（需大於 edgeThreshold，避免立刻又換回去） */
    entrySpawnOffset: 90,
    /** 小怪生成時與玩家的最小距離 */
    enemySpawnMinDistance: 260,
    /** 換格淡出時間（毫秒） */
    transitionFadeMs: 180,
    /** 互動物件（商人、祭壇等）觸發半徑 */
    interactRadius: 60,
  },

  mapIntro: {
    /** 開場時每格出現的間隔（毫秒） */
    cellRevealIntervalMs: 70,
    cellRevealDurationMs: 260,
    /** 動畫結束後自動進入的等待時間（毫秒） */
    autoEnterDelayMs: 900,
  },

  combat: {
    /** 自動普攻預設開關（玩家可在設定中更改） */
    autoAttackDefault: true,
    /** 受擊後無敵時間（秒），避免多個敵人同一幀疊傷 */
    playerHitInvulnSec: 0.25,
    projectileSpeed: 720,
  },
} as const;
