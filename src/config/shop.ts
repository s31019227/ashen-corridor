// 商店設定。商品 id：裝備直接用裝備 id，藥水用 "potion:<藥水 id>"。
// 每間商店（含起始商店）的商品在生成地圖時隨機決定，同一間商店重複進入時商品不變。

export const potionItemId = (potionId: string) => `potion:${potionId}`;

export const SHOP_CONFIG = {
  /** 起始商店：只從第 1 階裝備中抽取 */
  start: { equipmentCount: 6, potionCount: 3, maxTier: 1 },
  /** 一般商店：所有裝備都可能出現 */
  general: { equipmentCount: 6, potionCount: 2, maxTier: 2 },
  /** 賣出裝備時拿回購買價的比例 */
  sellRate: 0.75,
};
