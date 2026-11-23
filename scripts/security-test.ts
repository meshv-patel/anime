// Comprehensive security test suite for host authorization, forged identity rejection, and privilege enforcement
// Updated for Protocol v2: ECDSA signature verification replaces legacy host token verification.
import { LocalTransport } from '../src/realtime/localTransport';
import { SyncService } from '../src/services/syncService';
import {
  generateHostKeyHandle,
  signPlaybackPayload,
  verifyPlaybackSignature,
  generateHostToken,
  hashToken,
  verifyHostToken,
  resetReplayCacheForTests
} from '../src/lib/security';
import { createRoom, setHostOnly, registerHostPubKey, updatePlayback, joinRoom } from '../src/realtime/roomApi';
import { createGamesStore } from '../src/services/gamesStore';

// Mock localStorage for headless Node.js
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
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING SECURITY & ANTI-SPOOFING TEST SUITE ---\n');

// 1. Legacy Cryptographic Token Utilities (still exported for auxiliary use)
console.log('1. Testing Host Token Generation & Cryptographic Verification (Legacy Utilities)');
const hostToken = generateHostToken();
const hostHash = await hashToken(hostToken);
check('Host token generated (hex string length >= 32)', hostToken.length >= 32);
check('Host hash is valid SHA-256 (64 hex characters)', hostHash.length === 64);
check('Valid host token verifies against hash', await verifyHostToken(hostToken, hostHash) === true);
check('Forged/invalid token fails verification', await verifyHostToken('forged-token-12345', hostHash) === false);
check('Empty/null token fails verification', await verifyHostToken(null, hostHash) === false);

// 2. Room Host Privileges & Unauthorized Backend RPC Rejection
console.log('\n2. Testing Backend Host Privilege Enforcement');
// Host creates room
mockStorage.setItem('at_demo_uid', 'host-user-id');
const room = await createRoom('HostUser');
const hostKey = await generateHostKeyHandle(room.id);
await registerHostPubKey(room.id, hostKey.publicKeyStr, room.hostEpoch);

// Guest attempts unauthorized host actions:
mockStorage.setItem('at_demo_uid', 'rogue-guest-id');

let unauthorizedHostOnlyBlocked = false;
try {
  await setHostOnly(room.id, true);
} catch {
  unauthorizedHostOnlyBlocked = true;
}
check('Unauthorized guest attempting to toggle hostOnly mode is blocked', unauthorizedHostOnlyBlocked);

let unauthorizedKeyRegBlocked = false;
try {
  await registerHostPubKey(room.id, 'rogue-pubkey', room.hostEpoch);
} catch {
  unauthorizedKeyRegBlocked = true;
}
check('Unauthorized guest attempting to register host pubkey is blocked', unauthorizedKeyRegBlocked);

// 3. Forged Sender ID Playback Attack Rejection (Protocol v2: ECDSA)
console.log('\n3. Testing Anti-Spoofing: Forged payload.from Rejection (ECDSA)');
mockStorage.setItem('at_demo_uid', 'host-user-id');
await setHostOnly(room.id, true);
resetReplayCacheForTests();

const roomId = room.id;
const hostTransport = new LocalTransport(roomId);
const guestTransport = new LocalTransport(roomId);

let guestCommandExecuted = false;
const guestMockAdapter = {
  play: async () => { guestCommandExecuted = true; },
  pause: () => { guestCommandExecuted = true; },
  seek: () => { guestCommandExecuted = true; },
  getTime: () => 0,
  isPlaying: () => false,
  isReady: () => true
};

let hostOnlyActive = true;
const guestSync = new SyncService(guestTransport, {
  canControl: () => !hostOnlyActive,
  isAuthorized: async (_from, auth, payload) => {
    if (!hostOnlyActive) return true;
    // Protocol v2: Verify ECDSA signature against registered host public key
    return verifyPlaybackSignature(hostKey.publicKeyStr, payload as any, auth, {
      expectedRoomId: roomId,
      expectedHostId: 'host-user-id',
      expectedEpoch: 1
    });
  },
  isHost: () => false,
  getHostOnly: () => hostOnlyActive,
  onSource: () => {},
  onHostOnly: (v) => { hostOnlyActive = v; },
  onStatus: () => {}
});

guestSync.start();
guestSync.attach(guestMockAdapter);

hostTransport.join({ userId: 'host-user-id', nickname: 'HostUser', avatar: '🌸|#f4a6c0', joinedAt: 1000 });
guestTransport.join({ userId: 'rogue-guest-id', nickname: 'RogueGuest', avatar: '💀|#000000', joinedAt: 2000 });
await sleep(80);

// Attack Scenario:
// Rogue client sends a 'pb' message forging 'from' to match the host's clientId!
// BUT the rogue client does NOT have the host's ECDSA private key!
(guestTransport as any).send('pb', {
  from: hostTransport.clientId, // FORGED SENDER ID!
  op: 'play',
  time: 120,
  auth: { sig: 'bad-sig', nonce: 'bad-nonce', ts: Date.now() }
});
await sleep(60);

check('Spoofed host command without valid ECDSA signature is REJECTED', guestCommandExecuted === false);

// Legitimate Host Command with authentic ECDSA signature
const hostSync = new SyncService(hostTransport, {
  canControl: () => true,
  isAuthorized: () => true,
  isHost: () => true,
  getHostOnly: () => true,
  getRoomId: () => roomId,
  getHostId: () => 'host-user-id',
  getHostEpoch: () => 1,
  getHostSeq: () => 0,
  signPayload: async (payload) => signPlaybackPayload(hostKey.privateKey, {
    ...payload,
    roomId,
    hostId: 'host-user-id',
    epoch: 1
  } as any),
  onSource: () => {},
  onHostOnly: () => {},
  onStatus: () => {}
});
hostSync.start();

await hostSync.play();
await sleep(200);
check('Authentic host command with valid ECDSA signature is ACCEPTED', guestCommandExecuted === true);

// 4. Unauthorized Game Modifications
console.log('\n4. Testing Unauthorized Game Action Rejection');
mockStorage.setItem('at_demo_uid', 'host-user-id');
const gamesStore = createGamesStore();
const { game, board } = await gamesStore.createBingoGame(roomId, 'competitive', 'all', [], 'seed-1', 'host-user-id');

// Guest attempting to mark host's board
let tamperRejected = false;
try {
  await gamesStore.markBingoSquare(game.id, board.id, 3, 'rogue-guest-id');
} catch {
  tamperRejected = true;
}
check('Unauthorized guest tampering with another user\u2019s competitive board is rejected', tamperRejected);

// Clean up
hostTransport.leave();
guestTransport.leave();
hostSync.stop();
guestSync.stop();

console.log(failed ? `\n${failed} Security test(s) FAILED` : '\nAll Security & Anti-Spoofing tests PASSED!');
process.exit(failed ? 1 : 0);
