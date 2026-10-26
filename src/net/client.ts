import Peer, { type DataConnection } from 'peerjs';
import Phaser from 'phaser';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { PLAYER_CONFIG } from '../config/player';
import type { PlayerRun, RunState } from '../core/runState';
import type { ClassId } from '../core/types';
import { t } from '../i18n';
import { loadClientId, loadName, loadRoomCode, saveName, type SavedGame } from '../save/storage';
import { session } from '../state/session';
import type { EnemyEntity, GameEvent, PlayerAction, PlayerEntity, ProjectileEntity, World } from '../sim/types';
import { ROOM_BOUNDS } from '../sim/world';
import { GameHost, randomCode, type NetStatus } from './host';
import type { ClientMsg, HostMsg, HostState, JoinMeta, LobbyPlayer } from './protocol';

// 畫面層唯一要接觸的連線介面：單人、房主、加入者三種模式用同一組 API。
// 事件：'state'（狀態更新）、'game'（單一遊戲事件）、'phase'（階段改變）、'status'（連線狀態）、'reject'、'closed'

export type NetMode = 'solo' | 'host' | 'guest';

interface Snap {
  at: number;
  world: World;
}

const ROOM_PARAM = 'room';

/** 第一次玩時給一個預設名字並記住 */
function defaultName() {
  const name = `${t('lobby.defaultName')}${Math.floor(100 + Math.random() * 900)}`;
  saveName(name);
  return name;
}

class NetClient extends Phaser.Events.EventEmitter {
  mode: NetMode | null = null;
  myId = loadClientId();
  myName = loadName() ?? defaultName();
  roomCode = '';
  status: NetStatus = 'ok';
  statusDetail = '';
  state: HostState | null = null;

  private host: GameHost | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private retryTimer: number | null = null;
  private lastPhase: string | null = null;
  private lastMoveSent = { x: 0, y: 0, at: 0 };
  /** 加入者：最近的快照，用來補間顯示其他人 */
  private snaps: Snap[] = [];
  private snapAt = 0;
  /** 加入者：自己角色的預測位置 */
  pred: { x: number; y: number } | null = null;
  private move = { x: 0, y: 0 };
  /** 開著的介面數（商店、選單等），大於 0 時不移動；單人模式時暫停遊戲 */
  private uiBlocks = 0;

  get isMultiplayer() {
    return this.mode === 'host' || this.mode === 'guest';
  }

  get isHost() {
    return this.mode === 'host' || this.mode === 'solo';
  }

  get run(): RunState | null {
    return this.state?.run ?? null;
  }

  get world(): World | null {
    return this.state?.world ?? null;
  }

  /** 自己的存檔資料（裝備、金幣等） */
  get me(): PlayerRun | undefined {
    return this.run?.players[this.myId];
  }

  /** 自己在格子內的模擬狀態 */
  get meEntity(): PlayerEntity | undefined {
    return this.world?.players[this.myId];
  }

  get lobbyMe(): LobbyPlayer | undefined {
    return this.state?.lobby.find((p) => p.id === this.myId);
  }

  get uiBlocked() {
    return this.uiBlocks > 0;
  }

  setName(name: string) {
    this.myName = name.slice(0, 12) || this.myName;
    saveName(this.myName);
    this.send({ t: 'lobby', name: this.myName });
  }

  // ───────────── 開始 / 結束 ─────────────

  private makeHost(multiplayer: boolean, myId = this.myId) {
    this.myId = myId;
    const host = new GameHost(
      myId,
      {
        onState: (s) => this.onState(s),
        onEvents: (ev) => this.onEvents(ev),
        onStatus: (status, detail) => this.setStatus(status, detail),
        onRoomCode: (code) => (this.roomCode = code),
      },
      multiplayer,
    );
    this.host = host;
    host.start();
    return host;
  }

  /** 單人：直接用選好的職業開局 */
  startSolo(classId: ClassId) {
    this.leave();
    this.mode = 'solo';
    const host = this.makeHost(false);
    host.addLobbyPlayer(this.myId, this.myName, classId);
    host.startRun({ [this.myId]: session.settings.autoAttack });
  }

  /** 建立多人房間（大廳） */
  hostRoom() {
    this.leave();
    this.mode = 'host';
    const host = this.makeHost(true);
    host.addLobbyPlayer(this.myId, this.myName);
    host.openRoom(loadRoomCode() ?? randomCode());
    this.onState(host.state);
  }

  /** 接續存檔：多人存檔會用同一個房間代碼重新開房，其他人會自動接回來 */
  continueSaved(saved: SavedGame) {
    this.leave();
    this.mode = saved.multiplayer ? 'host' : 'solo';
    const host = this.makeHost(saved.multiplayer, saved.run.hostId);
    for (const p of Object.values(saved.run.players)) {
      const lp = host.addLobbyPlayer(p.id, p.name, p.classId);
      if (lp) {
        lp.color = p.color;
        lp.connected = p.id === saved.run.hostId;
      }
    }
    if (saved.multiplayer) host.openRoom(loadRoomCode() ?? randomCode());
    host.beginPlay(saved.run);
  }

