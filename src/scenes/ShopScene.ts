import Phaser from 'phaser';
import { getAltarEffect } from '../config/altar';
import { CLASSES } from '../config/classes';
import { EQUIPMENT, canEquip } from '../config/equipment';
import { GAME_CONFIG } from '../config/game';
import { POTIONS } from '../config/potions';
import { potionItemId } from '../config/shop';
import { THEME } from '../config/theme';
import { isCarried, isOwned, resolveShopItem, type ShopItem } from '../core/inventory';
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

/** 商店與裝備查看介面（疊在戰鬥場景上，開啟時戰鬥場景暫停） */
export class ShopScene extends Phaser.Scene {
  private mode: ShopMode = 'shop';
  private stock: string[] = [];
  private tab: Tab = 'equipment';
  private content!: Phaser.GameObjects.Container;
  private lastKey = '';
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.shop);
  }

  init(data: ShopData) {
    this.mode = data.mode;
    const run = net.run!;
    this.stock = data.cellId !== undefined ? (run.map.cells[data.cellId].shopStock ?? []) : [];
    this.lastKey = '';
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
      const key = JSON.stringify(net.me ?? null);
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
    this.lastKey = JSON.stringify(net.me ?? null);
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

  private renderEquipmentStock() {
    const run = net.me!;
    const items = this.stock
      .map(resolveShopItem)
      .filter((it): it is ShopItem => it !== null && it.kind === 'equipment');
    items.forEach((item, i) => {
      const def = EQUIPMENT[item.id];
      const y = 140 + i * 66 * S;
      const owned = isOwned(run, item);
      const usable = canEquip(def, run.classId);
      this.add2(this.add.rectangle(400, y, 640, 60 * S, THEME.button, 0.6));
      const name = this.add2(addText(this, 96, y - 18 * S, t(item.nameKey), 17, usable ? THEME.text : THEME.textDim).setOrigin(0, 0.5));
      this.add2(addText(this, 104 + name.width, y - 17 * S, this.itemTag(item.id), 12, usable ? THEME.textDim : THEME.textRed).setOrigin(0, 0.5));
      this.add2(addText(this, 96, y + 2 * S, formatStats(def.stats, t('shop.noStats')), 13, THEME.textDim).setOrigin(0, 0.5));
      if (!owned && usable) {
        const [text, color] = this.compareText(item.id);
        this.add2(addText(this, 96, y + 21 * S, text, 13, color).setOrigin(0, 0.5));
      }
      this.add2(addText(this, 520, y, t('shop.price', { price: item.price }), 16, THEME.textGold).setOrigin(1, 0.5));
      const label = owned ? t('shop.equipped') : usable ? t('shop.buy') : t('shop.wrongClass');
      const btn = new Button(this, 640, y, label, () => this.buy(item), { width: 120, height: 38, fontSize: 16 });
      btn.setEnabled(!owned && usable && run.gold >= item.price);
      this.add2(btn);
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
      const name = carried ? `${t(def.nameKey)}（${t('shop.potionCurrent')}）` : t(def.nameKey);
      this.add2(addText(this, 96, y - 11 * S, name, 17, carried ? THEME.textGreen : THEME.text).setOrigin(0, 0.5));
      this.add2(
        addText(this, 96, y + 12 * S, t('potion.desc', { hp: def.hpPercent, mp: def.mpPercent, cd: def.cooldown }), 13, THEME.textDim).setOrigin(0, 0.5),
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

  /** 標籤：武器顯示限定職業，防具顯示類型 */
  private itemTag(itemId: string): string {
    const def = EQUIPMENT[itemId];
    const slot = t(`slot.${def.slot}`);
    if (def.classes) return `${slot}・${t('shop.classOnly', { classes: def.classes.map((c) => t(CLASSES[c].nameKey)).join('、') })}`;
    if (def.armorType) return `${slot}・${t(`armor.${def.armorType}`)}`;
    return slot;
  }

  /** 與同欄位目前裝備比較，回傳文字與顏色（全部提升為綠、全部下降為紅、有升有降為金） */
  private compareText(itemId: string): [string, string] {
    const def = EQUIPMENT[itemId];
    const currentId = net.me!.equipment[def.slot];
    const current = currentId ? EQUIPMENT[currentId].stats : {};
    const diff = statDiff(current, def.stats);
    const values = Object.values(diff) as number[];
    if (values.length === 0) return [t('shop.compareNone'), THEME.textDim];
    const color = values.every((v) => v > 0) ? THEME.textGreen : values.every((v) => v < 0) ? THEME.textRed : THEME.textGold;
    return [t('shop.compare', { diff: formatStats(diff) }), color];
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
      this.add2(addText(this, x + 10, y, t(`slot.${slot}`), 15, THEME.textDim).setOrigin(0, 0.5));
      this.add2(addText(this, x + 70, y - 9 * S, def ? t(def.nameKey) : t('shop.empty'), 15, def ? THEME.text : THEME.textDim).setOrigin(0, 0.5));
      const statsLine = def ? formatStats(def.stats, t('shop.noStats')) : t('shop.slotEmpty');
      this.add2(addText(this, x + 70, y + 10 * S, statsLine, 12, def ? THEME.textGreen : THEME.textDim).setOrigin(0, 0.5));
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
