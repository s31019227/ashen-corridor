import type { RoomType } from '../core/types';

// 色票與字型（佔位美術）

export const THEME = {
  font: '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif',
  bg: 0x0b0b10,
  floor: 0x15141b,
  floorGrid: 0x1d1c25,
  wall: 0x2a2833,
  panel: 0x16161f,
  panelBorder: 0x3a3848,
  button: 0x24222e,
  buttonHover: 0x34303f,
  buttonDisabled: 0x1a1920,
  text: '#d8d4cc',
  textDim: '#8a8680',
  textGold: '#c9a227',
  textRed: '#d05050',
  textGreen: '#7fb069',
  accent: 0x8b2e2e,
  gold: 0xc9a227,
  hp: 0xa83232,
  mp: 0x3a5fb0,
  barBg: 0x2a1a1a,
  doorClosed: 0x5a1e1e,
  doorOpen: 0x7fb069,
  telegraph: 0xff2a2a,
  lockRing: 0xe0c050,
};

export const ROOM_COLORS: Record<RoomType, number> = {
  start: 0xc9a227,
  shop: 0xa08a3a,
  mob: 0x7a2b2b,
  boss: 0xb01818,
  altar: 0x6a4a9a,
  treasure: 0xb07a2a,
  rest: 0x3a7a5a,
  empty: 0x3a3842,
};
