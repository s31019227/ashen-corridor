import Phaser from 'phaser';
import { getAltarEffect } from '../config/altar';
import { CLASSES } from '../config/classes';
import { EQUIPMENT, RARITY, canEquip } from '../config/equipment';
import { GAME_CONFIG } from '../config/game';
import { POTIONS } from '../config/potions';
import { potionItemId } from '../config/shop';
import { THEME } from '../config/theme';
import { isCarried, isOwned, resolveShopItem, sellPrice, type ShopItem } from '../core/inventory';
import { skillPoints } from '../core/leveling';
import { playerStats } from '../core/runState';
import { statDiff, STAT_KEYS } from '../core/stats';
import { renderSkillList } from '../ui/classDetail';
import { attackPower } from '../sim/effects';
import { EQUIP_SLOTS, POTION_IDS, type PotionId } from '../core/types';
import { t, tEvent } from '../i18n';
import { net } from '../net/client';
import type { GameEvent } from '../sim/types';
import { Button } from '../ui/Button';
import { addBackdrop, addPanel } from '../ui/Panel';
import { formatAltarEffect, formatStats, formatStatValue } from '../ui/statText';
import { addPotionIcon, addSlotIcon } from '../ui/icons';
import { addText } from '../ui/text';
import { isPhone } from '../ui/device';

/** 手機字比較大，列與列的間距跟著放大 */
const S = isPhone() ? 1.18 : 1;
import { SCENES } from './keys';

type ShopMode = 'shop' | 'equipment';
type Tab = 'equipment' | 'potion' | 'stats' | 'skills';

interface ShopData {
  mode: ShopMode;
  cellId?: number;
}

/** 判斷是否需要重畫：血量、魔力每幀都在變，不算進去（否則按鈕會一直重建、點不到） */
function shopKey(): string {
  const me = net.me;
  if (!me) return '';
  const { hp: _hp, mp: _mp, ...rest } = me;
  return JSON.stringify(rest);
}

