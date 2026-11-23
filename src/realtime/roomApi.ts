import { liveConfigured } from '../lib/env';
import { randomRoomId, uid } from '../lib/ids';
import { readJson, writeJson } from '../lib/storage';
import { hostKeyStore, type HostKeyPair, type HostKeyHandle } from '../lib/security';
import type { MediaSource, RoomInfo } from '../lib/types';
import { getSupabase } from './supabase';

/** Room lifecycle & Security-Hardened API. Live mode: Postgres RPCs. Demo mode: localStorage. */
const ROOM_TTL_MS = 24 * 3600 * 1000;
const DEMO_MAX = 6;

export async function getHostKeyHandle(roomId: string): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicKeyStr: string } | null> {
  return hostKeyStore.getKey(roomId);
}

export async function saveHostKeyHandle(roomId: string, privateKey: CryptoKey, publicKey: CryptoKey, publicKeyStr: string): Promise<void> {
  return hostKeyStore.saveKey(roomId, privateKey, publicKey, publicKeyStr);
}

export function getHostKeyPair(roomId: string): HostKeyPair | null {
  try {
    const raw = sessionStorage.getItem(`at_host_kp_${roomId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setHostKeyPair(roomId: string, kp: HostKeyPair): void {
  try {
    sessionStorage.setItem(`at_host_kp_${roomId}`, JSON.stringify(kp));
  } catch {
    /* ignore storage blocks */
  }
}

export async function clearHostKeyPair(roomId: string): Promise<void> {
  try {
    sessionStorage.removeItem(`at_host_kp_${roomId}`);
    sessionStorage.removeItem(`at_host_token_${roomId}`);
    await hostKeyStore.clearKey(roomId);
  } catch {
    /* ignore */
  }
}

export function getHostToken(roomId: string): string | null {
  try { return sessionStorage.getItem(`at_host_token_${roomId}`) ?? null; } catch { return null; }
}

export function setHostToken(roomId: string, token: string): void {
  try { sessionStorage.setItem(`at_host_token_${roomId}`, token); } catch { /* ignore storage blocks */ }
}

export async function clearHostToken(roomId: string): Promise<void> {
  await clearHostKeyPair(roomId);
}

export async function ensureUser(): Promise<string> {
  if (!liveConfigured) {
    let id = sessionStorage.getItem('at_demo_uid');
    if (!id) { id = uid(); sessionStorage.setItem('at_demo_uid', id); }
    return id;
  }
  const sb = getSupabase();
  let session = (await sb.auth.getSession()).data.session;
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error || !data.user) throw new Error(`Anonymous sign-in failed (${error?.message ?? 'unknown'}). Enable "Anonymous sign-ins" in Supabase → Authentication → Providers.`);
    session = data.session;
  }
  if (session?.access_token) {
    try {
      await sb.realtime.setAuth(session.access_token);
    } catch (e) {
      console.warn('[roomApi] Failed to set realtime auth token', e);
    }
  }
  return session!.user.id;
}

const toInfo = (j: any): RoomInfo => ({
  id: j.id,
  hostId: j.host_id,
  maxParticipants: j.max_participants,
  expiresAt: typeof j.expires_at === 'number' ? j.expires_at : Date.parse(j.expires_at),
  hostOnly: j.host_only ?? false,
  hostPubkey: j.host_pubkey ?? null,
  hostEpoch: j.host_epoch ?? 1,
  hostSeq: j.host_seq ?? (j.playback_state?.seq ?? 0),
  currentSource: j.current_source ?? null,
  playbackState: j.playback_state ?? null
});

async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

type DemoRooms = Record<string, RoomInfo>;
const demoRooms = () => readJson<DemoRooms>('at_demo_rooms', {});

export async function createRoom(nickname: string): Promise<RoomInfo> {
  const userId = await ensureUser();
  if (liveConfigured) return toInfo(await rpc('create_room', { p_nickname: nickname }));
  const info: RoomInfo = {
    id: randomRoomId(),
    hostId: userId,
    maxParticipants: DEMO_MAX,
    expiresAt: Date.now() + ROOM_TTL_MS,
    hostOnly: false,
    hostPubkey: null,
    hostEpoch: 1,
    hostSeq: 0,
    currentSource: null,
    playbackState: null
  };
  writeJson('at_demo_rooms', { ...demoRooms(), [info.id]: info });
  return info;
}

export async function joinRoom(id: string, nickname: string): Promise<RoomInfo> {
  await ensureUser();
  if (liveConfigured) return toInfo(await rpc('join_room', { p_room: id, p_nickname: nickname }));
  const r = demoRooms()[id];
  if (!r) throw new Error('Demo rooms only exist in the browser that created them. Connect Supabase to invite people on other devices.');
  if (r.expiresAt < Date.now()) throw new Error('This room has expired.');
  return r;
}

export async function getRoom(id: string): Promise<RoomInfo> {
  if (liveConfigured) return toInfo(await rpc('get_room', { p_room: id }));
  const r = demoRooms()[id];
  if (!r) throw new Error('Room not found');
  return r;
}

export async function transferHost(id: string, newUserId: string): Promise<RoomInfo> {
  if (liveConfigured) return toInfo(await rpc('transfer_host', { p_room: id, p_new_host: newUserId }));
  const rooms = demoRooms();
  const current = rooms[id];
  const userId = await ensureUser();
  if (!current || current.hostId !== userId) throw new Error('Only the host can transfer hosting');
  rooms[id] = {
    ...current,
    hostId: newUserId,
    hostPubkey: null,
    hostEpoch: (current.hostEpoch || 1) + 1,
    hostSeq: 0
  };
  writeJson('at_demo_rooms', rooms);
  await hostKeyStore.clearKey(id);
  clearHostKeyPair(id);
  return rooms[id];
}

export async function claimHost(id: string): Promise<RoomInfo> {
  if (liveConfigured) return toInfo(await rpc('claim_host', { p_room: id }));
  return transferHost(id, await ensureUser());
}

export async function heartbeat(id: string): Promise<void> {
  if (liveConfigured) await rpc('heartbeat', { p_room: id });
}

export async function registerHostPubKey(id: string, pubkey: string, epoch: number): Promise<RoomInfo> {
  if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch <= 0) {
    throw new Error(`[security] Valid positive integer epoch is required for host public key registration (got: ${epoch})`);
  }
  if (liveConfigured) return toInfo(await rpc('register_host_pubkey', { p_room: id, p_pubkey: pubkey, p_epoch: epoch }));
  const rooms = demoRooms();
  const current = rooms[id];
  const userId = await ensureUser();
  if (!current || current.hostId !== userId) throw new Error('Only the host can register a host key');
  if (current.hostEpoch !== undefined && current.hostEpoch !== epoch) {
    throw new Error(`Stale host epoch; key registration rejected (current epoch: ${current.hostEpoch}, requested: ${epoch})`);
  }
  rooms[id] = { ...current, hostPubkey: pubkey };
  writeJson('at_demo_rooms', rooms);
  return rooms[id];
}

export async function registerHostToken(id: string, tokenHash: string): Promise<RoomInfo> {
  // Legacy test utility. Active production authentication uses ECDSA host public keys exclusively.
  const rooms = demoRooms();
  const current = rooms[id];
  const userId = await ensureUser();
  if (!current || current.hostId !== userId) throw new Error('Only the host can register a host token');
  rooms[id] = { ...current };
  writeJson('at_demo_rooms', rooms);
  return rooms[id];
}

export async function setHostOnly(id: string, hostOnly: boolean): Promise<RoomInfo> {
  if (liveConfigured) return toInfo(await rpc('set_host_only', { p_room: id, p_host_only: hostOnly }));
  const rooms = demoRooms();
  const current = rooms[id];
  const userId = await ensureUser();
  if (!current || current.hostId !== userId) throw new Error('Only the host can change host-only controls');
  rooms[id] = { ...current, hostOnly };
  writeJson('at_demo_rooms', rooms);
  return rooms[id];
}

export async function updatePlayback(
  id: string, op: string, time: number, playing: boolean, source?: MediaSource | null, seq?: number
): Promise<RoomInfo> {
  if (liveConfigured) {
    return toInfo(await rpc('update_playback', {
      p_room: id, p_op: op, p_time: time, p_playing: playing,
      p_source: source ? (source.kind === 'local' ? { ...source, url: '' } : source) : null,
      p_seq: seq ?? null
    }));
  }
  const rooms = demoRooms();
  const current = rooms[id];
  const userId = await ensureUser();
  if (!current) throw new Error('Room not found');
  if (current.hostOnly && current.hostId !== userId) throw new Error('Host-only mode is active; unauthorized control attempt');
  const hostSeq = Math.max(current.hostSeq ?? 0, seq ?? 0);
  rooms[id] = {
    ...current,
    hostSeq,
    playbackState: { op, time, playing, seq: hostSeq, updatedAt: Date.now() },
    currentSource: source !== undefined ? source : current.currentSource
  };
  writeJson('at_demo_rooms', rooms);
  return rooms[id];
}
