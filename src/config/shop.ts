// 商店設定。商品 id：裝備直接用裝備 id，藥水用 "potion:<藥水 id>"。
// 起始商店的商品在生成地圖時決定；其他商店在「第一次進入」時依當下難度決定，之後重複進入商品不變。

export const potionItemId = (potionId: string) => `potion:${potionId}`;

export const SHOP_CONFIG = {
  /** 起始商店：只從第 1 階裝備中抽取 */
  start: { equipmentCount: 6, potionCount: 3, maxTier: 1 },
  /** 一般商店 */
  general: {
    equipmentCount: 6,
    potionCount: 2,
    /** 每多少難度多 1 件裝備 */
    extraEquipmentEvery: 5,
    /** 至少幾件普通（第 1 階）裝備，避免後期買不到便宜的過渡裝 */
    minCommon: 2,
    /**
     * 各難度下每件裝備抽到 普通 / 精良 / 稀有 的權重，難度介於兩點之間時線性內插。
     * 普通的權重最低也有 25，加上 minCommon，後期仍買得到低稀有度裝備。
     */
    rarityWeights: [
      { difficulty: 0, weights: [70, 30, 0] },
      { difficulty: 8, weights: [50, 40, 10] },
      { difficulty: 16, weights: [35, 40, 25] },
      { difficulty: 24, weights: [25, 40, 35] },
    ],
  },
  /** 打倒 Boss 進入下一層時，每人從幾件裝備中自選一件；稀有度權重為 普通 / 精良 / 稀有 */
  floorReward: { choices: 3, rarityWeights: [0, 45, 55] },
  /** 賣出裝備時拿回購買價的比例 */
  sellRate: 0.75,
};