/** 商店與裝備查看介面（疊在戰鬥場景上，開啟時戰鬥場景暫停） */
export class ShopScene extends Phaser.Scene {
  private mode: ShopMode = 'shop';
  private stock: string[] = [];
  private tab: Tab = 'equipment';
  /** 裝備商品太多時分頁 */
  private page = 0;
  private content!: Phaser.GameObjects.Container;
  private lastKey = '';
  /** 第一次按「賣」後等待確認的部位 */
  private sellArmed: string | null = null;
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.shop);
  }

  init(data: ShopData) {
    this.mode = data.mode;
    const run = net.run!;
    this.stock = data.cellId !== undefined ? (run.map.cells[data.cellId].shopStock ?? []) : [];
    this.lastKey = '';
    this.page = 0;
    this.tab = data.mode === 'shop' ? 'equipment' : 'stats';
  }

  create() {
    const { width, height } = GAME_CONFIG;
    addBackdrop(this, 0.75, () => this.close());
    addPanel(this, width / 2, height / 2, 1120, 620);
    addText(this, 104, 58, t(this.mode === 'shop' ? 'shop.title' : 'shop.equipmentTitle'), 28);
    this.message = addText(this, width / 2, height - 92, '', 16, THEME.textDim).setOrigin(0.5);
    new Button(this, width - 180, height - 92, t('shop.close'), () => this.close(), { width: 140, height: 44 });
    this.content = this.add.container(0, 0);
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-C', () => this.mode === 'equipment' && this.close());
    this.render();

    // 購買結果由房主處理：收到自己的訊息就顯示，自己的資料變了就重畫
    const onGame = (e: GameEvent) => {
      if (e.k === 'toast' && e.pid === net.myId) this.message.setText(tEvent(e.key, e.params)).setColor(e.color ?? THEME.text);
    };
    const onState = () => {
      const key = shopKey();
      if (key !== this.lastKey) this.render();
    };
    net.on('game', onGame);
    net.on('state', onState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('game', onGame);
      net.off('state', onState);
    });
  }

  private close() {
    net.popUi();
    this.scene.stop();
  }

  private render() {
    this.lastKey = shopKey();
    this.content.removeAll(true);
    if (this.mode === 'shop') this.renderStock();
    else this.renderStats();
    this.renderInventory();
  }

  private add2<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.content.add(obj);
    return obj;
  }

  private renderStock() {
    const tabs: Tab[] = ['equipment', 'potion'];
    tabs.forEach((tab, i) => {
      const label = t(tab === 'equipment' ? 'shop.tabEquipment' : 'shop.tabPotions');
      const color = this.tab === tab ? THEME.accent : THEME.button;
      const btn = new Button(this, 300 + i * 130, 76, label, () => {
        this.tab = tab;
        this.render();
      }, { width: 120, height: 38, fontSize: 16, color });
      this.add2(btn);
    });
    if (this.tab === 'equipment') this.renderEquipmentStock();
    else this.renderPotionStock();
  }

  /** 裝備依部位分組：左邊一欄是部位名稱（同部位合併），右邊是商品 */
  private renderEquipmentStock() {
    const run = net.me!;
    const items = this.stock
      .map(resolveShopItem)
      .filter((it): it is ShopItem => it !== null && it.kind === 'equipment')
      .sort((a, b) => {
        const da = EQUIPMENT[a.id];
        const db = EQUIPMENT[b.id];
        return EQUIP_SLOTS.indexOf(da.slot) - EQUIP_SLOTS.indexOf(db.slot) || da.tier - db.tier || da.price - db.price;
      });
    const step = 64 * S;
    const top = 136;
    // 一頁放得下幾列（最後一列不能壓到下方的訊息列）
    const perPage = Math.floor((610 - step / 2 - top) / step) + 1;
    const pages = Math.max(1, Math.ceil(items.length / perPage));
    this.page = Math.min(this.page, pages - 1);
    if (pages > 1) {
      const flip = (d: number) => {
        this.page = (this.page + d + pages) % pages;
        this.render();
      };
      this.add2(new Button(this, 560, 76, '◀', () => flip(-1), { width: 44, height: 38, fontSize: 16 }));
      this.add2(addText(this, 618, 76, t('shop.page', { page: this.page + 1, total: pages }), 15, THEME.textDim).setOrigin(0.5));
      this.add2(new Button(this, 676, 76, '▶', () => flip(1), { width: 44, height: 38, fontSize: 16 }));
    }
    const shown = items.slice(this.page * perPage, (this.page + 1) * perPage);
    let groupStart = 0;
    shown.forEach((item, i) => {
      const def = EQUIPMENT[item.id];
      const y = top + i * step;
      const rarity = RARITY[def.tier];
      const owned = isOwned(run, item);
      const usable = canEquip(def, run.classId);
      this.add2(this.add.rectangle(436, y, 568, step - 6, THEME.button, 0.6));
      this.add2(addSlotIcon(this, 172, y, def.slot, def.armorType, 40 * S, !usable));
      const tx = 172 + 26 * S;
      // 名稱用稀有度的顏色，後面標稀有度與限定職業 / 防具類型
      const name = this.add2(addText(this, tx, y - 18 * S, t(item.nameKey), 17, usable ? rarity.color : THEME.textDim).setOrigin(0, 0.5));
      const tag = this.add2(addText(this, tx + 8 + name.width, y - 17 * S, t(rarity.nameKey), 12, rarity.color).setOrigin(0, 0.5));
      this.add2(addText(this, tag.x + 8 + tag.width, y - 17 * S, this.itemTag(item.id), 12, usable ? THEME.textDim : THEME.textRed).setOrigin(0, 0.5));
      this.add2(addText(this, tx, y + 2 * S, formatStats(def.stats, t('shop.noStats')), 13, THEME.textDim).setOrigin(0, 0.5));
      if (!owned && usable) this.renderCompare(item.id, tx, y + 21 * S);
      this.add2(addText(this, 590, y - 12 * S, t('shop.price', { price: item.price }), 15, THEME.textGold).setOrigin(1, 0.5));
      const label = owned ? t('shop.equipped') : usable ? t('shop.buy') : t('shop.wrongClass');
      const btn = new Button(this, 656, y, label, () => this.buy(item), { width: 100, height: 36, fontSize: 15 });
      btn.setEnabled(!owned && usable && run.gold >= item.price);
      this.add2(btn);

      // 同部位的最後一個商品：畫出合併的部位欄
      const next = shown[i + 1];
      if (!next || EQUIPMENT[next.id].slot !== def.slot) {
        const y0 = top + groupStart * step - step / 2 + 3;
        const y1 = y + step / 2 - 3;
        this.add2(this.add.rectangle(112, (y0 + y1) / 2, 60, y1 - y0, 0x1c1b24).setStrokeStyle(1, THEME.panelBorder));
        this.add2(addText(this, 112, (y0 + y1) / 2, t(`slot.${def.slot}`), 15, THEME.textGold).setOrigin(0.5));
        groupStart = i + 1;
      }
    });
  }

  /** 藥水：本店販售的 + 已解鎖的（已解鎖的可免費切換攜帶） */
  private renderPotionStock() {
    const run = net.me!;
    const sold = new Set(
      this.stock.map(resolveShopItem).flatMap((it) => (it?.kind === 'potion' ? [it.potionId] : [])),
    );
    const list = POTION_IDS.filter((id) => sold.has(id) || run.unlockedPotions.includes(id));
    list.forEach((potionId, i) => {
      const def = POTIONS[potionId];
      const item = resolveShopItem(potionItemId(potionId))!;
      const y = 140 + i * 58 * S;
      const unlocked = run.unlockedPotions.includes(potionId);
      const carried = isCarried(run, potionId);
      this.add2(this.add.rectangle(400, y, 640, 52 * S, THEME.button, 0.6));
      this.add2(addPotionIcon(this, 112, y, def.color, 38 * S));
      const name = carried ? `${t(def.nameKey)}（${t('shop.potionCurrent')}）` : t(def.nameKey);
      this.add2(addText(this, 112 + 26 * S, y - 11 * S, name, 17, carried ? THEME.textGreen : THEME.text).setOrigin(0, 0.5));
      this.add2(
        addText(this, 112 + 26 * S, y + 12 * S, t('potion.desc', { hp: def.hpPercent, mp: def.mpPercent, cd: def.cooldown }), 13, THEME.textDim).setOrigin(0, 0.5),
      );
      const priceText = unlocked ? t('shop.unlocked') : t('shop.price', { price: def.price });
      this.add2(addText(this, 520, y, priceText, 16, unlocked ? THEME.textGreen : THEME.textGold).setOrigin(1, 0.5));
      let btn: Button;
      if (carried) {
        btn = new Button(this, 640, y, t('shop.carrying'), () => {}, { width: 120, height: 38, fontSize: 16 }).setEnabled(false);
      } else if (unlocked) {
        btn = new Button(this, 640, y, t('shop.carry'), () => this.carry(potionId), { width: 120, height: 38, fontSize: 16 });
      } else {
        btn = new Button(this, 640, y, t('shop.buy'), () => this.buy(item), { width: 120, height: 38, fontSize: 16 });
        btn.setEnabled(run.gold >= def.price);
      }
      this.add2(btn);
    });
    this.add2(addText(this, 96, 140 + list.length * 58 * S - 8, t('shop.potionRule'), 13, THEME.textDim, { wordWrap: { width: 620 } }));
  }

  /** 部位已經在左欄分組顯示，這裡只標限定職業或防具類型 */
  private itemTag(itemId: string): string {
    const def = EQUIPMENT[itemId];
    if (def.classes) return t('shop.classOnly', { classes: def.classes.map((c) => t(CLASSES[c].nameKey)).join('、') });
    if (def.armorType) return t(`armor.${def.armorType}`);
    return '';
  }

  /** 與同欄位目前裝備比較：增加的（綠）與減少的（紅）分開顯示 */
  private renderCompare(itemId: string, x: number, y: number) {
    const def = EQUIPMENT[itemId];
    const currentId = net.me!.equipment[def.slot];
    const current = currentId ? EQUIPMENT[currentId].stats : {};
    const diff = statDiff(current, def.stats);
    const gains = Object.fromEntries(Object.entries(diff).filter(([, v]) => v! > 0));
    const losses = Object.fromEntries(Object.entries(diff).filter(([, v]) => v! < 0));
    if (Object.keys(diff).length === 0) {
      this.add2(addText(this, x, y, t('shop.compareNone'), 13, THEME.textDim).setOrigin(0, 0.5));
      return;
    }
    let cx = x;
    const part = (text: string, color: string) => {
      const obj = this.add2(addText(this, cx, y, text, 13, color).setOrigin(0, 0.5));
      cx += obj.width + 10;
    };
    part(t('shop.compareLabel'), THEME.textDim);
    if (Object.keys(gains).length > 0) part(`▲ ${formatStats(gains)}`, THEME.textGreen);
    if (Object.keys(losses).length > 0) part(`▼ ${formatStats(losses)}`, THEME.textRed);
  }

  private buy(item: ShopItem) {
    net.act({ k: 'buy', item: item.id });
  }

  private carry(potionId: PotionId) {
    net.act({ k: 'carry', potion: potionId });
  }

  /** 背包模式左側：角色最終屬性與已接受的祭壇契約 */
  /** 背包模式左側：屬性 / 技能 兩個分頁 */
  private renderStats() {
    const tabs: Tab[] = ['stats', 'skills'];
    tabs.forEach((tab, i) => {
      const color = this.tab === tab ? THEME.accent : THEME.button;
      const btn = new Button(this, 300 + i * 130, 76, t(tab === 'stats' ? 'shop.tabStats' : 'shop.tabSkills'), () => {
        this.tab = tab;
        this.render();
      }, { width: 120, height: 38, fontSize: 16, color });
      this.add2(btn);
    });
    if (this.tab === 'skills') {
      const me = net.me!;
      this.add2(addText(this, 96, 112, `Lv.${me.level}　${t('hud.skillPoints', { n: skillPoints(me) })}`, 16, THEME.textGold));
      renderSkillList(this, this.content, me.classId, 96, 146, 610, isPhone(), me.skillRanks);
      return;
    }
    const run = net.me!;
    const stats = { ...playerStats(run) };
    // 面板攻擊力含被動加成（例如戰士嗜血）
    const me = net.meEntity;
    if (me && net.world) stats.atk = Math.round(attackPower({ run: net.run!, world: net.world, moves: {}, events: [] }, me));
    this.add2(addText(this, 96, 110, t('shop.finalStats'), 18, THEME.textDim));
    STAT_KEYS.forEach((k, i) => {
      this.add2(addText(this, 96, 145 + i * 29 * S, `${t(`stat.${k}`)}`, 16, THEME.textDim));
      this.add2(addText(this, 260, 145 + i * 29 * S, formatStatValue(k, stats[k]), 16));
    });
    const ay = 145 + STAT_KEYS.length * 29 * S + 16;
    this.add2(addText(this, 96, ay, t('shop.altarEffects'), 18, THEME.textDim));
    const effects = run.altarEffects.map(getAltarEffect).filter((e) => e !== undefined);
    if (effects.length === 0) this.add2(addText(this, 96, ay + 34 * S, t('shop.none'), 15, THEME.textDim));
    effects.forEach((e, i) => {
      this.add2(addText(this, 96, ay + (34 + i * 26) * S, `${t(e.nameKey)}：${formatAltarEffect(e)}`, 15, THEME.textGold));
    });
  }

  /** 右側：身上裝備（含屬性）與藥水 */
  private renderInventory() {
    const run = net.me!;
    const x = 760;
    const w = 400;
    this.add2(addText(this, x, 70, t('hud.gold', { gold: run.gold }), 20, THEME.textGold));
    EQUIP_SLOTS.forEach((slot, i) => {
      const y = 130 + i * 48 * S;
      const itemId = run.equipment[slot];
      const def = itemId ? EQUIPMENT[itemId] : null;
      this.add2(this.add.rectangle(x + w / 2, y, w, 42 * S, THEME.button, 0.6));
      this.add2(addSlotIcon(this, x + 22, y, slot, def?.armorType, 34 * S, !def));
      this.add2(addText(this, x + 46 * S, y, t(`slot.${slot}`), 14, THEME.textDim).setOrigin(0, 0.5));
      const nx = x + 46 * S + 50 * S;
      this.add2(addText(this, nx, y - 9 * S, def ? t(def.nameKey) : t('shop.empty'), 15, def ? RARITY[def.tier].color : THEME.textDim).setOrigin(0, 0.5));
      const statsLine = def ? formatStats(def.stats, t('shop.noStats')) : t('shop.slotEmpty');
      this.add2(addText(this, nx, y + 10 * S, statsLine, 12, def ? THEME.textGreen : THEME.textDim).setOrigin(0, 0.5));
      // 商店中可以賣出身上的裝備（購買價的 75%），按兩下確認
      if (this.mode === 'shop' && itemId) {
        const price = sellPrice(itemId);
        const sell: Button = new Button(this, x + w - 44, y, t('shop.sell', { gold: price }), () => {
          if (this.sellArmed !== slot) {
            this.sellArmed = slot;
            sell.setText(t('shop.sellConfirm'));
            this.time.delayedCall(2000, () => {
              if (this.sellArmed === slot && sell.active) {
                this.sellArmed = null;
                sell.setText(t('shop.sell', { gold: price }));
              }
            });
            return;
          }
          this.sellArmed = null;
          net.act({ k: 'sell', slot });
        }, { width: 76, height: 30 * S, fontSize: 13, color: 0x3a2a1a });
        this.add2(sell);
      }
    });
    const py = 130 + EQUIP_SLOTS.length * 48 * S;
    this.add2(addText(this, x, py, t('shop.potionSlots'), 16, THEME.textDim));
    run.potions.forEach((potionId, i) => {
      const cx = x + 30 + i * 68;
      const def = potionId ? POTIONS[potionId] : null;
      this.add2(this.add.rectangle(cx, py + 50, 56, 56, def ? def.color : THEME.button, def ? 0.8 : 0.4).setStrokeStyle(1, THEME.panelBorder));
      this.add2(addText(this, cx, py + 50, def ? t(def.shortKey) : `${i + 1}`, 12).setOrigin(0.5));
      if (def) this.add2(addText(this, cx + 40, py + 50, t(def.nameKey), 15).setOrigin(0, 0.5));
    });
  }
}
