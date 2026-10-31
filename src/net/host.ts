import Peer, { type DataConnection } from 'peerjs';
import { MULTIPLAYER_CONFIG } from '../config/multiplayer';
import { randomSeed } from '../core/rng';
import { createRun, type RunState } from '../core/runState';
import type { ClassId } from '../core/types';
import { clearGame, saveGame, saveRoomCode } from '../save/storage';
import { applyAction } from '../sim/actions';
import { stepSim } from '../sim/step';
import type { GameEvent, Sim } from '../sim/types';
import { addPlayerToWorld, createWorld, syncRunFromWorld } from '../sim/world';
import type { ClientMsg, HostMsg, HostState, JoinMeta, LobbyPlayer } from './protocol';

// 房主：跑遊戲邏輯，接受其他人的 PeerJS 連線，定時把整包狀態傳出去。
// 單人模式也是用這個類別，只是不開連線。

export type NetStatus = 'ok' | 'connecting' | 'lost';

export interface HostCallbacks {
  /** 每次狀態更新（本機畫面用） */
  onState: (s: HostState) => void;
  onEvents: (ev: GameEvent[]) => void;
  onStatus: (status: NetStatus, detail?: string) => void;
  onRoomCode: (code: string) => void;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class GameHost {
  readonly state: HostState;
  sim: Sim | null = null;
  /** 單人模式下開啟商店、選單時暫停 */
  paused = false;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private pending: GameEvent[] = [];
  private loop: number | null = null;
  private closed = false;
  roomCode = '';

  constructor(
    readonly myId: string,
    private cb: HostCallbacks,
    multiplayer: boolean,
  ) {
    this.state = { phase: 'lobby', hostId: myId, multiplayer, lobby: [], run: null, world: null, result: null };
  }

  // ───────────── 大廳 ─────────────

  addLobbyPlayer(id: string, name: string, classId: ClassId = 'warrior'): LobbyPlayer | null {
    const existing = this.state.lobby.find((p) => p.id === id);
    if (existing) {
      existing.connected = true;
      existing.name = name || existing.name;
      return existing;
    }
    if (this.state.lobby.length >= MULTIPLAYER_CONFIG.maxPlayers) return null;
    const used = new Set(this.state.lobby.map((p) => p.color));
    const color = MULTIPLAYER_CONFIG.colors.find((c) => !used.has(c)) ?? MULTIPLAYER_CONFIG.colors[0];
    const p: LobbyPlayer = { id, name, classId, ready: false, connected: true, color };
    this.state.lobby.push(p);
    return p;
  }

  /** 開始一局：依大廳玩家建立存檔與第一個格子 */
  startRun(autoAttack: Record<string, boolean> = {}) {
    const players = this.state.lobby
      .filter((p) => p.connected)
      .map((p) => ({ id: p.id, name: p.name, classId: p.classId, color: p.color, autoAttack: autoAttack[p.id] ?? true }));
    this.beginPlay(createRun(players, randomSeed(), this.myId));
  }

  /** 進入遊戲（新局或接續存檔） */
  beginPlay(run: RunState) {
    const connected = this.connectedIds();
    this.sim = { run, world: createWorld(run, run.currentRoomId, null, connected), moves: {}, events: [] };
    this.state.run = run;
    this.state.world = this.sim.world;
    this.state.result = null;
    this.state.phase = 'play';
    this.save();
    this.publish();
  }

  backToLobby() {
    this.sim = null;
    this.state.run = null;
    this.state.world = null;
    this.state.result = null;
    this.state.phase = 'lobby';
    // 大廳只列出還在線上的人
    this.state.lobby = this.state.lobby.filter((p) => p.connected);
    for (const p of this.state.lobby) p.ready = false;
    this.publish();
  }

  private connectedIds(): Set<string> {
    const ids = new Set([this.myId]);
    for (const [id, c] of this.conns) if (c.open) ids.add(id);
    return ids;
  }

  // ───────────── 輸入 ─────────────

  handle(pid: string, msg: ClientMsg) {
    if (msg.t === 'lobby') {
      const p = this.state.lobby.find((l) => l.id === pid);
      if (!p || this.state.phase !== 'lobby') return;
      if (msg.classId) p.classId = msg.classId;
      if (typeof msg.ready === 'boolean') p.ready = msg.ready;
      if (typeof msg.name === 'string') p.name = msg.name.slice(0, 12) || p.name;
      this.publish();
      return;
    }
    if (!this.sim || this.state.phase !== 'play') return;
    if (msg.t === 'move') {
      const x = Number(msg.x) || 0;
      const y = Number(msg.y) || 0;
      this.sim.moves[pid] = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    } else if (msg.t === 'act') {
      applyAction(this.sim, pid, msg.a);
    }
  }

  // ───────────── 主迴圈 ─────────────

  /** 用 setInterval 而不是 requestAnimationFrame，切到別的分頁時遊戲才不會整個停住 */
  start() {
    let last = performance.now();
    let sendAcc = 0;
    let saveAcc = 0;
    this.loop = window.setInterval(() => {
      const now = performance.now();
      let dt = Math.min((now - last) / 1000, 5);
      last = now;
      const sim = this.sim;
      if (sim && this.state.phase === 'play' && !(this.paused && !this.state.multiplayer)) {
        while (dt > 0) {
          const h = Math.min(dt, 0.05);
          stepSim(sim, h);
          dt -= h;
          sendAcc += h;
          saveAcc += h;
        }
        this.state.world = sim.world;
        if (sim.events.length > 0) {
          const ev = sim.events.splice(0);
          this.pending.push(...ev);
          this.cb.onEvents(ev);
          if (ev.some((e) => e.k === 'room' || e.k === 'cleared' || e.k === 'floor')) this.save();
        }
        if (sim.world.ending && !sim.world.ending.nextFloor && sim.world.ending.delay <= 0) this.finish(sim.world.ending.victory);
      } else {
        sendAcc += dt;
      }
      if (sendAcc >= MULTIPLAYER_CONFIG.snapshotInterval) {
        sendAcc = 0;
        this.publish();
      }
      if (saveAcc >= 5) {
        saveAcc = 0;
        this.save();
      }
    }, 16);
  }

  private finish(victory: boolean) {
    const sim = this.sim!;
    syncRunFromWorld(sim);
    const run = sim.run;
    this.state.result = {
      victory,
      floor: run.floor,
      kills: run.kills,
      players: Object.values(run.players).map((p) => ({
        id: p.id,
        name: p.name,
        classId: p.classId,
        goldEarned: p.goldEarned,
        kills: p.kills,
      })),
    };
    this.state.phase = 'result';
    this.sim = null;
    this.state.run = null;
    this.state.world = null;
    clearGame();
    this.publish();
  }

  save() {
    if (!this.sim) return;
    syncRunFromWorld(this.sim);
    saveGame({ run: this.sim.run, multiplayer: this.state.multiplayer });
  }

  /** 把狀態交給本機畫面，並傳給所有加入者 */
  private publish() {
    this.cb.onState(this.state);
    if (this.conns.size === 0) {
      this.pending = [];
      return;
    }
    const msg: HostMsg = { t: 'snap', s: this.state, ev: this.pending };
    this.pending = [];
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  // ───────────── 連線 ─────────────

  openRoom(code: string, tries = 0) {
    this.roomCode = code;
    this.cb.onRoomCode(code);
    this.cb.onStatus('connecting');
    const peer = new Peer(MULTIPLAYER_CONFIG.peerPrefix + code);
    this.peer = peer;
    peer.on('open', () => {
      saveRoomCode(code);
      this.cb.onStatus('ok');
    });
    peer.on('connection', (c) => this.onGuest(c));
    peer.on('disconnected', () => {
      if (!peer.destroyed && !this.closed) setTimeout(() => peer.reconnect(), 1000);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // 上一次的房間可能還沒被伺服器釋放，等一下再試，盡量拿回同一個代碼讓大家自動接回來
        peer.destroy();
        if (this.closed) return;
        if (tries < 10) {
          this.cb.onStatus('connecting', `${tries + 1}/10`);
          setTimeout(() => this.openRoom(code, tries + 1), 3000);
        } else {
          this.openRoom(randomCode());
        }
        return;
      }
      console.warn('peer error', err.type, err);
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) this.cb.onStatus('lost');
    });
  }

