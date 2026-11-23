import { liveConfigured } from '../lib/env';
import { readJson, writeJson } from '../lib/storage';
import { uid } from '../lib/ids';
import type { Moment, WatchItem, EmaPlaque, EmaTheme, EmaCategory, EmaDiagnostics } from '../lib/types';
import { getSupabase } from '../realtime/supabase';

/** Persistence for the shared watchlist, saved moments, and Ema wish plaques. Live: Supabase tables (RLS). Demo: localStorage (this browser only). */
export interface RoomStore {
  watchlist(): Promise<WatchItem[]>;
  addWatch(title: string): Promise<void>;
  updateWatch(id: string, patch: Partial<Pick<WatchItem, 'status' | 'progress'>>): Promise<void>;
  removeWatch(id: string): Promise<void>;
  moments(): Promise<Moment[]>;
  addMoment(m: Omit<Moment, 'id' | 'createdAt'>): Promise<void>;
  removeMoment(id: string): Promise<void>;
  emaList(): Promise<EmaPlaque[]>;
  addEma(ema: { message: string; authorNickname: string; theme: EmaTheme; category: EmaCategory; authorId?: string }): Promise<void>;
  removeEma(id: string): Promise<void>;
  getEmaDiagnostics(): EmaDiagnostics | null;
}

class LocalStore implements RoomStore {
  private lastDiagnostics: EmaDiagnostics | null = null;
  constructor(private room: string) {}
  private wk = () => `at_wl_${this.room}`;
  private mk = () => `at_mom_${this.room}`;
  private ek = () => `at_ema_${this.room}`;
  async watchlist() { return readJson<WatchItem[]>(this.wk(), []); }
  async addWatch(title: string) { writeJson(this.wk(), [...(await this.watchlist()), { id: uid(), title, status: 'planned', progress: 0 }]); }
  async updateWatch(id: string, p: Partial<WatchItem>) { writeJson(this.wk(), (await this.watchlist()).map((w) => (w.id === id ? { ...w, ...p } : w))); }
  async removeWatch(id: string) { writeJson(this.wk(), (await this.watchlist()).filter((w) => w.id !== id)); }
  async moments() { return readJson<Moment[]>(this.mk(), []); }
  async addMoment(m: Omit<Moment, 'id' | 'createdAt'>) { writeJson(this.mk(), [...(await this.moments()), { ...m, id: uid(), createdAt: Date.now() }]); }
  async removeMoment(id: string) { writeJson(this.mk(), (await this.moments()).filter((m) => m.id !== id)); }
  async emaList(): Promise<EmaPlaque[]> {
    const list = readJson<EmaPlaque[]>(this.ek(), []);
    this.lastDiagnostics = {
      currentRoomId: this.room,
      storeRoomId: this.room,
      queryError: null,
      rowsReturned: list.length,
      reactStateCount: list.length,
      lastFetchedAt: Date.now(),
      otherRoomCards: []
    };
    return list;
  }
  async addEma(ema: { message: string; authorNickname: string; theme: EmaTheme; category: EmaCategory; authorId?: string }) {
    const list = await this.emaList();
    const item: EmaPlaque = {
      id: uid(),
      roomId: this.room,
      message: ema.message.trim().slice(0, 280),
      authorId: ema.authorId ?? 'local-author',
      authorNickname: ema.authorNickname.trim().slice(0, 24),
      theme: ema.theme,
      category: ema.category,
      createdAt: Date.now()
    };
    writeJson(this.ek(), [item, ...list]);
  }
  async removeEma(id: string) {
    const list = await this.emaList();
    writeJson(this.ek(), list.filter((e) => e.id !== id));
  }
  getEmaDiagnostics(): EmaDiagnostics | null {
    return this.lastDiagnostics;
  }
}

