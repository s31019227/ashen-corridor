import Phaser from 'phaser';
import { EQUIPMENT } from '../config/equipment';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { POTIONS } from '../config/potions';
import { THEME } from '../config/theme';
import { buyItem, isOwned, resolveShopItem, type ShopItem } from '../core/inventory';
import { computeStats } from '../core/stats';
import { EQUIP_SLOTS, type StatKey } from '../core/types';
import { t } from '../i18n';
import { session } from '../state/session';
import { Button } from '../ui/Button';
import { addBackdrop, addPanel } from '../ui/Panel';
import { addText } from '../ui/text';
import { SCENES } from './keys';

type ShopMode = 'shop' | 'equipment';
type Tab = 'equipment' | 'potion';

interface ShopData {
  mode: ShopMode;
  cellId?: number;
}

const STAT_KEYS: StatKey[] = ['maxHp', 'maxMp', 'atk', 'def', 'moveSpeed'];

/** 商店與裝備查看介面（疊在戰鬥場景上，開啟時戰鬥場景暫停） */
export class ShopScene extends Phaser.Scene {
  private mode: ShopMode = 'shop';
  private stock: string[] = [];
  private tab: Tab = 'equipment';
  private content!: Phaser.GameObjects.Container;
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.shop);
  }

  init(data: ShopData) {
    this.mode = data.mode;
    const run = session.run!;
    this.stock = data.cellId !== undefined ? (run.map.cells[data.cellId].shopStock ?? []) : [];
    this.tab = 'equipment';
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
  }

  private close() {
    session.save();
    this.scene.stop();
    this.scene.resume(SCENES.room);
  }

  private render() {
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
    const run = session.run!;
    const tabs: Tab[] = ['equipment', 'potion'];
    tabs.forEach((tab, i) => {
      const btn = new Button(this, 300 + i * 130, 76, t(tab === 'equipment' ? 'shop.tabEquipment' : 'shop.tabPotions'), () => {
        this.tab = tab;
        this.render();
      }, { width: 120, height: 38, fontSize: 16, color: this.tab === tab ? THEME.accent : THEME.button });
      this.add2(btn);
    });

    const items = this.stock
      .map(resolveShopItem)
      .filter((it): it is ShopItem => it !== null && (it.kind === 'potion') === (this.tab === 'potion'));

    items.forEach((item, i) => {
      const y = 140 + i * 58;
      this.add2(this.add.rectangle(400, y, 640, 50, THEME.button, 0.6));
      this.add2(addText(this, 96, y - 12, t(item.nameKey), 18));
      this.add2(addText(this, 96, y + 10, this.itemDesc(item), 13, THEME.textDim));
      this.add2(
        addText(this, 520, y, item.price === 0 ? t('shop.free') : t('shop.price', { price: item.price }), 16, THEME.textGold).setOrigin(
          1,
          0.5,
        ),
      );
      const owned = isOwned(run, item);
      const label = owned ? t(item.kind === 'equipment' ? 'shop.equipped' : 'shop.owned') : t('shop.buy');
      const btn = new Button(this, 640, y, label, () => this.buy(item), { width: 120, height: 38, fontSize: 16 });
      btn.setEnabled(!owned && run.gold >= item.price);
      this.add2(btn);
    });
  }

  private itemDesc(item: ShopItem): string {
    if (item.kind === 'potion') {
      const def = POTIONS[item.potionId];
      return t('potion.desc', { hp: def.hpPercent, mp: def.mpPercent, cd: def.cooldown });
    }
    const def = EQUIPMENT[item.id];
    const stats = Object.entries(def.stats)
      .map(([k, v]) => `${t(`stat.${k}`)} +${v}`)
      .join('  ');
    return `${t(`slot.${def.slot}`)}・${stats}`;
  }

  private buy(item: ShopItem) {
    const result = buyItem(session.run!, item.id);
    const msg: Record<string, [string, string]> = {
      ok: [t('shop.bought', { name: t(item.nameKey) }), THEME.textGreen],
      noGold: [t('shop.noGold'), THEME.textRed],
      owned: [t('shop.owned'), THEME.textDim],
      full: [t('shop.potionFull'), THEME.textRed],
      unknown: ['?', THEME.textRed],
    };
    const [text, color] = msg[result];
    this.message.setText(text).setColor(color);
    if (result === 'ok') session.save();
    this.render();
  }

  private renderStats() {
    const run = session.run!;
    const stats = computeStats(run.classId, run.equipment);
    STAT_KEYS.forEach((k, i) => {
      this.add2(addText(this, 96, 140 + i * 40, `${t(`stat.${k}`)}`, 18, THEME.textDim));
      this.add2(addText(this, 300, 140 + i * 40, `${stats[k]}`, 18));
    });
  }

  private renderInventory() {
    const run = session.run!;
    const x = 790;
    this.add2(addText(this, x, 70, t('hud.gold', { gold: run.gold }), 20, THEME.textGold));
    EQUIP_SLOTS.forEach((slot, i) => {
      const y = 130 + i * 44;
      const itemId = run.equipment[slot];
      this.add2(this.add.rectangle(x + 175, y, 350, 38, THEME.button, 0.6));
      this.add2(addText(this, x + 10, y, t(`slot.${slot}`), 15, THEME.textDim).setOrigin(0, 0.5));
      this.add2(
        addText(this, x + 90, y, itemId ? t(EQUIPMENT[itemId].nameKey) : t('shop.empty'), 16, itemId ? THEME.text : THEME.textDim).setOrigin(
          0,
          0.5,
        ),
      );
    });
    const py = 130 + EQUIP_SLOTS.length * 44 + 10;
    this.add2(addText(this, x, py, t('shop.potionSlots'), 16, THEME.textDim));
    run.potions.forEach((potionId, i) => {
      const cx = x + 30 + i * 68;
      const def = potionId ? POTIONS[potionId] : null;
      this.add2(this.add.rectangle(cx, py + 50, 56, 56, def ? def.color : THEME.button, def ? 0.8 : 0.4).setStrokeStyle(1, THEME.panelBorder));
      this.add2(addText(this, cx, py + 50, def ? t(def.shortKey) : `${i + 1}`, 12).setOrigin(0.5));
    });
    if (!PLAYER_CONFIG.applyEquipmentStats) {
      this.add2(addText(this, x, py + 92, t('shop.statsInactive'), 13, THEME.textDim));
    }
  }
}
