// Headless logic test for SyncService + LocalTransport (no browser). Run: npm run test:sync
import { LocalTransport } from '../src/realtime/localTransport';
import { SyncService, type PlayerAdapter, type SyncStatus } from '../src/services/syncService';
import type { MediaSource } from '../src/lib/types';
import { generateHostKeyHandle, signPlaybackPayload, verifyPlaybackSignature, resetReplayCacheForTests } from '../src/lib/security';

// Mock storage for headless Node.js
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; }
};
(globalThis as any).localStorage = mockStorage;
(globalThis as any).sessionStorage = mockStorage;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

function mockAdapter(): PlayerAdapter & { t: number; playing: boolean; seeks: number } {
  const a = { t: 0, playing: false, seeks: 0,
    async play() { a.playing = true; }, pause() { a.playing = false; },
    seek(t: number) { a.t = t; a.seeks++; }, getTime: () => a.t, isPlaying: () => a.playing, isReady: () => true };
  return a;
}

const room = 'testroomtestroomtest';
resetReplayCacheForTests();

// Generate host key for signing
const hostKeyHandle = await generateHostKeyHandle(room);

function peer(roomId: string, userId: string, hostId: string, hostOnly = { v: false }) {
  const t = new LocalTransport(roomId);
  const a = mockAdapter();
  const log = { source: null as MediaSource | null, status: 'idle' as SyncStatus, hostOnly: hostOnly.v };
  const isHostPeer = userId === hostId;
  const sync = new SyncService(t, {
    canControl: () => !log.hostOnly || isHostPeer,
    isAuthorized: async (_from, auth, payload) => {
      if (!log.hostOnly) return true;
      // In host-only mode, verify ECDSA signature
      if (auth && typeof auth === 'object') {
        return verifyPlaybackSignature(hostKeyHandle.publicKeyStr, payload as any, auth, {
          expectedRoomId: roomId,
          expectedHostId: hostId,
          expectedEpoch: 1
        });
      }
      return false;
    },
    isHost: () => isHostPeer,
    getHostOnly: () => log.hostOnly,
    ...(isHostPeer ? {
      getRoomId: () => roomId,
      getHostId: () => hostId,
      getHostEpoch: () => 1,
      getHostSeq: () => 0,
      signPayload: async (payload: Record<string, unknown>) =>
        signPlaybackPayload(hostKeyHandle.privateKey, {
          ...payload,
          roomId,
          hostId,
          epoch: 1
        } as any)
    } : {}),
    onSource: (s) => { log.source = s; }, onHostOnly: (v) => { log.hostOnly = v; }, onStatus: (s) => { log.status = s; }
  });
  sync.start(); sync.attach(a);
  t.join({ userId, nickname: userId, avatar: '🌸|#f4a6c0', joinedAt: Date.now() });
  return { t, a, sync, log };
}
const hostClient = { id: '' };

const host = peer(room, 'host', 'host');
hostClient.id = host.t.clientId;
const guest = peer(room, 'guest', 'host');
await sleep(80);

const src: MediaSource = { kind: 'mp4', url: 'https://example.com/a.mp4', title: 'Ep 1' };
host.sync.setSource(src); await sleep(30);
check('source change propagates', guest.log.source?.url === src.url);

await host.sync.play(); await sleep(30);
check('play propagates', guest.a.playing === true);
host.a.t = 42;
host.sync.seek(42); await sleep(30);
check('seek propagates', guest.a.t === 42);
host.sync.pause(); await sleep(30);
check('pause propagates', guest.a.playing === false);
check('no echo: host not re-seeked by its own events', host.a.seeks === 1, `(host seeks=${host.a.seeks})`);

// drift handling
guest.a.t = 42.5; const before = guest.a.seeks;
host.sync.sendState(); await sleep(30);
check('small drift is not corrected by a seek loop', guest.a.seeks - before <= 1);
await host.sync.play(); host.a.t = 100; guest.a.t = 10; host.sync.sendState(); await sleep(30);
check('large drift triggers a seek', guest.a.t === 100);

// late joiner
const late = peer(room, 'late', 'host');
await sleep(50);
late.sync.requestState(); await sleep(50);
check('late joiner receives source + position + playing', late.log.source?.url === src.url && late.a.t === 100 && late.a.playing);

// host-only mode
host.log.hostOnly = true; host.sync.sendState(); await sleep(30);
check('hostOnly flag propagates to guests', guest.log.hostOnly === true);
guest.a.t = 5; await guest.sync.play(); await sleep(30);
check('non-host cannot control in host-only mode', host.a.playing === true && guest.a.t === 5);

// spoofed / malformed events
(guest.t as any).send('pb', { op: 'source', source: { kind: 'mp4', url: 'javascript:alert(1)', title: 'x' } });
await sleep(30);
check('unsafe source URL rejected', host.log.source?.url === src.url);

for (const p of [host, guest, late]) { p.sync.stop(); p.t.leave(); }
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll sync checks passed');
process.exit(failed ? 1 : 0);
