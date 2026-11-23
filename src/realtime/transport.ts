import type { ConnStatus, Peer } from '../lib/types';
import { uid } from '../lib/ids';

export type Handler = (data: any, from: string) => void;
export type PeerMeta = Omit<Peer, 'clientId'>;

/**
 * Transport = the only thing the rest of the app knows about realtime.
 * Carries signaling and lightweight events ONLY (never media).
 */
export interface Transport {
  readonly mode: 'local' | 'live';
  readonly clientId: string;
  status: ConnStatus;
  join(meta: PeerMeta): void;
  leave(): void;
  send(type: string, data?: unknown): void;
  on(type: string, h: Handler): () => void;
  onPresence(cb: (peers: Peer[]) => void): () => void;
  onStatus(cb: (s: ConnStatus) => void): () => void;
}

export function sanitizeMeta(m: any): PeerMeta | null {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.nickname !== 'string' || typeof m.userId !== 'string') return null;
  return {
    userId: m.userId.slice(0, 64),
    nickname: m.nickname.trim().slice(0, 24) || 'Guest',
    avatar: typeof m.avatar === 'string' ? m.avatar.slice(0, 24) : '🌸|#f4a6c0',
    joinedAt: Number.isFinite(m.joinedAt) ? m.joinedAt : Date.now()
  };
}

export abstract class BaseTransport implements Transport {
  abstract readonly mode: 'local' | 'live';
  readonly clientId = uid();
  status: ConnStatus = 'connecting';
  protected peers: Peer[] = [];
  private handlers = new Map<string, Set<Handler>>();
  private presenceCbs = new Set<(p: Peer[]) => void>();
  private statusCbs = new Set<(s: ConnStatus) => void>();

  abstract join(meta: PeerMeta): void;
  abstract leave(): void;
  abstract send(type: string, data?: unknown): void;

  on(type: string, h: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(h);
    return () => { this.handlers.get(type)?.delete(h); };
  }
  onPresence(cb: (p: Peer[]) => void) { this.presenceCbs.add(cb); return () => { this.presenceCbs.delete(cb); }; }
  onStatus(cb: (s: ConnStatus) => void) { this.statusCbs.add(cb); return () => { this.statusCbs.delete(cb); }; }

  protected emit(type: string, data: unknown, from: string) {
    this.handlers.get(type)?.forEach((h) => { try { h(data, from); } catch (e) { console.error('[transport] handler error', type, e); } });
  }
  protected setPeers(p: Peer[]) {
    this.peers = [...p].sort((a, b) => a.joinedAt - b.joinedAt || a.clientId.localeCompare(b.clientId));
    this.presenceCbs.forEach((cb) => cb(this.peers));
  }
  protected setStatus(s: ConnStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s));
  }
}
