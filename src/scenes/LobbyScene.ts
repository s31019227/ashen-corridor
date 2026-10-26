import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { THEME } from '../config/theme';
import { CLASS_IDS, type ClassId } from '../core/types';
import { t } from '../i18n';
import { net } from '../net/client';
import type { HostState } from '../net/protocol';
import { Button } from '../ui/Button';
import { addText } from '../ui/text';
import { goToMenu } from './flow';
import { SCENES } from './keys';

/** 多人大廳：房間代碼、邀請連結、玩家列表、選職業、準備 / 開始 */
export class LobbyScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private lastKey = '';
  private joining = '';

  constructor() {
    super(SCENES.lobby);
  }

  init(data: { joining?: string }) {
    this.joining = data?.joining ?? '';
    this.lastKey = '';
  }

  create() {
    const { width, height } = GAME_CONFIG;
    addText(this, width / 2, 40, t('lobby.title'), 32).setOrigin(0.5);
    this.statusText = addText(this, width / 2, 78, '', 16, THEME.textDim).setOrigin(0.5);
    this.dynamic = this.add.container(0, 0);
    new Button(this, 120, height - 44, t('lobby.leave'), () => goToMenu(this.game), { width: 180, height: 46 });
    this.createNameBox();

    const onState = () => this.refresh();
    const onStatus = () => this.refreshStatus();
    net.on('state', onState);
    net.on('status', onStatus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('state', onState);
      net.off('status', onStatus);
    });
    this.refresh();
  }

  private refreshStatus() {
    const code = net.roomCode || this.joining;
    let text = t('lobby.code', { code });
    if (net.status === 'connecting') text += `　${t(net.statusDetail === 'notFound' ? 'net.notFound' : 'net.connecting')}`;
    else if (net.status === 'lost') text += `　${t('net.lost')}`;
    this.statusText.setText(text).setColor(net.status === 'ok' ? THEME.textGold : THEME.textRed);
  }

  private refresh() {
    this.refreshStatus();
    const s = net.state;
    const key = JSON.stringify(s?.lobby ?? null) + net.roomCode;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.dynamic.removeAll(true);
    if (!s) return;
    this.renderPlayers(s);
    this.renderClassPicker(s);
    this.renderButtons(s);
  }

  private add2<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamic.add(obj);
    return obj;
  }

  private renderPlayers(s: HostState) {
    const x = 80;
    this.add2(addText(this, x, 110, t('lobby.players', { n: s.lobby.length, max: MULTIPLAYER_CONFIG.maxPlayers }), 18, THEME.textDim));
    for (let i = 0; i < MULTIPLAYER_CONFIG.maxPlayers; i++) {
      const y = 160 + i * 56;
      const p = s.lobby[i];
      this.add2(this.add.rectangle(x + 260, y, 520, 48, THEME.panel).setStrokeStyle(1, THEME.panelBorder));
      if (!p) {
        this.add2(addText(this, x + 20, y, t('lobby.waiting'), 16, THEME.textDim).setOrigin(0, 0.5));
        continue;
      }
      this.add2(this.add.circle(x + 28, y, 12, CLASSES[p.classId].color).setStrokeStyle(3, p.color));
      const tags = [p.id === s.hostId ? t('lobby.hostTag') : '', p.id === net.myId ? t('lobby.youTag') : ''].filter(Boolean).join(' ');
      this.add2(addText(this, x + 52, y, `${p.name} ${tags}`, 18).setOrigin(0, 0.5));
      this.add2(addText(this, x + 300, y, t(CLASSES[p.classId].nameKey), 18, THEME.textDim).setOrigin(0, 0.5));
      this.add2(
        addText(this, x + 500, y, p.ready ? t('lobby.ready') : t('lobby.notReady'), 16, p.ready ? THEME.textGreen : THEME.textDim).setOrigin(
          1,
          0.5,
        ),
      );
    }
    if (net.roomCode) {
      this.add2(
        new Button(this, x + 130, 160 + 4 * 56 + 10, t('lobby.copyLink'), () => this.copyLink(), { width: 260, height: 42, fontSize: 16 }),
      );
    }
  }

  private renderClassPicker(s: HostState) {
    const me = s.lobby.find((p) => p.id === net.myId);
    if (!me) return;
    const left = 680;
    this.add2(addText(this, left, 110, t('lobby.pickClass'), 18, THEME.textDim));
    CLASS_IDS.forEach((id, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = left + 60 + col * 130;
      const y = 175 + row * 100;
      const def = CLASSES[id];
      const selected = me.classId === id;
      const card = this.add2(
        this.add.rectangle(x, y, 118, 86, THEME.panel).setStrokeStyle(selected ? 3 : 1, selected ? THEME.gold : THEME.panelBorder),
      );
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.pickClass(id));
      this.add2(this.add.circle(x, y - 18, 14, def.color));
      this.add2(addText(this, x, y + 10, t(def.nameKey), 17).setOrigin(0.5));
      this.add2(addText(this, x, y + 30, t(`attackStyle.${def.attackStyle}`), 12, THEME.textDim).setOrigin(0.5));
    });
    const def = CLASSES[me.classId];
    const skills = [...def.skills, def.ultimate].map((sk) => t(sk.nameKey)).join('・');
    this.add2(addText(this, left, 390, `${t(def.nameKey)}：${t(def.roleKey)}`, 17, THEME.text));
    this.add2(addText(this, left, 418, `${t('classSelect.passive')}：${t(def.passive.nameKey)}　${t('classSelect.skills')}：${skills}`, 13, THEME.textDim, { wordWrap: { width: 520 } }));
  }

  private renderButtons(s: HostState) {
    const me = s.lobby.find((p) => p.id === net.myId);
    if (!me) return;
    const { width, height } = GAME_CONFIG;
    const readyBtn = new Button(
      this,
      width - 420,
      height - 44,
      me.ready ? t('lobby.unready') : t('lobby.readyBtn'),
      () => net.send({ t: 'lobby', ready: !me.ready }),
      { width: 200, height: 46, color: me.ready ? THEME.button : 0x3a5a2a },
    );
    this.add2(readyBtn);
    if (net.mode === 'host') {
      const online = s.lobby.filter((p) => p.connected);
      const canStart = online.length > 0 && online.every((p) => p.ready);
      const startBtn = new Button(this, width - 170, height - 44, t('lobby.start'), () => net.startGame(), {
        width: 220,
        height: 46,
        color: THEME.accent,
      }).setEnabled(canStart);
      this.add2(startBtn);
      if (!canStart) this.add2(addText(this, width - 170, height - 82, t('lobby.needReady'), 13, THEME.textDim).setOrigin(0.5));
    } else {
      this.add2(addText(this, width - 170, height - 44, t('lobby.waitHost'), 16, THEME.textDim).setOrigin(0.5));
    }
  }

  private pickClass(id: ClassId) {
    net.send({ t: 'lobby', classId: id, ready: false });
  }

  private createNameBox() {
    const html = `
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="lobby-name" maxlength="12" value="${escapeHtml(net.myName)}" autocomplete="off"
          style="width:170px;font:16px ${THEME.font};background:#0b0b10;color:#d8d4cc;border:1px solid #3a3848;padding:6px;" />
        <button id="lobby-name-ok" style="font:15px ${THEME.font};padding:7px 12px;background:#24222e;color:#d8d4cc;border:1px solid #3a3848;cursor:pointer;">
          ${t('lobby.rename')}</button>
      </div>`;
    const box = this.add.dom(480, GAME_CONFIG.height - 44).createFromHTML(html);
    const input = box.getChildByID('lobby-name') as HTMLInputElement;
    const apply = () => net.setName(input.value.trim());
    (box.getChildByID('lobby-name-ok') as HTMLButtonElement).onclick = apply;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') apply();
    };
  }

  private async copyLink() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('room', net.roomCode);
    try {
      await navigator.clipboard.writeText(url.toString());
      this.statusText.setText(t('lobby.copied'));
    } catch {
      window.prompt(t('lobby.copyPrompt'), url.toString());
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
