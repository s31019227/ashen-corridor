import { getAltarEffect } from '../config/altar';
import { CLASSES, rankValue } from '../config/classes';
import { learnSkill } from '../core/leveling';
import { ROOM_EVENT_CONFIG } from '../config/map';
import { POTIONS } from '../config/potions';
import { cdReady, cdTrigger } from '../core/cooldown';
import { buyItem, carryPotion, resolveShopItem, sellEquipped } from '../core/inventory';
import { EQUIPMENT } from '../config/equipment';
import { addGold } from '../core/runState';
import { EQUIP_SLOTS, POTION_IDS, type EquipSlot, type PotionId } from '../core/types';
import { runSkill } from '../systems/SkillSystem';
import { hpLock } from './effects';
import { addHealThreat } from './threat';
import type { PlayerAction, Sim } from './types';
import { refreshPlayerStats } from './world';

// 玩家動作：由房主執行（自己的動作直接呼叫，其他人的動作從連線收到）。

const toast = (sim: Sim, pid: string, key: string, color?: string, params?: Record<string, string | number>) =>
  sim.events.push({ k: 'toast', pid, key, color, params });

const COLOR = { dim: '#8a8680', red: '#d05050', green: '#7fb069', gold: '#c9a227' };

export function applyAction(sim: Sim, pid: string, a: PlayerAction) {
  const p = sim.world.players[pid];
  const pr = sim.run.players[pid];
  if (!p || !pr || !p.connected) return;
  const cell = sim.run.map.cells[sim.world.roomId];
  const inShop = cell.type === 'shop' || cell.type === 'start';

  switch (a.k) {
    case 'auto':
      pr.autoAttack = !!a.on;
      return;
    case 'unlock':
      p.lockedId = null;
      return;
    case 'lock':
      if (sim.world.enemies.some((e) => e.id === a.id && e.alive)) p.lockedId = a.id;
      return;
  }
  if (p.dead) return;

  switch (a.k) {
    case 'skill': {
      const def = CLASSES[pr.classId];
      const skill = a.i < 3 ? def.skills[a.i] : def.ultimate;
      const cd = p.skillCds[a.i];
      const rank = pr.skillRanks[a.i] ?? 0;
      if (!skill || !cd) return;
      if (rank <= 0) return toast(sim, pid, 'msg.notLearned', COLOR.dim);
      if (skill.kind === 'passive') return toast(sim, pid, 'msg.passiveSkill', COLOR.dim);
      if (!cdReady(cd)) return toast(sim, pid, 'msg.onCooldown', COLOR.dim);
      // 開關型技能：關閉時不耗魔、不進冷卻
      const turningOff = skill.kind === 'toggle' && p.toggles[skill.id];
      const cost = turningOff ? 0 : rankValue(skill.mpCost, rank);
      if (p.mp < cost) return toast(sim, pid, 'msg.notEnoughMp', COLOR.red);
      p.mp -= cost;
      const cooldown = rankValue(skill.cooldown, rank) * (1 - p.stats.cooldownReduction / 100);
      // 開關型技能 0 冷卻時給一點間隔，避免連按
      cdTrigger(cd, skill.kind === 'toggle' ? Math.max(cooldown, 0.3) : cooldown);
      if (!runSkill({ sim, player: p, skill, index: a.i, rank })) {
        // 施放失敗（例如沒有目標）：退還魔力與冷卻
        p.mp += cost;
        cd.remaining = 0;
      }
      return;
    }
    case 'learn': {
      if (learnSkill(pr, a.i)) {
        const def = CLASSES[pr.classId];
        const skill = a.i < 3 ? def.skills[a.i] : def.ultimate;
        p.skillCds[a.i].duration = rankValue(skill.cooldown, pr.skillRanks[a.i]);
      }
      return;
    }
    case 'potion': {
      const potionId = pr.potions[a.i];
      if (a.i >= pr.potions.length) return;
      if (!potionId) return toast(sim, pid, 'msg.emptyPotionSlot', COLOR.dim);
      const cd = p.potionCds[a.i];
      if (!cdReady(cd)) return toast(sim, pid, 'msg.onCooldown', COLOR.dim);
      const def = POTIONS[potionId];
      const hp = Math.round((p.stats.maxHp * def.hpPercent) / 100);
      const mp = Math.round((p.stats.maxMp * def.mpPercent) / 100);
      const hpBefore = p.hp;
      if (hpLock(p) === null) p.hp = Math.min(p.stats.maxHp, p.hp + hp);
      p.mp = Math.min(p.stats.maxMp, p.mp + mp);
      cdTrigger(cd, def.cooldown);
      addHealThreat(sim, pid, p.hp - hpBefore);
      sim.events.push({ k: 'heal', pid, hp: Math.round(p.hp - hpBefore), mp });
      return toast(sim, pid, 'msg.potionUsed', COLOR.green, { name: def.nameKey });
    }
    case 'interact':
      return triggerInteract(sim, pid);
    case 'buy': {
      if (!inShop || !cell.shopStock?.includes(a.item)) return;
      const item = resolveShopItem(a.item);
      if (!item) return;
      const result = buyItem(pr, a.item);
      if (result === 'ok') {
        refreshPlayerStats(sim, pid);
        return toast(sim, pid, item.kind === 'potion' ? 'shop.potionUnlocked' : 'shop.bought', COLOR.green, { name: item.nameKey });
      }
      const keys = { noGold: 'shop.noGold', owned: 'shop.owned', wrongClass: 'shop.wrongClass', unknown: 'shop.owned' };
      return toast(sim, pid, keys[result], COLOR.red);
    }
    case 'sell': {
      const slot = a.slot as EquipSlot;
      if (!inShop || !EQUIP_SLOTS.includes(slot)) return;
      const itemId = pr.equipment[slot];
      if (!itemId) return;
      const gold = sellEquipped(pr, slot);
      refreshPlayerStats(sim, pid);
      return toast(sim, pid, 'shop.sold', COLOR.gold, { name: EQUIPMENT[itemId].nameKey, gold });
    }
    case 'carry': {
      const potionId = a.potion as PotionId;
      if (!inShop || !POTION_IDS.includes(potionId)) return;
      if (carryPotion(pr, potionId)) toast(sim, pid, 'shop.potionCarried', COLOR.green, { name: POTIONS[potionId].nameKey });
      return;
    }
    case 'altar': {
      const effect = getAltarEffect(cell.altarEffect);
      if (a.cellId !== cell.id || cell.type !== 'altar' || !effect || pr.usedCells.includes(cell.id)) return;
      if (pr.gold < effect.goldCost) return toast(sim, pid, 'msg.altarNoGold', COLOR.red, { cost: effect.goldCost });
      pr.gold -= effect.goldCost;
      pr.altarEffects.push(effect.id);
      pr.usedCells.push(cell.id);
      refreshPlayerStats(sim, pid);
      return toast(sim, pid, 'msg.altarAccepted', COLOR.gold, { name: effect.nameKey });
    }
  }
}

