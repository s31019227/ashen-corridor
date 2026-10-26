import Phaser from 'phaser';
import { CLASSES } from '../config/classes';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { t } from '../i18n';
import { net } from '../net/client';
import { Button } from '../ui/Button';
import { addText } from '../ui/text';
import { goToMenu } from './flow';
import { SCENES } from './keys';

/** 結算畫面（通關或全滅）。多人時列出每位玩家的成績 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SCENES.result);
  }

  create() {
    const { width, height } = GAME_CONFIG;
    const r = net.state?.result;
    if (!r) {
      goToMenu(this.game);
      return;
    }
    this.cameras.main.fadeIn(400, 0, 0, 0);
    const title = r.victory ? t('result.victory', { floor: r.floor }) : t(net.isMultiplayer ? 'result.defeatTeam' : 'result.defeat');
    addText(this, width / 2, 130, title, 48, r.victory ? THEME.textGold : THEME.textRed, {
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);
    addText(this, width / 2, 210, t('result.kills', { kills: r.kills }), 24).setOrigin(0.5);

    r.players.forEach((p, i) => {
      const y = 270 + i * 40;
      const mine = p.id === net.myId;
      const line = `${net.isMultiplayer ? `${p.name}（${t(CLASSES[p.classId].nameKey)}）　` : ''}${t('result.gold', { gold: p.goldEarned })}　${t('result.lastHits', { kills: p.kills })}`;
      addText(this, width / 2, y, line, 20, mine ? THEME.textGold : THEME.text).setOrigin(0.5);
    });

    const by = height - 120;
    const me = r.players.find((p) => p.id === net.myId);
    if (net.mode === 'solo') {
      new Button(this, width / 2 - 130, by, t('result.restart'), () => me && net.startSolo(me.classId), {
        width: 220,
        color: THEME.accent,
      });
    } else if (net.mode === 'host') {
      new Button(this, width / 2 - 130, by, t('result.backToLobby'), () => net.backToLobby(), { width: 220, color: THEME.accent });
    } else {
      addText(this, width / 2 - 130, by, t('result.waitHost'), 18, THEME.textDim).setOrigin(0.5);
    }
    new Button(this, width / 2 + 130, by, t(net.isMultiplayer ? 'settings.leaveRoom' : 'result.menu'), () => goToMenu(this.game), {
      width: 220,
    });
  }
}