class LiveStore implements RoomStore {
  private lastDiagnostics: EmaDiagnostics | null = null;
  constructor(private room: string) {}
  private sb = () => getSupabase();
  private check<T>(r: { data: T; error: { message: string } | null }): T { if (r.error) throw new Error(r.error.message); return r.data; }
  async watchlist() {
    const rows = this.check(await this.sb().from('watchlist_items').select('*').eq('room_id', this.room).order('created_at'));
    return (rows ?? []).map((r: any) => ({ id: r.id, title: r.title, status: r.status, progress: r.progress }));
  }
  async addWatch(title: string) { this.check(await this.sb().from('watchlist_items').insert({ room_id: this.room, title })); }
  async updateWatch(id: string, p: Partial<WatchItem>) { this.check(await this.sb().from('watchlist_items').update(p).eq('id', id)); }
  async removeWatch(id: string) { this.check(await this.sb().from('watchlist_items').delete().eq('id', id)); }
  async moments() {
    const rows = this.check(await this.sb().from('saved_moments').select('*').eq('room_id', this.room).order('created_at'));
    return (rows ?? []).map((r: any) => ({ id: r.id, note: r.note, position: Number(r.position_seconds), sourceTitle: r.source_title, createdAt: Date.parse(r.created_at) }));
  }
  async addMoment(m: Omit<Moment, 'id' | 'createdAt'>) {
    this.check(await this.sb().from('saved_moments').insert({ room_id: this.room, note: m.note, position_seconds: m.position, source_title: m.sourceTitle }));
  }
  async removeMoment(id: string) { this.check(await this.sb().from('saved_moments').delete().eq('id', id)); }
  async emaList(): Promise<EmaPlaque[]> {
    const sb = this.sb();
    const cleanRoom = (this.room || '').trim();

    try {
      await sb.auth.getSession();
    } catch {
      // Continue even if session fetch encounters non-fatal issue
    }

    let rows: any[] = [];
    let otherCards: Array<{ id: string; roomId: string; nickname: string; message: string }> = [];

    // 1. Primary query: fetch ema_cards for this specific room
    const res = await sb
      .from('ema_cards')
      .select('*')
      .eq('room_id', cleanRoom)
      .order('created_at', { ascending: false });

    if (res.error) {
      this.lastDiagnostics = {
        currentRoomId: cleanRoom,
        storeRoomId: this.room,
        queryError: res.error.message,
        rowsReturned: 0,
        reactStateCount: 0,
        lastFetchedAt: Date.now(),
        otherRoomCards: []
      };
      throw new Error(`Failed to load wishes from database: ${res.error.message}`);
    }

    rows = res.data ?? [];

    // 2. Cross-room diagnostic query: check if any cards exist under other room IDs for membership
    try {
      const anyRes = await sb
        .from('ema_cards')
        .select('id, room_id, author_nickname, message')
        .neq('room_id', cleanRoom)
        .limit(5);

      if (anyRes.data && anyRes.data.length > 0) {
        otherCards = anyRes.data.map((c: any) => ({
          id: c.id,
          roomId: c.room_id,
          nickname: c.author_nickname,
          message: c.message ? c.message.slice(0, 30) : ''
        }));
      }
    } catch {
      // Non-critical diagnostic check
    }

    this.lastDiagnostics = {
      currentRoomId: cleanRoom,
      storeRoomId: this.room,
      queryError: null,
      rowsReturned: rows.length,
      reactStateCount: rows.length,
      lastFetchedAt: Date.now(),
      otherRoomCards: otherCards,
      rawSampleRow: rows[0] ?? null
    };

    return rows.map((r: any) => ({
      id: r.id,
      roomId: r.room_id ?? r.roomId ?? cleanRoom,
      message: r.message,
      authorId: r.author_id ?? r.authorId,
      authorNickname: r.author_nickname ?? r.authorNickname ?? 'Guest',
      theme: r.theme ?? 'hinoki',
      category: r.category ?? 'wish',
      createdAt: typeof r.created_at === 'number'
        ? r.created_at
        : (r.created_at ? (Date.parse(r.created_at) || Date.now()) : (r.createdAt ?? Date.now()))
    }));
  }
  async addEma(ema: { message: string; authorNickname: string; theme: EmaTheme; category: EmaCategory; authorId?: string }) {
    const sb = this.sb();
    const cleanRoom = (this.room || '').trim();
    const session = (await sb.auth.getSession()).data.session;
    const userId = session?.user?.id;
    const payload: Record<string, unknown> = {
      room_id: cleanRoom,
      message: ema.message.trim().slice(0, 280),
      author_nickname: ema.authorNickname.trim().slice(0, 24) || 'Guest',
      theme: ema.theme,
      category: ema.category
    };
    if (userId) {
      payload.author_id = userId;
    }
    const res = await sb.from('ema_cards').insert(payload).select();
    this.check(res);
  }
  async removeEma(id: string) {
    this.check(await this.sb().from('ema_cards').delete().eq('id', id));
  }
  getEmaDiagnostics(): EmaDiagnostics | null {
    return this.lastDiagnostics;
  }
}

export const createStore = (room: string): RoomStore => (liveConfigured ? new LiveStore(room) : new LocalStore(room));