  /** 房主按開始 */
  startGame() {
    const host = this.host;
    if (!host || this.mode !== 'host') return;
    host.startRun({ [this.myId]: session.settings.autoAttack });
  }

  /** 結算後：房主帶大家回大廳 */
  backToLobby() {
    if (this.mode === 'host') this.host?.backToLobby();
  }

  joinRoom(code: string) {
    this.leave();
    this.mode = 'guest';
    this.roomCode = code.toUpperCase();
    const url = new URL(location.href);
    url.searchParams.set(ROOM_PARAM, this.roomCode);
    history.replaceState(null, '', url);
    this.setStatus('connecting');
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => this.connectToHost());
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000);
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.setStatus('connecting', 'notFound');
        this.scheduleRetry();
      } else {
        console.warn('peer error', err.type, err);
      }
    });
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** 網址帶有 ?room= 時自動加入 */
  pendingRoomFromUrl(): string | null {
    const code = new URL(location.href).searchParams.get(ROOM_PARAM);
    return code && /^[A-Z0-9]{4}$/i.test(code) ? code.toUpperCase() : null;
  }

  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.mode !== 'guest' || !this.peer) return;
    if (this.peer.disconnected) this.peer.reconnect();
    if (!this.conn?.open) this.connectToHost();
  };

  private scheduleRetry() {
    if (this.retryTimer !== null || this.mode !== 'guest') return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.connectToHost();
    }, 2000);
  }

  private connectToHost() {
    const peer = this.peer;
    if (!peer || this.mode !== 'guest' || this.conn?.open) return;
    if (!peer.open) return this.scheduleRetry();
    this.conn?.close();
    const meta: JoinMeta = { cid: this.myId, name: this.myName };
    const c = peer.connect(MULTIPLAYER_CONFIG.peerPrefix + this.roomCode, { reliable: true, serialization: 'json', metadata: meta });
    this.conn = c;
    const timeout = setTimeout(() => {
      if (!c.open) {
        c.close();
        this.scheduleRetry();
      }
    }, 8000);
    c.on('open', () => {
      clearTimeout(timeout);
      this.setStatus('ok');
    });
    c.on('data', (d) => {
      const msg = d as HostMsg;
      if (msg.t === 'snap') {
        this.onEvents(msg.ev);
        this.onState(msg.s);
      } else if (msg.t === 'reject') {
        this.emit('reject', msg.reason);
        this.leave();
      } else if (msg.t === 'closed') {
        this.emit('closed');
        this.leave();
      }
    });
    c.on('close', () => {
      clearTimeout(timeout);
      if (this.conn !== c) return;
      this.setStatus('lost');
      this.scheduleRetry();
    });
  }

  /** 離開房間或結束單人遊戲 */
  leave() {
    this.host?.close();
    this.host = null;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const conn = this.conn;
    this.conn = null;
    conn?.close();
    this.peer?.destroy();
    this.peer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.mode === 'guest') {
      const url = new URL(location.href);
      url.searchParams.delete(ROOM_PARAM);
      history.replaceState(null, '', url);
    }
    this.mode = null;
    this.state = null;
    this.lastPhase = null;
    this.snaps = [];
    this.pred = null;
    this.uiBlocks = 0;
    this.move = { x: 0, y: 0 };
    this.status = 'ok';
  }

  private setStatus(status: NetStatus, detail = '') {
    this.status = status;
    this.statusDetail = detail;
    this.emit('status', status, detail);
  }

  // ───────────── 收到狀態 ─────────────

  private onState(s: HostState) {
    this.state = s;
    if (this.mode === 'guest' && s.world) {
      const now = performance.now();
      this.snapAt = now;
      // 快照會被覆寫，存一份位置副本供補間
      this.snaps.push({ at: now, world: structuredCloneWorld(s.world) });
      while (this.snaps.length > 20) this.snaps.shift();
      this.reconcile();
    }
    if (s.phase !== this.lastPhase) {
      this.lastPhase = s.phase;
      this.emit('phase', s.phase);
    }
    this.emit('state', s);
  }

  private onEvents(ev: GameEvent[]) {
    for (const e of ev) {
      if (e.k === 'room') {
        this.pred = null;
        this.snaps = [];
      }
      this.emit('game', e);
    }
  }

  // ───────────── 送出輸入 ─────────────

  send(msg: ClientMsg) {
    if (this.host) this.host.handle(this.myId, msg);
    else if (this.conn?.open) this.conn.send(msg);
  }

  act(a: PlayerAction) {
    this.send({ t: 'act', a });
  }

  /** 每幀由畫面呼叫，傳入本幀的移動輸入 */
  setMove(x: number, y: number) {
    if (this.uiBlocked) {
      x = 0;
      y = 0;
    }
    this.move = { x, y };
    if (this.host) {
      this.host.handle(this.myId, { t: 'move', x, y });
      return;
    }
    // 加入者：輸入改變時或每 100ms 送一次
    const now = performance.now();
    const last = this.lastMoveSent;
    const changed = Math.abs(last.x - x) > 0.05 || Math.abs(last.y - y) > 0.05;
    if (changed || (now - last.at > 100 && (x !== 0 || y !== 0))) {
      this.lastMoveSent = { x, y, at: now };
      this.send({ t: 'move', x, y });
    }
  }

  /** 開關介面（商店、選單、地圖）：介面開著時不移動，單人模式下暫停 */
  pushUi() {
    this.uiBlocks++;
    if (this.host) this.host.paused = true;
  }

  popUi() {
    this.uiBlocks = Math.max(0, this.uiBlocks - 1);
    if (this.host && this.uiBlocks === 0) this.host.paused = false;
  }

  // ───────────── 顯示用（補間與預測） ─────────────

  /** 加入者自己的角色：本機先移動，收到房主位置後校正 */
  updatePrediction(dt: number) {
    if (this.mode !== 'guest') return;
    const me = this.meEntity;
    if (!me || me.dead || !me.connected) {
      this.pred = null;
      return;
    }
    if (!this.pred) this.pred = { x: me.x, y: me.y };
    const r = PLAYER_CONFIG.radius;
    const b = ROOM_BOUNDS;
    const speed = me.stats.moveSpeed * dt;
    const len = Math.hypot(this.move.x, this.move.y);
    const mx = len > 1 ? this.move.x / len : this.move.x;
    const my = len > 1 ? this.move.y / len : this.move.y;
    this.pred.x = Math.max(b.left + r, Math.min(b.right - r, this.pred.x + mx * speed));
    this.pred.y = Math.max(b.top + r, Math.min(b.bottom - r, this.pred.y + my * speed));
  }

  private reconcile() {
    const me = this.meEntity;
    if (!me || !this.pred) return;
    const d = Math.hypot(this.pred.x - me.x, this.pred.y - me.y);
    if (d > MULTIPLAYER_CONFIG.reconcileSnapDistance) {
      this.pred = { x: me.x, y: me.y };
    } else if (this.move.x === 0 && this.move.y === 0) {
      this.pred.x += (me.x - this.pred.x) * 0.3;
      this.pred.y += (me.y - this.pred.y) * 0.3;
    }
  }

  /** 距離上一個快照經過的秒數（加入者推算冷卻用） */
  get sinceSnap() {
    return this.mode === 'guest' ? (performance.now() - this.snapAt) / 1000 : 0;
  }

  /**
   * 畫面要顯示的位置。房主直接用模擬結果；加入者在兩個快照之間補間，自己的角色用預測位置。
   */
  displayPos(kind: 'player' | 'enemy' | 'proj', id: string | number): { x: number; y: number } | null {
    const w = this.world;
    if (!w) return null;
    const find = (world: World) => {
      if (kind === 'player') return world.players[id as string] as PlayerEntity | undefined;
      if (kind === 'enemy') return world.enemies.find((e) => e.id === id) as EnemyEntity | undefined;
      return world.projectiles.find((p) => p.id === id) as ProjectileEntity | undefined;
    };
    if (this.mode !== 'guest' || this.snaps.length === 0) {
      const e = find(w);
      return e ? { x: e.x, y: e.y } : null;
    }
    if (kind === 'player' && id === this.myId && this.pred) return this.pred;
    const rt = performance.now() - MULTIPLAYER_CONFIG.interpDelayMs;
    let a = 0;
    while (a < this.snaps.length - 1 && this.snaps[a + 1].at <= rt) a++;
    const A = this.snaps[a];
    const B = this.snaps[Math.min(a + 1, this.snaps.length - 1)];
    const f = B.at > A.at ? Phaser.Math.Clamp((rt - A.at) / (B.at - A.at), 0, 1) : 1;
    const pb = find(B.world) ?? find(w);
    if (!pb) return null;
    const pa = find(A.world) ?? pb;
    return { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f };
  }
}

/** 只複製補間需要的位置資料 */
function structuredCloneWorld(w: World): World {
  return {
    ...w,
    players: Object.fromEntries(Object.entries(w.players).map(([k, p]) => [k, { ...p }])),
    enemies: w.enemies.map((e) => ({ ...e })),
    projectiles: w.projectiles.map((p) => ({ ...p })),
  };
}

export const net = new NetClient();
