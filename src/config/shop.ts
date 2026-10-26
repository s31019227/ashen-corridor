import { POTION_IDS } from '../core/types';

// 商店設定。商品 id：裝備直接用裝備 id，藥水用 "potion:<藥水 id>"。

export const potionItemId = (potionId: string) => `potion:${potionId}`;

export const SHOP_CONFIG = {
  /** 起始基礎商店：固定商品 */
  startStock: [
    'rusted_blade',
    'iron_cap',
    'padded_vest',
    'cloth_leggings',
    'worn_boots',
    'copper_ring',
    ...POTION_IDS.map(potionItemId),
  ],
  /** 一般商店：從裝備池中隨機抽取的數量，藥水全部販售 */
  generalEquipmentCount: 4,
  generalEquipmentPool: [
    'rusted_blade',
    'iron_cap',
    'padded_vest',
    'cloth_leggings',
    'worn_boots',
    'copper_ring',
    'tempered_blade',
    'ashen_helm',
    'chain_hauberk',
    'scaled_greaves',
    'shadow_treads',
    'ember_ring',
  ],
  generalPotions: POTION_IDS.map(potionItemId),
};
