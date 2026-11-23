import { BaseTransport, sanitizeMeta, type PeerMeta } from './transport';
import type { Peer } from '../lib/types';

/**
 * Local Demo transport: BroadcastChannel. Works between tabs/windows of the SAME browser on the SAME device only.
 * It is NOT cross-device realtime.
 */
export class LocalTransport extends BaseTransport {
  readonly mode = 'local' as const;
  private bc?: BroadcastChannel;
  private meta?: PeerMeta;
  private known = new Map<string, { peer: Peer; seen: number }>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private roomId: string) { super(); }

  join(meta: PeerMeta) {
    this.meta = meta;
    if (typeof BroadcastChannel === 'undefined') { this.setStatus('offline'); return; }
    this.bc = new BroadcastChannel(`anime-together:${this.roomId}`);
    this.bc.onmessage = (e) => this.onMsg(e.data);
    this.known.set(this.clientId, { peer: { clientId: this.clientId, ...meta }, seen: Date.now() });
    this.hello();
    this.timer = setInterval(() => { this.hello(); this.prune(); }, 2000);
    this.setStatus('connected');
    this.publish();
  }
  leave() {
    this.bc?.postMessage({ k: 'bye', from: this.clientId });
    if (this.timer) clearInterval(this.timer);
    this.bc?.close();
    this.bc = undefined;
  }
  send(type: string, data?: unknown) { this.bc?.postMessage({ k: 'msg', from: this.clientId, type, data }); }

  private hello() { this.bc?.postMessage({ k: 'hello', from: this.clientId, meta: this.meta }); }
  private publish() { this.setPeers([...this.known.values()].map((v) => v.peer)); }
  private prune() {
    let changed = false;
    for (const [id, v] of this.known) if (id !== this.clientId && Date.now() - v.seen > 6500) { this.known.delete(id); changed = true; }
    if (changed) this.publish();
  }
  private onMsg(m: any) {
    if (!m || typeof m.from !== 'string' || m.from === this.clientId) return;
    if (m.k === 'hello') {
      const meta = sanitizeMeta(m.meta);
      if (!meta) return;
      const isNew = !this.known.has(m.from);
      this.known.set(m.from, { peer: { clientId: m.from, ...meta }, seen: Date.now() });
      if (isNew) { this.hello(); this.publish(); }
    } else if (m.k === 'bye') {
      if (this.known.delete(m.from)) this.publish();
    } else if (m.k === 'msg' && typeof m.type === 'string') {
      this.emit(m.type, m.data, m.from);
    }
  }
}
