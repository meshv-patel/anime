import { useCallback, useEffect, useRef, useState } from 'react';
import { iceConfig } from '../lib/env';
import {
  generateHostKeyHandle,
  signPlaybackPayload,
  verifyPlaybackSignature,
  initSequenceBaseline,
  loadStoredSeq,
} from '../lib/security';
import type { ConnStatus, MediaSource, Peer, Profile, RoomInfo } from '../lib/types';
import { MediaManager } from '../media/mediaManager';
import { createTransport } from '../realtime/createTransport';
import * as api from '../realtime/roomApi';
import type { Transport } from '../realtime/transport';
import { SyncService, type SyncStatus } from '../services/syncService';
import { addHistory } from '../lib/storage';

export interface Session { transport: Transport; sync: SyncService; media: MediaManager; userId: string }

/** Central lifecycle owner: join → transport → sync → media → heartbeat/host-monitor → cleanup. One subscription per room. */
export function useRoomSession(roomId: string, profile: Profile) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [source, setSource] = useState<MediaSource | null>(null);
  const [hostOnly, setHostOnlyState] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const roomRef = useRef<RoomInfo | null>(null);
  const peersRef = useRef<Peer[]>([]);
  const hostOnlyRef = useRef(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const userId = await api.ensureUser();
        let info = await api.joinRoom(roomId, profileRef.current.nickname);
        if (disposed) return;

        // If this client is the room host, ensure non-extractable asymmetric ECDSA key handle is registered
        if (info.hostId === userId) {
          let keyHandle = await api.getHostKeyHandle(roomId);
          if (!keyHandle) {
            const generated = await generateHostKeyHandle(roomId);
            keyHandle = { privateKey: generated.privateKey, publicKey: generated.publicKey, publicKeyStr: generated.publicKeyStr };
          }
          if (info.hostPubkey !== keyHandle.publicKeyStr) {
            if (typeof info.hostEpoch !== 'number' || info.hostEpoch <= 0) {
              throw new Error(`[security] Room initialization failed: invalid host epoch (${info.hostEpoch})`);
            }
            try {
              info = await api.registerHostPubKey(roomId, keyHandle.publicKeyStr, info.hostEpoch);
            } catch (e) {
              console.warn('[security] Could not register host public key', e);
            }
          }
        }

        roomRef.current = info;
        setRoom(info);
        const baselineSeq = Math.max(
          info.hostSeq ?? 0,
          info.playbackState?.seq ?? 0
        );
        if (typeof info.hostEpoch !== 'number' || info.hostEpoch <= 0) {
          throw new Error(`[security] Cannot initialize baseline: invalid host epoch (${info.hostEpoch})`);
        }
        await initSequenceBaseline(roomId, info.hostEpoch, baselineSeq);
        if (typeof info.hostOnly === 'boolean') {
          hostOnlyRef.current = info.hostOnly;
          setHostOnlyState(info.hostOnly);
        }

        const transport = createTransport(roomId);
        const isHostNow = () => roomRef.current?.hostId === userId;
        const sync = new SyncService(transport, {
          canControl: () => !hostOnlyRef.current || isHostNow(),
          isAuthorized: async (from, auth, payload) => {
            // Unrestricted mode: any room member currently in presence may issue commands
            if (!hostOnlyRef.current) {
              return peersRef.current.some((p) => p.clientId === from);
            }
            // Host-only mode: NEVER trust client-provided `from` field.
            // Verify asymmetric ECDSA digital signature against hostPubkey
            const hostPubkey = roomRef.current?.hostPubkey;
            const currentHostId = roomRef.current?.hostId;
            const currentEpoch = roomRef.current?.hostEpoch || 1;
            if (hostPubkey && currentHostId && auth && typeof auth === 'object') {
              const valid = await verifyPlaybackSignature(
                hostPubkey,
                payload as any,
                auth,
                {
                  expectedRoomId: roomId,
                  expectedHostId: currentHostId,
                  expectedEpoch: currentEpoch
                }
              );
              if (valid) return true;
            }
            // SEC-02 fix: NO plaintext host-token fallback. If ECDSA fails, the command is rejected.
            return false;
          },
          isHost: isHostNow,
          getHostOnly: () => hostOnlyRef.current,
          getRoomId: () => roomId,
          getHostId: () => roomRef.current?.hostId || '',
          getHostEpoch: () => roomRef.current?.hostEpoch || 1,
          getHostSeq: () => roomRef.current?.hostSeq || 0,
          signPayload: async (payload) => {
            if (!isHostNow()) return null;
            const keyHandle = await api.getHostKeyHandle(roomId);
            if (keyHandle) {
              return signPlaybackPayload(keyHandle.privateKey, {
                ...payload,
                roomId,
                hostId: roomRef.current?.hostId || '',
                epoch: roomRef.current?.hostEpoch || 1
              } as any);
            }
            const kp = api.getHostKeyPair(roomId);
            if (!kp) return null;
            return signPlaybackPayload(kp.privateKeyJwk, {
              ...payload,
              roomId,
              hostId: roomRef.current?.hostId || '',
              epoch: roomRef.current?.hostEpoch || 1
            } as any);
          },
          onSource: (s) => {
            setSource(s);
            if (s) addHistory({ title: s.title, url: s.kind === 'local' ? undefined : s.url, at: Date.now() });
            if (isHostNow()) {
              void api.updatePlayback(roomId, 'source', 0, false, s).catch(() => {});
            }
          },
          onHostOnly: (v) => { hostOnlyRef.current = v; setHostOnlyState(v); },
          onStatus: setSyncStatus
        });
        const getHostClientId = () => {
          const hostUserId = roomRef.current?.hostId;
          if (!hostUserId) return null;
          return peersRef.current.find((p) => p.userId === hostUserId)?.clientId ?? null;
        };
        const media = new MediaManager(transport, iceConfig(), getHostClientId);

        const refreshRoom = () => api.getRoom(roomId).then(async (r) => {
          if (!disposed) {
            roomRef.current = r;
            setRoom(r);
            const refBaseline = Math.max(
              r.hostSeq ?? 0,
              r.playbackState?.seq ?? 0
            );
            await initSequenceBaseline(roomId, r.hostEpoch ?? 1, refBaseline);
            if (typeof r.hostOnly === 'boolean') {
              hostOnlyRef.current = r.hostOnly;
              setHostOnlyState(r.hostOnly);
            }
            // If we became host, register our key and announce to the room
            if (r.hostId === userId && !r.hostPubkey) {
              if (typeof r.hostEpoch !== 'number' || r.hostEpoch <= 0) {
                console.error('[security] Host transfer detected without valid positive epoch', r.hostEpoch);
                return;
              }
              let keyHandle = await api.getHostKeyHandle(roomId);
              if (!keyHandle) {
                const generated = await generateHostKeyHandle(roomId);
                keyHandle = { privateKey: generated.privateKey, publicKey: generated.publicKey, publicKeyStr: generated.publicKeyStr };
              }
              api.registerHostPubKey(roomId, keyHandle.publicKeyStr, r.hostEpoch).then((updated) => {
                roomRef.current = updated;
                setRoom(updated);
                transport.send('host', {});
              }).catch(() => {});
            }
          }
        }).catch(() => {});

        const offs = [
          transport.onPresence((list) => {
            peersRef.current = list; setPeers(list);
            media.setPeers(list.filter((p) => p.clientId !== transport.clientId).map((p) => p.clientId));
          }),
          transport.onStatus((s) => { setStatus(s); if (s === 'connected') setTimeout(() => sync.requestState(), 600); }),
          transport.on('host', () => void refreshRoom())
        ];
        sync.start();
        transport.join({ userId, nickname: profileRef.current.nickname, avatar: profileRef.current.avatar, joinedAt: Date.now() });
        setSession({ transport, sync, media, userId });
        setPhase('ready');

        // heartbeat + host monitor + expiry
        let hostMissing = 0;
        const timer = setInterval(() => {
          void api.heartbeat(roomId).catch(() => {});
          const r = roomRef.current;
          if (!r) return;
          if (Date.now() > r.expiresAt) { setError('This room has expired.'); setPhase('error'); return; }
          const list = peersRef.current;
          const hostHere = list.some((p) => p.userId === r.hostId);
          hostMissing = hostHere ? 0 : hostMissing + 1;
          // automatic host reassignment: the longest-present remaining member claims it (server verifies the old host is stale)
          if (hostMissing >= 2 && list[0]?.clientId === transport.clientId) {
            api.claimHost(roomId).then((nr) => {
              roomRef.current = nr; setRoom(nr); transport.send('host', {});
            }).catch(() => {});
          }
        }, 10_000);

        cleanup = () => { clearInterval(timer); offs.forEach((o) => o()); sync.stop(); media.closeAll(); transport.leave(); };
      } catch (e) {
        if (!disposed) { setError((e as Error).message || 'Could not join the room.'); setPhase('error'); }
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [roomId]);

  const isHost = !!session && room?.hostId === session.userId;
  const canControl = !hostOnly || isHost;

  const setHostOnly = useCallback(async (v: boolean) => {
    if (!session || !isHost) return;
    try {
      const nr = await api.setHostOnly(roomId, v);
      roomRef.current = nr;
      setRoom(nr);
      hostOnlyRef.current = v;
      setHostOnlyState(v);
      session.sync.sendState();
      session.transport.send('host', {});
    } catch (e) {
      console.error('[security] Failed to update host-only mode', e);
    }
  }, [session, isHost, roomId]);

  const transferHost = useCallback(async (peer: Peer) => {
    if (!session || !isHost) return;
    await api.clearHostKeyPair(roomId);
    const nr = await api.transferHost(roomId, peer.userId);
    roomRef.current = nr; setRoom(nr);
    session.transport.send('host', {});
  }, [session, isHost, roomId]);

  const getDiagnostics = useCallback(async () => {
    const peerDiags = session ? await session.media.getDiagnostics() : [];
    const currentEpoch = roomRef.current?.hostEpoch ?? 1;
    const currentSeq = session?.sync ? (session.sync as any).lastSeq ?? 0 : 0;
    const storedSeq = loadStoredSeq(roomId, currentEpoch);
    const hostKey = await api.getHostKeyHandle(roomId);

    return {
      roomId,
      userId: session?.userId ?? '',
      clientId: session?.transport.clientId ?? '',
      isHost,
      hostId: roomRef.current?.hostId ?? '',
      hostEpoch: currentEpoch,
      hostSeq: roomRef.current?.hostSeq ?? 0,
      clientLastSeq: currentSeq,
      storedSeqBaseline: storedSeq,
      hasPrivateKey: Boolean(hostKey?.privateKey),
      hasHostPubkey: Boolean(roomRef.current?.hostPubkey),
      hostPubkeyFingerprint: roomRef.current?.hostPubkey
        ? `${roomRef.current.hostPubkey.slice(0, 8)}...${roomRef.current.hostPubkey.slice(-8)}`
        : null,
      hasHostTokenHash: false, // SEC-02: token fallback removed; field kept for diagnostics compatibility
      hostOnly: hostOnlyRef.current,
      syncStatus,
      connectionStatus: status,
      peerCount: peers.length,
      peers: peers.map((p) => ({
        clientId: p.clientId,
        userId: p.userId,
        nickname: p.nickname,
        isHost: p.userId === roomRef.current?.hostId
      })),
      lastMediaError: session?.media.lastError?.message ?? null,
      lastTransportError: (session?.transport as any)?.lastError ?? null,
      webrtcPeers: peerDiags,
      timestamp: new Date().toISOString()
    };
  }, [session, roomId, isHost, syncStatus, status, peers]);

  return { phase, error, room, session, peers, status, source, hostOnly, syncStatus, isHost, canControl, setHostOnly, transferHost, getDiagnostics };
}
