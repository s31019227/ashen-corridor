// 鍵位設定。值為 Phaser 的鍵名（Phaser.Input.Keyboard.KeyCodes）。之後可做成可自訂。

export type GameAction =
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'ultimate'
  | 'potion1'
  | 'potion2'
  | 'potion3'
  | 'potion4'
  | 'potion5'
  | 'attack'
  | 'unlock'
  | 'equipment'
  | 'map'
  | 'pause';

export const MOVE_KEYS = {
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
} as const;

export const ACTION_KEYS: Record<GameAction, string[]> = {
  skill1: ['Q'],
  skill2: ['E'],
  skill3: ['R'],
  ultimate: ['F'],
  potion1: ['ONE'],
  potion2: ['TWO'],
  potion3: ['THREE'],
  potion4: ['FOUR'],
  potion5: ['FIVE'],
  attack: ['SPACE'],
  unlock: ['ESC'],
  equipment: ['C'],
  map: ['M'],
  pause: ['P'],
};

/** 按鈕上顯示的鍵名 */
export const ACTION_KEY_LABEL: Partial<Record<GameAction, string>> = {
  skill1: 'Q',
  skill2: 'E',
  skill3: 'R',
  ultimate: 'F',
  potion1: '1',
  potion2: '2',
  potion3: '3',
  potion4: '4',
  potion5: '5',
  attack: 'Space',
  equipment: 'C',
  map: 'M',
  pause: 'P',
};
