// End-to-end test simulating two browser tabs in Local Demo Mode
import { LocalTransport } from '../src/realtime/localTransport';
import { SyncService, type PlayerAdapter } from '../src/services/syncService';
import type { MediaSource, Peer } from '../src/lib/types';
import { createStore } from '../src/services/roomStore';
import { createRoom, joinRoom, getRoom, transferHost } from '../src/realtime/roomApi';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING TWO-TAB LOCAL DEMO SIMULATION ---\n');

// Mock localStorage and sessionStorage for Node.js environment
const memoryStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; }
};
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;

// 1. Room Creation in Demo Mode
console.log('1. Testing Room Lifecycle in Demo Mode');
const hostRoom = await createRoom('HostUser');
check('Host creates room with 20-char valid ID', hostRoom.id.length === 20);
check('Host is assigned as host_id', hostRoom.hostId.length > 0);

// Tab 2 joins the room
const guestRoom = await joinRoom(hostRoom.id, 'GuestUser');
check('Guest joins the same room', guestRoom.id === hostRoom.id);
check('Guest sees hostId', guestRoom.hostId === hostRoom.hostId);

// 2. Transports for Tab 1 (Host) and Tab 2 (Guest)
console.log('\n2. Testing Realtime Communication (BroadcastChannel)');
const roomId = hostRoom.id;
const hostTransport = new LocalTransport(roomId);
const guestTransport = new LocalTransport(roomId);

let hostPeers: Peer[] = [];
let guestPeers: Peer[] = [];
hostTransport.onPresence((p) => { hostPeers = p; });
guestTransport.onPresence((p) => { guestPeers = p; });

hostTransport.join({ userId: hostRoom.hostId, nickname: 'HostUser', avatar: '🌸|#f4a6c0', joinedAt: 1000 });
guestTransport.join({ userId: 'guest-uid-123', nickname: 'GuestUser', avatar: '🦊|#ffb86b', joinedAt: 2000 });

await sleep(100);
check('Host discovers Guest in presence', hostPeers.some((p) => p.nickname === 'GuestUser'));
check('Guest discovers Host in presence', guestPeers.some((p) => p.nickname === 'HostUser'));
check('Host is first in sorted peers list', hostPeers[0]?.nickname === 'HostUser');

// 3. Chat and Reactions between tabs
console.log('\n3. Testing Chat & Reactions between Tab 1 and Tab 2');
let guestReceivedChat: any = null;
let guestReceivedRx: any = null;
guestTransport.on('chat', (data, from) => { guestReceivedChat = { data, from }; });
guestTransport.on('rx', (data, from) => { guestReceivedRx = { data, from }; });

hostTransport.send('chat', { id: 'msg-1', text: 'Hello from Tab 1!', spoiler: false });
await sleep(50);
check('Guest received chat from Host', guestReceivedChat?.data?.text === 'Hello from Tab 1!');
check('Sender clientId matches Host', guestReceivedChat?.from === hostTransport.clientId);

hostTransport.send('rx', { emoji: '🔥' });
await sleep(50);
check('Guest received reaction from Host', guestReceivedRx?.data?.emoji === '🔥');

// 4. Watchlist & Moments Synchronization
console.log('\n4. Testing Watchlist & Moments Synchronization');
const hostStore = createStore(roomId);
const guestStore = createStore(roomId);

await hostStore.addWatch('Attack on Titan Final Season');
let guestWlPings = 0;
guestTransport.on('wl', () => { guestWlPings++; });
hostTransport.send('wl', {});
await sleep(50);

const guestWatchlist = await guestStore.watchlist();
check('Guest sees anime added by Host in Watchlist', guestWatchlist.length === 1 && guestWatchlist[0].title === 'Attack on Titan Final Season');
check('Guest received wl sync ping', guestWlPings === 1);

await guestStore.addMoment({ note: 'Epic ODM scene', position: 142.5, sourceTitle: 'Attack on Titan Final Season' });
let hostMomPings = 0;
hostTransport.on('mom', () => { hostMomPings++; });
guestTransport.send('mom', {});
await sleep(50);

const hostMoments = await hostStore.moments();
check('Host sees moment saved by Guest', hostMoments.length === 1 && hostMoments[0].note === 'Epic ODM scene');
check('Host received mom sync ping', hostMomPings === 1);

// 5. Host Transfer in Demo Mode
console.log('\n5. Testing Host Transfer');
const updatedRoom = await transferHost(roomId, 'guest-uid-123');
check('transferHost changes hostId to Guest', updatedRoom.hostId === 'guest-uid-123');
const fetched = await getRoom(roomId);
check('getRoom reflects updated host', fetched.hostId === 'guest-uid-123');

// 6. WebRTC Signaling Simulation over Local Transport
console.log('\n6. Testing WebRTC Signaling Transport');
let rtcMessagesReceived = 0;
guestTransport.on('rtc', (data, from) => {
  if (data?.to === guestTransport.clientId) rtcMessagesReceived++;
});
hostTransport.send('rtc', { to: guestTransport.clientId, description: { type: 'offer', sdp: 'dummy-sdp' } });
await sleep(50);
check('WebRTC offer routed to targeted peer', rtcMessagesReceived === 1);

// 7. WebRTC Diagnostics & Telemetry
console.log('\n7. Testing MediaManager Diagnostics & Telemetry');
import { MediaManager } from '../src/media/mediaManager';
const dummyIceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const hostMedia = new MediaManager(hostTransport, dummyIceConfig);
check('MediaManager initializes with null lastError', hostMedia.lastError === null);
const diags = await hostMedia.getDiagnostics();
check('getDiagnostics returns array', Array.isArray(diags));
check('getDiagnostics returns 0 peers when none connected', diags.length === 0);
hostMedia.closeAll();

// Clean up
hostTransport.leave();
guestTransport.leave();

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll Two-Tab Local Demo tests PASSED!');
process.exit(failed ? 1 : 0);
