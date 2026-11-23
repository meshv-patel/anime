import type { Transport } from '../realtime/transport';
import type { MediaSource } from '../lib/types';
import { allocateHostSequence } from '../lib/security';

export type SyncStatus = 'idle' | 'synced' | 'correcting' | 'waiting-source' | 'needs-interaction';

export interface PlayerAdapter {
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  isReady(): boolean;
}

export interface SyncHooks {
  canControl(): boolean;                                                                   // may THIS client issue playback commands?
  isAuthorized(from: string, auth?: unknown, payload?: unknown): boolean | Promise<boolean>; // may `from` issue commands to us? (cryptographically validated)
  isHost(): boolean;
  getHostOnly(): boolean;
  getRoomId?(): string;
  getHostId?(): string;
  getHostEpoch?(): number;
  getHostSeq?(): number;
  signPayload?(payload: Record<string, unknown>): Promise<unknown>;                        // signs playback intent cryptographically
  onSource(s: MediaSource | null): void;
  onHostOnly(v: boolean): void;
  onStatus(s: SyncStatus): void;
}

const DRIFT_SEEK = 1.2;   // seconds: below this we never seek (avoids stutter from insignificant drift)
const TICK_MS = 3000;     // host heartbeat

export const isSafeSource = (s: any): s is MediaSource =>
  !!s && ['mp4', 'hls', 'local'].includes(s.kind) && typeof s.title === 'string' && s.title.length <= 200 &&
  (s.kind === 'local' || (typeof s.url === 'string' && /^https?:\/\//i.test(s.url) && s.url.length < 2000));

/** Local file URLs are device-specific blob: URLs, so they are never sent over the wire. */
export const publicSource = (s: MediaSource | null): MediaSource | null => (s && s.kind === 'local' ? { ...s, url: '' } : s);

/**
 * Playback sync with cryptographic anti-spoofing authorization.
 * Echo prevention by construction: only explicit user intents (play/pause/seek/setSource) are broadcast.
 * Remote commands are applied straight to the adapter and never re-broadcast, so there is no loop.
 * Late joiners send `req`; the host answers with `state`. The host also sends `state` every few seconds for drift correction.
 */
export class SyncService {
  state: { source: MediaSource | null; playing: boolean; time: number } = { source: null, playing: false, time: 0 };
  private adapter: PlayerAdapter | null = null;
  private pending = false;
  private offs: Array<() => void> = [];
  private timer?: ReturnType<typeof setInterval>;

  constructor(private t: Transport, private h: SyncHooks) {}

  start() {
    this.offs.push(this.t.on('pb', (d, from) => void this.recv(d, from)));
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  stop() { this.offs.forEach((o) => o()); this.offs = []; if (this.timer) clearInterval(this.timer); }
  attach(a: PlayerAdapter | null) { this.adapter = a; if (a && this.pending) void this.applyState(this.state.time, this.state.playing); }
  /** Call when the media element becomes ready (loadedmetadata). */
  onReady() { if (this.pending) void this.applyState(this.state.time, this.state.playing); }
  currentTime() { return this.adapter?.getTime() ?? this.state.time; }
  requestState() { this.t.send('pb', { op: 'req' }); }
  /** User clicked the "tap to join playback" prompt (browser autoplay policy needs a gesture). */
  resume() { void this.applyState(this.state.time, this.state.playing); }

  private async authPayload(extra: Record<string, unknown> = {}) {
    if (!this.h.isHost()) return {};
    const roomId = this.h.getRoomId?.() || '';
    const epoch = this.h.getHostEpoch?.() || 1;
    if (!roomId) {
      console.warn('[security] Missing roomId for host sequence allocation');
      return { _signFailed: true };
    }
    let seq: number;
    try {
      seq = await allocateHostSequence(roomId, epoch, this.h.getHostSeq?.() ?? 0);
    } catch (e) {
      console.error('[security] Failed to allocate host sequence atomically', e);
      return { _signFailed: true };
    }
    const base = {
      ...extra,
      seq,
      epoch,
      roomId,
      hostId: this.h.getHostId?.() || ''
    };
    if (this.h.signPayload) {
      try {
        const signed = await this.h.signPayload(base);
        if (signed) return { auth: signed, seq, epoch };
      } catch (e) {
        console.warn('[security] Error generating digital signature for playback command', e);
      }
    }
    // SEC-02 fix: NO plaintext token fallback. If signing fails, abort the host command.
    // The command will not be broadcast with authorization, preventing unauthorized acceptance.
    console.warn('[security] Host command aborted: digital signature could not be generated. No fallback.');
    return { _signFailed: true };
  }

  // ── local intents ──
  async play() {
    if (!this.h.canControl()) return;
    const time = this.adapter?.getTime() ?? this.state.time;
    Object.assign(this.state, { playing: true, time });
    await this.safePlay();
    const auth = await this.authPayload({ op: 'play', time, playing: true });
    if ((auth as any)?._signFailed) return; // SEC-02: abort if signing failed
    this.t.send('pb', { op: 'play', time, playing: true, ...auth });
  }
  async pause() {
    if (!this.h.canControl()) return;
    const time = this.adapter?.getTime() ?? this.state.time;
    Object.assign(this.state, { playing: false, time });
    this.adapter?.pause();
    const auth = await this.authPayload({ op: 'pause', time, playing: false });
    if ((auth as any)?._signFailed) return; // SEC-02: abort if signing failed
    this.t.send('pb', { op: 'pause', time, playing: false, ...auth });
  }
  async seek(time: number) {
    if (!this.h.canControl()) return;
    this.state.time = time;
    this.adapter?.seek(time);
    const auth = await this.authPayload({ op: 'seek', time, playing: this.state.playing });
    if ((auth as any)?._signFailed) return; // SEC-02: abort if signing failed
    this.t.send('pb', { op: 'seek', time, playing: this.state.playing, ...auth });
  }
  async setSource(source: MediaSource | null) {
    if (!this.h.canControl()) return;
    this.state = { source, playing: false, time: 0 };
    this.h.onSource(source);
    const pub = publicSource(source);
    const auth = await this.authPayload({ op: 'source', source: pub });
    if ((auth as any)?._signFailed) return; // SEC-02: abort if signing failed
    this.t.send('pb', { op: 'source', source: pub, ...auth });
  }
  async sendState() {
    const a = this.adapter;
    if (a?.isReady()) Object.assign(this.state, { playing: a.isPlaying(), time: a.getTime() });
    const pub = publicSource(this.state.source);
    const hostOnly = this.h.getHostOnly();
    const auth = await this.authPayload({
      op: 'state',
      source: pub,
      playing: this.state.playing,
      time: this.state.time,
      hostOnly
    });
    if ((auth as any)?._signFailed) return; // SEC-02: abort if signing failed
    this.t.send('pb', {
      op: 'state',
      source: pub,
      playing: this.state.playing,
      time: this.state.time,
      hostOnly,
      ...auth
    });
  }

  // ── remote ──
  private async recv(d: any, from: string) {
    if (!d || typeof d.op !== 'string') return;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6 ? v : null);
    switch (d.op) {
      case 'req':
        if (this.h.isHost()) void this.sendState();
        return;
      case 'source': {
        const authorized = await Promise.resolve(this.h.isAuthorized(from, d.auth, d));
        if (!authorized || !(d.source === null || isSafeSource(d.source))) return;
        this.state = { source: d.source, playing: false, time: 0 };
        this.pending = !!d.source;
        this.h.onSource(d.source);
        this.h.onStatus(d.source ? 'waiting-source' : 'idle');
        return;
      }
      case 'state': {
        const authorized = await Promise.resolve(this.h.isAuthorized(from, d.auth, d));
        if (!authorized) return;
        const time = num(d.time);
        if (time === null || typeof d.playing !== 'boolean') return;
        if (typeof d.hostOnly === 'boolean') this.h.onHostOnly(d.hostOnly);
        const src = d.source ?? null;
        if (src !== null && !isSafeSource(src)) return;
        if (!sameSource(src, this.state.source)) {
          this.state.source = src;
          this.h.onSource(src);
          this.pending = true;
        }
        await this.applyState(time, d.playing);
        return;
      }
      case 'play': case 'pause': case 'seek': {
        const authorized = await Promise.resolve(this.h.isAuthorized(from, d.auth, d));
        if (!authorized) return;
        const time = num(d.time);
        if (time === null) return;
        const playing = d.op === 'play' ? true : d.op === 'pause' ? false : typeof d.playing === 'boolean' ? d.playing : this.state.playing;
        await this.applyState(time, playing);
      }
    }
  }

  private async applyState(time: number, playing: boolean) {
    this.state.time = time; this.state.playing = playing;
    const a = this.adapter;
    if (!a || !a.isReady()) { this.pending = !!this.state.source; this.h.onStatus(this.state.source ? 'waiting-source' : 'idle'); return; }
    this.pending = false;
    const drift = Math.abs(a.getTime() - time);
    if (drift > DRIFT_SEEK || (!playing && drift > 0.3)) { a.seek(time); this.h.onStatus('correcting'); }
    else this.h.onStatus('synced');
    if (playing && !a.isPlaying()) await this.safePlay();
    else if (!playing && a.isPlaying()) a.pause();
  }

  private async safePlay() {
    try { await this.adapter?.play(); }
    catch (e: any) { if (e?.name === 'NotAllowedError') this.h.onStatus('needs-interaction'); }
  }

  private tick() { if (this.h.isHost() && this.adapter?.isReady()) { this.sendState(); this.h.onStatus('synced'); } }
}

const sameSource = (a: MediaSource | null, b: MediaSource | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.title === b.title && (a.kind === 'local' ? a.fileName === b.fileName : a.url === b.url));