/** 走進（或點擊）互動物件：商店、祭壇開介面；寶箱、休息點每人各用一次 */
export function triggerInteract(sim: Sim, pid: string) {
  const p = sim.world.players[pid];
  const pr = sim.run.players[pid];
  const cell = sim.run.map.cells[sim.world.roomId];
  const used = pr.usedCells.includes(cell.id);
  switch (cell.type) {
    case 'start':
    case 'shop':
      sim.events.push({ k: 'open', pid, ui: 'shop', cellId: cell.id });
      return;
    case 'altar':
      if (used) return toast(sim, pid, 'msg.altarSpent', COLOR.dim);
      sim.events.push({ k: 'open', pid, ui: 'altar', cellId: cell.id });
      return;
    case 'treasure': {
      if (used) return toast(sim, pid, 'msg.treasureEmpty', COLOR.dim);
      const { goldMin, goldMax } = ROOM_EVENT_CONFIG.treasure;
      const gold = goldMin + Math.floor(Math.random() * (goldMax - goldMin + 1));
      addGold(pr, gold);
      pr.usedCells.push(cell.id);
      sim.events.push({ k: 'gold', x: p.x, y: p.y - 30, v: gold });
      return toast(sim, pid, 'msg.treasureOpened', COLOR.gold, { gold });
    }
    case 'rest': {
      if (used) return toast(sim, pid, 'msg.restUsed', COLOR.dim);
      const { hpPercent, mpPercent } = ROOM_EVENT_CONFIG.rest;
      const hp = Math.round((p.stats.maxHp * hpPercent) / 100);
      const mp = Math.round((p.stats.maxMp * mpPercent) / 100);
      p.hp = Math.min(p.stats.maxHp, p.hp + hp);
      p.mp = Math.min(p.stats.maxMp, p.mp + mp);
      pr.usedCells.push(cell.id);
      sim.events.push({ k: 'heal', pid, hp, mp });
      return toast(sim, pid, 'msg.rested', COLOR.green);
    }
  }
}
