import type { RealtimeChannel } from '@supabase/supabase-js';
import { BaseTransport, sanitizeMeta, type PeerMeta } from './transport';
import { getSupabase } from './supabase';
import { env } from '../lib/env';
import type { Peer } from '../lib/types';

/** Supabase Realtime: Broadcast for events/signaling, Presence for participants. One channel per room. */
export class LiveTransport extends BaseTransport {
  readonly mode = 'live' as const;
  private channel?: RealtimeChannel;
  private meta?: PeerMeta;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private isLeaving = false;
  lastError: string | null = null;

  constructor(private roomId: string) { super(); }

  join(meta: PeerMeta) {
    this.isLeaving = false;
    this.meta = meta;
    void this.setupChannel(meta);
  }

  private async setupChannel(meta: PeerMeta) {
    if (this.isLeaving) return;
    const sb = getSupabase();

    // Ensure realtime socket is authenticated with the session access token before channel join
    if (env.privateChannels) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          await sb.realtime.setAuth(session.access_token);
        }
      } catch (err: any) {
        console.warn('[transport] failed to sync realtime auth token', err);
      }
    }
    if (this.isLeaving) return;

    // Clean up existing channel if re-subscribing
    if (this.channel) {
      try {
        void this.channel.untrack();
        void sb.removeChannel(this.channel);
      } catch {}
      this.channel = undefined;
    }

    const ch = sb.channel(`room:${this.roomId}`, {
      config: { private: env.privateChannels, broadcast: { self: false }, presence: { key: this.clientId } }
    });
    this.channel = ch;

    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (!payload || typeof payload.type !== 'string' || typeof payload.from !== 'string' || payload.from === this.clientId) return;
      this.emit(payload.type, payload.data, payload.from);
    });

    ch.on('presence', { event: 'sync' }, () => {
      const out: Peer[] = [];
      for (const [key, arr] of Object.entries(ch.presenceState())) {
        const m = sanitizeMeta((arr as any[])[0]);
        if (m) out.push({ clientId: key, ...m });
      }
      this.setPeers(out);
    });

    ch.subscribe(async (status, err) => {
      if (this.isLeaving) return;
      if (status === 'SUBSCRIBED') {
        this.lastError = null;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = undefined;
        }
        this.setStatus('connected');
        await ch.track(meta);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const errMsg = err?.message || (err ? String(err) : status);
        this.lastError = errMsg;
        console.warn(`[transport] Supabase channel ${status}:`, errMsg);
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      } else if (status === 'CLOSED') {
        if (!this.reconnectTimer && !this.isLeaving) {
          this.setStatus('offline');
        }
      }
    });
  }

  private scheduleReconnect() {
    if (this.isLeaving || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      if (this.isLeaving || !this.meta) return;
      try {
        const sb = getSupabase();
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          await sb.realtime.setAuth(session.access_token);
        }
      } catch {}
      if (this.isLeaving || !this.meta) return;
      void this.setupChannel(this.meta);
    }, 2500);
  }

  leave() {
    this.isLeaving = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const ch = this.channel;
    this.channel = undefined;
    this.meta = undefined;
    if (ch) {
      void ch.untrack();
      void getSupabase().removeChannel(ch);
    }
  }

  send(type: string, data?: unknown) {
    if (!this.channel || this.status !== 'connected') return;
    void this.channel.send({ type: 'broadcast', event: 'm', payload: { from: this.clientId, type, data } });
  }
}
