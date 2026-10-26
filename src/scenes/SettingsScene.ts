import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { THEME } from '../config/theme';
import { AVAILABLE_LOCALES, LOCALES, getLocale, t, type Locale } from '../i18n';
import { session } from '../state/session';
import { Button } from '../ui/Button';
import { addBackdrop, addPanel } from '../ui/Panel';
import { addText } from '../ui/text';
import { goToMenu } from './flow';
import { SCENES } from './keys';

interface SettingsData {
  /** 從哪個場景開啟：主選單或遊戲中（暫停選單） */
  from: string;
}

export class SettingsScene extends Phaser.Scene {
  private from: string = SCENES.menu;

  constructor() {
    super(SCENES.settings);
  }

  init(data: SettingsData) {
    this.from = data.from ?? SCENES.menu;
  }

  create() {
    const { width, height } = GAME_CONFIG;
    const inGame = this.from === SCENES.room;
    addBackdrop(this, 0.8);
    addPanel(this, width / 2, height / 2, 600, inGame ? 460 : 380);
    const top = height / 2 - (inGame ? 190 : 150);
    addText(this, width / 2, top, t(inGame ? 'hud.pause' : 'settings.title'), 30).setOrigin(0.5);

    // 自動普攻
    addText(this, width / 2 - 220, top + 80, t('settings.autoAttack'), 20).setOrigin(0, 0.5);
    const autoBtn = new Button(this, width / 2 + 150, top + 80, '', () => {
      session.updateSettings({ autoAttack: !session.settings.autoAttack });
      refresh();
    }, { width: 160, height: 44 });

    // 語言（目前只有中文可選）
    addText(this, width / 2 - 220, top + 140, t('settings.language'), 20).setOrigin(0, 0.5);
    const langBtn = new Button(this, width / 2 + 150, top + 140, '', () => {
      const next = LOCALES[(LOCALES.indexOf(getLocale()) + 1) % LOCALES.length] as Locale;
      if (AVAILABLE_LOCALES.includes(next)) {
        session.updateSettings({ locale: next });
        this.scene.restart({ from: this.from });
      } else {
        langNote.setText(`${t(`lang.${next}`)} ${t('settings.langUnavailable')}`);
      }
    }, { width: 160, height: 44 });
    const langNote = addText(this, width / 2 + 150, top + 176, '', 13, THEME.textDim).setOrigin(0.5);

    const refresh = () => {
      autoBtn.setText(session.settings.autoAttack ? t('settings.on') : t('settings.off'));
      langBtn.setText(t(`lang.${getLocale()}`));
    };
    refresh();

    if (inGame) {
      new Button(this, width / 2, top + 240, t('settings.resume'), () => this.close(), { width: 300, color: THEME.accent });
      new Button(this, width / 2, top + 310, t('settings.toMenu'), () => goToMenu(this), { width: 300 });
      this.input.keyboard?.on('keydown-P', () => this.close());
    } else {
      new Button(this, width / 2, top + 250, t('settings.back'), () => this.close(), { width: 200 });
    }
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close() {
    this.scene.stop();
    this.scene.resume(this.from);
    if (this.from === SCENES.room) this.scene.resume(SCENES.ui);
  }
}
