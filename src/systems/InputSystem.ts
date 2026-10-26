import Phaser from 'phaser';
import { ACTION_KEYS, MOVE_KEYS, type GameAction } from '../config/keybinds';
import type { Vec2 } from '../core/types';

/**
 * 輸入整合：鍵盤與觸控按鈕 / 搖桿都轉成「移動向量」與「動作」。
 * 遊戲邏輯只讀這裡，不直接接觸輸入來源。
 */
class InputHub {
  /** 由虛擬搖桿寫入 */
  readonly joystick: Vec2 = { x: 0, y: 0 };
  private queue: GameAction[] = [];

  press(action: GameAction) {
    this.queue.push(action);
  }

  consume(): GameAction[] {
    const actions = this.queue;
    this.queue = [];
    return actions;
  }

  reset() {
    this.queue = [];
    this.joystick.x = 0;
    this.joystick.y = 0;
  }
}

export const inputHub = new InputHub();

/** 綁定在某個場景上的鍵盤輸入 */
export class KeyboardInput {
  private moveKeys: Record<keyof typeof MOVE_KEYS, Phaser.Input.Keyboard.Key[]>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const add = (name: string) => kb.addKey(name, true, false);
    this.moveKeys = {
      up: MOVE_KEYS.up.map(add),
      down: MOVE_KEYS.down.map(add),
      left: MOVE_KEYS.left.map(add),
      right: MOVE_KEYS.right.map(add),
    };

    // 動作鍵用 keydown 事件觸發（輪詢 JustDown 會漏掉在同一幀內按下又放開的按鍵）
    const actionByKeyCode = new Map<number, GameAction>();
    for (const [action, names] of Object.entries(ACTION_KEYS) as [GameAction, string[]][]) {
      for (const name of names) {
        const code = Phaser.Input.Keyboard.KeyCodes[name as keyof typeof Phaser.Input.Keyboard.KeyCodes];
        add(name);
        actionByKeyCode.set(code, action);
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const action = actionByKeyCode.get(event.keyCode);
      if (action) inputHub.press(action);
    };
    kb.on('keydown', onKeyDown);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', onKeyDown));
  }

  /** 合併鍵盤與搖桿的移動向量，長度不超過 1 */
  moveVector(): Vec2 {
    const down = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);
    let x = (down(this.moveKeys.right) ? 1 : 0) - (down(this.moveKeys.left) ? 1 : 0);
    let y = (down(this.moveKeys.down) ? 1 : 0) - (down(this.moveKeys.up) ? 1 : 0);
    x += inputHub.joystick.x;
    y += inputHub.joystick.y;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
}