  private onGuest(c: DataConnection) {
    const meta = (c.metadata ?? {}) as Partial<JoinMeta>;
    const id = typeof meta.cid === 'string' ? meta.cid.slice(0, 20) : '';
    const name = typeof meta.name === 'string' ? meta.name.slice(0, 12) : '';
    c.on('open', () => {
      if (!id || id === this.myId) return c.close();
      const reject = (reason: 'full' | 'inProgress') => {
        c.send({ t: 'reject', reason } satisfies HostMsg);
        setTimeout(() => c.close(), 500);
      };
      if (this.state.phase === 'lobby') {
        if (!this.addLobbyPlayer(id, name)) return reject('full');
      } else if (!this.sim?.run.players[id]) {
        // 遊戲進行中只接受原本就在這局的玩家重新連線
        return reject('inProgress');
      } else {
        const lp = this.state.lobby.find((p) => p.id === id);
        if (lp) lp.connected = true;
      }
      const old = this.conns.get(id);
      this.conns.set(id, c);
      if (old && old !== c) old.close();
      if (this.sim) addPlayerToWorld(this.sim, id);
      this.publish();
    });
    c.on('data', (d) => {
      if (this.conns.get(id) === c) this.handle(id, d as ClientMsg);
    });
    c.on('close', () => {
      if (this.conns.get(id) !== c) return;
      this.conns.delete(id);
      const lp = this.state.lobby.find((p) => p.id === id);
      if (this.state.phase === 'lobby') this.state.lobby = this.state.lobby.filter((p) => p.id !== id);
      else if (lp) lp.connected = false;
      const e = this.sim?.world.players[id];
      if (e) {
        e.connected = false;
        delete this.sim!.moves[id];
      }
      this.publish();
    });
  }

  close() {
    this.closed = true;
    if (this.loop !== null) clearInterval(this.loop);
    this.save();
    for (const c of this.conns.values()) {
      if (c.open) c.send({ t: 'closed' } satisfies HostMsg);
    }
    const peer = this.peer;
    setTimeout(() => peer?.destroy(), 300);
  }
}
