// 多人連線設定

export const MULTIPLAYER_CONFIG = {
  maxPlayers: 4,
  /** 每多一位玩家，怪物血量提升（%） */
  enemyHpPerExtraPlayer: 60,
  /** 倒地的玩家在隊友清完格子（或換格）後以此血量復活（最大血量 %） */
  reviveHpPercent: 30,
  /** PeerJS 房間 id 前綴，避免跟其他遊戲撞名 */
  peerPrefix: 'ashen-corridor-v1-',
  /** 房主傳送快照的間隔（秒） */
  snapshotInterval: 0.05,
  /** 加入者顯示其他人位置時的延遲（毫秒），用來在兩個快照之間補間 */
  interpDelayMs: 100,
  /** 自己的預測位置與房主差距超過此值（像素）時直接校正 */
  reconcileSnapDistance: 80,
  /** 玩家顏色 */
  colors: [0xe8e0c8, 0x6ab0e0, 0xe0a050, 0x9ad070],
};
