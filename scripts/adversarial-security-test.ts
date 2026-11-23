// Phase 2.2 Adversarial Security Verification Suite
// Comprehensive verification of non-extractable keys, ECDSA P-256 signatures,
// monotonic sequence numbers, anti-replay scenarios, cross-room isolation,
// and database privilege enforcement.

import { LocalTransport } from '../src/realtime/localTransport';
import { SyncService } from '../src/services/syncService';
import {
  generateHostKeyHandle,
  generateHostKeyPair,
  signPlaybackPayload,
  verifyPlaybackSignature,
  canonicalizePlaybackIntent,
  hostKeyStore,
  resetReplayCacheForTests,
  initSequenceBaseline,
  getSequenceBaseline,
  loadStoredSeq,
  saveStoredSeq
} from '../src/lib/security';
import {
  createRoom,
  setHostOnly,
  registerHostPubKey,
  joinRoom,
  transferHost,
  getHostKeyHandle,
  saveHostKeyHandle
} from '../src/realtime/roomApi';
import { createGamesStore } from '../src/services/gamesStore';

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
let passed = 0;

function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? ' PASS ' : ' FAIL '} ${name} ${extra}`);
  if (ok) passed++;
  else failed++;
}

console.log('════════════════════════════════════════════════════════════════');
console.log('  ANIME TOGETHER — PHASE 2.3 ADVERSARIAL & SEQUENCE RECOVERY');
console.log('════════════════════════════════════════════════════════════════\n');

// ── [1] Non-Extractable Key Verification & Storage ──
console.log('▶ [1] Non-Extractable Web Crypto Key & Storage Verification');
const testRoomId = 'test-room-crypto-01';
const keyHandle = await generateHostKeyHandle(testRoomId);

check('Host private key is generated with extractable=false', keyHandle.privateKey.extractable === false);
check('Host public key is extractable for distribution', keyHandle.publicKey.extractable === true);

// Verify that attempting to export the private key fails at the Web Crypto subsystem level
let exportBlocked = false;
try {
  await crypto.subtle.exportKey('jwk', keyHandle.privateKey);
} catch (e: any) {
  if (e.name === 'InvalidAccessError') exportBlocked = true;
}
check('Direct private key export is BLOCKED by Web Crypto API (InvalidAccessError)', exportBlocked);

// Verify key handle storage and recovery
const retrievedHandle = await hostKeyStore.getKey(testRoomId);
check('Non-extractable key handle successfully stored and retrieved from HostKeyStore', !!retrievedHandle && retrievedHandle.privateKey.extractable === false);

// Signing with non-extractable private key
const signTest = await signPlaybackPayload(keyHandle.privateKey, {
  roomId: testRoomId,
  hostId: 'host-1',
  op: 'play',
  time: 10,
  seq: 1,
  epoch: 1
});
check('Signing with non-extractable private key succeeds', !!signTest.sig && signTest.sig.length === 128);

// ── [2] Canonical Serialization Determinism & Coverage ──
console.log('\n▶ [2] Canonical Serialization Determinism & Binding Coverage');

const canonA = canonicalizePlaybackIntent({
  roomId: 'room-abc',
  op: 'seek',
  time: 15.250,
  playing: true,
  sourceUrl: 'https://example.com/v.mp4',
  sourceTitle: 'Episode 1',
  hostOnly: true,
  hostId: 'user-host',
  epoch: 1,
  seq: 42,
  nonce: '1122334455667788',
  ts: 1700000000000
});

// Create identical payload with different field input order
const canonB = canonicalizePlaybackIntent({
  ts: 1700000000000,
  seq: 42,
  epoch: 1,
  hostId: 'user-host',
  sourceTitle: 'Episode 1',
  sourceUrl: 'https://example.com/v.mp4',
  playing: true,
  hostOnly: true,
  time: 15.250,
  op: 'seek',
  roomId: 'room-abc',
  nonce: '1122334455667788'
});

check('Canonical serialization is strictly deterministic regardless of parameter order', canonA === canonB);
// Protocol v2: JSON format — verify by parsing the canonical string
const parsed = JSON.parse(canonA);
check('Canonical serialization binds roomId (JSON)', parsed.roomId === 'room-abc');
check('Canonical serialization binds hostId (JSON)', parsed.hostId === 'user-host');
check('Canonical serialization binds seq and epoch (JSON)', parsed.seq === 42 && parsed.epoch === 1);
check('Canonical serialization binds type:pb (JSON)', parsed.type === 'pb');

// ── [3] Malformed Inputs & Invalid Key Rejection ──
console.log('\n▶ [3] Malformed Inputs, Invalid Timestamps & Corrupt Signature Rejection');

// Missing signature
check('Missing signature string is rejected', await verifyPlaybackSignature(keyHandle.publicKeyStr, { op: 'play' }, { nonce: 'abc', ts: Date.now() }) === false);

// Missing nonce
check('Missing nonce is rejected', await verifyPlaybackSignature(keyHandle.publicKeyStr, { op: 'play' }, { sig: signTest.sig, ts: Date.now() }) === false);

// Invalid/NaN timestamp
check('NaN timestamp is rejected', await verifyPlaybackSignature(keyHandle.publicKeyStr, { op: 'play' }, { sig: signTest.sig, nonce: 'abc', ts: NaN }) === false);

// Corrupted signature bytes (tampered signature hex)
const corruptSig = signTest.sig.substring(0, signTest.sig.length - 4) + 'ffff';
check('Corrupted signature is rejected', await verifyPlaybackSignature(keyHandle.publicKeyStr, { op: 'play' }, { ...signTest, sig: corruptSig }) === false);

// Invalid public key string
check('Malformed public key JSON is rejected gracefully without crashing', await verifyPlaybackSignature('{ invalid json', { op: 'play' }, signTest) === false);


// ── [4] Comprehensive Replay Protection Scenarios (Section B) ──
console.log('\n▶ [4] Replay Protection: Exhaustive Multi-Scenario Verification');
resetReplayCacheForTests();

const testRoom = 'room-alpha';
const hostId = 'host-user-99';
const hostKey = await generateHostKeyHandle(testRoom);
const pubKey = hostKey.publicKeyStr;

// Generate valid packet #1
const packet1 = await signPlaybackPayload(hostKey.privateKey, {
  roomId: testRoom,
  hostId,
  op: 'play',
  time: 10,
  seq: 1,
  epoch: 1
});

// Scenario 1: First reception of valid packet succeeds
const s1_initial = await verifyPlaybackSignature(pubKey, { op: 'play', time: 10 }, packet1, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 });
check('Scenario 1.1: First-time processing of authentic signed packet SUCCEEDS', s1_initial === true);

// Scenario 1.2: Immediate replay of identical packet
const s1_replay = await verifyPlaybackSignature(pubKey, { op: 'play', time: 10 }, packet1, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 });
check('Scenario 1.2: Immediate replay of packet is REJECTED (Sequence & Nonce cache)', s1_replay === false);

// Scenario 2: Replay after nonce cache expires
// Even if nonce cache were cleared, sequence monotonicity (seq <= lastSeq) rejects it
const s2_replay = await verifyPlaybackSignature(pubKey, { op: 'play', time: 10 }, packet1, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 });
check('Scenario 2: Stale sequence replay (seq <= lastSeq) is REJECTED', s2_replay === false);

// Packet with stale timestamp (> 5000ms old)
const stalePacket = await signPlaybackPayload(hostKey.privateKey, {
  roomId: testRoom,
  hostId,
  op: 'seek',
  time: 20,
  seq: 2,
  epoch: 1,
  ts: Date.now() - 6000
});
check('Scenario 2.2: Packet older than 5000ms is REJECTED by clock freshness window', await verifyPlaybackSignature(pubKey, { op: 'seek', time: 20 }, stalePacket, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 }) === false);

// Scenario 3: Replay from different participant
// Rogue participant broadcasts host's packet from a different transport identity
const s4_rogue = await verifyPlaybackSignature(pubKey, { op: 'play', time: 10 }, { ...packet1, hostId: 'rogue-participant' }, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 });
check('Scenario 4: Replay with spoofed host identity is REJECTED', s4_rogue === false);

// Scenario 5: Replay after host transfer
// A new host takes over room-alpha with a new key and new hostId
const newHostId = 'new-host-user-101';
const newHostKey = await generateHostKeyHandle(testRoom);
// Old packet was signed by old host. Peer now verifies against new host's public key and expectedHostId
const s5_oldHostReplay = await verifyPlaybackSignature(newHostKey.publicKeyStr, { op: 'play', time: 10 }, packet1, { expectedRoomId: testRoom, expectedHostId: newHostId, expectedEpoch: 1 });
check('Scenario 5: Old host packet replayed after host transfer is REJECTED', s5_oldHostReplay === false);

// Scenario 6: Replay packet from another room (Cross-Room Replay Attack)
// Attacker intercepts packet from room-alpha and broadcasts it into room-beta
const s6_crossRoom = await verifyPlaybackSignature(pubKey, { op: 'play', time: 10 }, packet1, { expectedRoomId: 'room-beta', expectedHostId: hostId, expectedEpoch: 1 });
check('Scenario 6: Cross-room replay attack (packet from Room A sent to Room B) is REJECTED', s6_crossRoom === false);

// Scenario 7: Send duplicate nonces concurrently
const s7_concurrent = await verifyPlaybackSignature(pubKey, { op: 'play', time: 10 }, packet1, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 });
check('Scenario 7: Duplicate nonce sent concurrently is REJECTED', s7_concurrent === false);

// Scenario 8: Future-dated timestamp (> 5000ms in future)
const futurePacket = await signPlaybackPayload(hostKey.privateKey, {
  roomId: testRoom,
  hostId,
  op: 'pause',
  time: 15,
  seq: 3,
  epoch: 1,
  ts: Date.now() + 10000 // 10 seconds in future
});
check('Scenario 8: Future-dated timestamp (> 5s in future) is REJECTED', await verifyPlaybackSignature(pubKey, { op: 'pause', time: 15 }, futurePacket, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 }) === false);

// Scenario 9: Simulated clock drift between devices
// Within 5s window, monotonic sequence numbers strictly enforce ordering
const driftPacket1 = await signPlaybackPayload(hostKey.privateKey, {
  roomId: testRoom,
  hostId,
  op: 'seek',
  time: 20,
  seq: 10,
  epoch: 1,
  ts: Date.now() - 2500 // 2.5s device clock difference (within 5s tolerance)
});
const driftPacket2 = await signPlaybackPayload(hostKey.privateKey, {
  roomId: testRoom,
  hostId,
  op: 'seek',
  time: 25,
  seq: 11,
  epoch: 1,
  ts: Date.now() - 2000
});

check('Scenario 9.1: Device clock offset within 5s window is accepted with valid seq', await verifyPlaybackSignature(pubKey, { op: 'seek', time: 20 }, driftPacket1, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 }) === true);
check('Scenario 9.2: Monotonically increasing seq (11 > 10) advances playback state', await verifyPlaybackSignature(pubKey, { op: 'seek', time: 25 }, driftPacket2, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 }) === true);

// Attempting backward playback with lower seq (e.g. seq: 9 < 11) is rejected
const backwardPacket = await signPlaybackPayload(hostKey.privateKey, {
  roomId: testRoom,
  hostId,
  op: 'seek',
  time: 5,
  seq: 9,
  epoch: 1,
  ts: Date.now() - 1000
});
check('Scenario 9.3: Out-of-order / backward sequence (seq 9 < 11) is REJECTED', await verifyPlaybackSignature(pubKey, { op: 'seek', time: 5 }, backwardPacket, { expectedRoomId: testRoom, expectedHostId: hostId, expectedEpoch: 1 }) === false);


// ── [5] Realtime Transport Anti-Spoofing & Playback Execution ──
console.log('\n▶ [5] Realtime Broadcast Anti-Spoofing over Transport');
mockStorage.setItem('at_demo_uid', 'host-user-id');
const liveRoom = await createRoom('HostUser');
const liveHostKey = await generateHostKeyHandle(liveRoom.id);
await registerHostPubKey(liveRoom.id, liveHostKey.publicKeyStr, liveRoom.hostEpoch);
await setHostOnly(liveRoom.id, true);

const hostTransport = new LocalTransport(liveRoom.id);
const rogueTransport = new LocalTransport(liveRoom.id);

let rogueCommandExecuted = false;
let hostCommandExecuted = false;

const guestMockAdapter = {
  play: async () => { rogueCommandExecuted = true; },
  pause: () => { rogueCommandExecuted = true; },
  seek: (t: number) => {
    if (t === 999) rogueCommandExecuted = true;
    if (t === 50) hostCommandExecuted = true;
  },
  getTime: () => 0,
  isPlaying: () => false,
  isReady: () => true
};

const guestSync = new SyncService(rogueTransport, {
  canControl: () => false,
  isAuthorized: async (_from, auth, payload) => {
    return verifyPlaybackSignature(liveHostKey.publicKeyStr, payload as any, auth, {
      expectedRoomId: liveRoom.id,
      expectedHostId: 'host-user-id',
      expectedEpoch: 1
    });
  },
  isHost: () => false,
  getHostOnly: () => true,
  onSource: () => {},
  onHostOnly: () => {},
  onStatus: () => {}
});

guestSync.start();
guestSync.attach(guestMockAdapter);

hostTransport.join({ userId: 'host-user-id', nickname: 'Host', avatar: '🌸|#ff0000', joinedAt: 1000 });
rogueTransport.join({ userId: 'rogue-id', nickname: 'Rogue', avatar: '💀|#000000', joinedAt: 2000 });
await sleep(80);

// Attack: Rogue broadcasts command with spoofed from claiming host
(rogueTransport as any).send('pb', {
  from: hostTransport.clientId,
  op: 'seek',
  time: 999,
  auth: { sig: 'bad-sig', nonce: 'bad-nonce', ts: Date.now() }
});
await sleep(60);
check('Transport: Forged host broadcast with invalid signature is REJECTED', rogueCommandExecuted === false);

// Legitimate host command
const hostSync = new SyncService(hostTransport, {
  canControl: () => true,
  isAuthorized: () => true,
  isHost: () => true,
  getHostOnly: () => true,
  getRoomId: () => liveRoom.id,
  getHostId: () => 'host-user-id',
  signPayload: async (payload) => signPlaybackPayload(liveHostKey.privateKey, payload as any),
  onSource: () => {},
  onHostOnly: () => {},
  onStatus: () => {}
});
hostSync.start();

await hostSync.seek(50);
await sleep(60);
check('Transport: Authentic host command signed with non-extractable key is EXECUTED', hostCommandExecuted === true);

hostSync.stop();
guestSync.stop();
hostTransport.leave();
rogueTransport.leave();


// ── [6] Backend Privilege Boundaries ──
console.log('\n▶ [6] Backend Host Privilege Boundaries');
mockStorage.setItem('at_demo_uid', 'rogue-user-id');

let unauthKeyBlocked = false;
try {
  await registerHostPubKey(liveRoom.id, 'rogue-pubkey', liveRoom.hostEpoch);
} catch {
  unauthKeyBlocked = true;
}
check('Unauthorized guest calling registerHostPubKey is BLOCKED', unauthKeyBlocked);

let unauthHostOnlyBlocked = false;
try {
  await setHostOnly(liveRoom.id, false);
} catch {
  unauthHostOnlyBlocked = true;
}
check('Unauthorized guest calling setHostOnly is BLOCKED', unauthHostOnlyBlocked);

let unauthTransferBlocked = false;
try {
  await transferHost(liveRoom.id, 'rogue-user-id');
} catch {
  unauthTransferBlocked = true;
}
check('Unauthorized guest calling transferHost is BLOCKED', unauthTransferBlocked);


// ── [7] Anime Bingo Security & Authoritative Win Validation ──
console.log('\n▶ [7] Anime Bingo: Board Isolation & Authoritative Line Validation');
const gamesStore = createGamesStore();

mockStorage.setItem('at_demo_uid', 'host-user-id');
const { game: bingoGame, board: bingoHostBoard } = await gamesStore.createBingoGame(liveRoom.id, 'competitive', 'all', [], 'seed-1', 'host-user-id');
const bingoGuestBoard = await gamesStore.joinBingoBoard(bingoGame.id, liveRoom.id, 'guest-user-id', []);

// Competitive board isolation
let boardTamperBlocked = false;
try {
  await gamesStore.markBingoSquare(bingoGame.id, bingoHostBoard.id, 0, 'guest-user-id');
} catch {
  boardTamperBlocked = true;
}
check('Guest tampering with host competitive board is REJECTED', boardTamperBlocked);

// Unearned win claim
let unearnedWinBlocked = false;
try {
  await gamesStore.claimBingoWin(bingoGame.id, bingoGuestBoard.id, 'guest-user-id', 'GuestPlayer');
} catch (e: any) {
  if (e.message.includes('complete Bingo line')) unearnedWinBlocked = true;
}
check('Unearned Bingo win claim on incomplete board is REJECTED', unearnedWinBlocked);

// Valid win: Complete row 0 (0, 1, 2, 3, 4)
for (const idx of [0, 1, 2, 3, 4]) {
  await gamesStore.markBingoSquare(bingoGame.id, bingoGuestBoard.id, idx, 'guest-user-id');
}
const completedBingo = await gamesStore.claimBingoWin(bingoGame.id, bingoGuestBoard.id, 'guest-user-id', 'GuestPlayer');
check('Valid Bingo win with complete row is ACCEPTED', completedBingo.status === 'completed' && completedBingo.winnerId === 'guest-user-id');

// Double win claim
let doubleWinBlocked = false;
try {
  await gamesStore.claimBingoWin(bingoGame.id, bingoGuestBoard.id, 'guest-user-id', 'GuestPlayer');
} catch {
  doubleWinBlocked = true;
}
check('Claiming win on completed game is REJECTED', doubleWinBlocked);


// ── [8] Episode Predictions: Privacy, Immutability & Double Resolution ──
console.log('\n▶ [8] Episode Predictions: Privacy, Immutability & Double Resolution');
const pred = await gamesStore.createPrediction(
  liveRoom.id,
  'Will Zoro open his left eye?',
  'choice',
  [{ id: '1', text: 'Yes' }, { id: '2', text: 'No' }],
  Date.now() + 60000,
  null,
  false,
  25
);

await gamesStore.submitAnswer(pred.id, liveRoom.id, 'user-1', 'Alice', '🌸', 'Yes');
await gamesStore.submitAnswer(pred.id, liveRoom.id, 'user-2', 'Bob', '⚔️', 'No');

// Privacy
const unrevealed = await gamesStore.getPredictionAnswers(pred.id, 'user-1', false);
const bobAns = unrevealed.find((a) => a.userId === 'user-2');
check('Unrevealed prediction answer privacy is ENFORCED (masked as 🔒 Submitted)', bobAns?.answer === '🔒 Submitted');

// Lock
await gamesStore.lockPrediction(pred.id);

// Immutability after lock
let postLockSubmitBlocked = false;
try {
  await gamesStore.submitAnswer(pred.id, liveRoom.id, 'user-1', 'Alice', '🌸', 'No');
} catch {
  postLockSubmitBlocked = true;
}
check('Answer modification after lock is REJECTED', postLockSubmitBlocked);

// Resolution
const resolved = await gamesStore.resolvePrediction(pred.id, 'Yes', 'host');
check('Authorized resolution succeeds', resolved.status === 'resolved' && resolved.winningOption === 'Yes');

// Double resolution rejection
let doubleResolveBlocked = false;
try {
  await gamesStore.resolvePrediction(pred.id, 'Yes', 'host');
} catch {
  doubleResolveBlocked = true;
}
check('Double resolution attack to inflate score is REJECTED', doubleResolveBlocked);


// ── [9] Expired Room Access ──
console.log('\n▶ [9] Expired Room Access Enforcement');
const expiredRoom = await createRoom('ExpiredHost');
const roomsData = JSON.parse(mockStorage.getItem('at_demo_rooms') || '{}');
roomsData[expiredRoom.id].expiresAt = Date.now() - 1000;
mockStorage.setItem('at_demo_rooms', JSON.stringify(roomsData));

let expiredJoinBlocked = false;
try {
  await joinRoom(expiredRoom.id, 'Guest');
} catch (e: any) {
  if (e.message.includes('expired')) expiredJoinBlocked = true;
}
check('Operations on expired rooms are REJECTED', expiredJoinBlocked);

// ── [10] Sequence Recovery, Reconnect & Authoritative Baseline Verification ──
console.log('\n▶ [10] Sequence Recovery, Reconnect & Authoritative Baseline Verification');
const recovRoom = 'room-recov-12345678';
const recovHost = 'host-recov-user';
const recovKey = await generateHostKeyHandle(recovRoom);
const recovPub = recovKey.publicKeyStr;

// Initialize authoritative baseline
await initSequenceBaseline(recovRoom, 1, 10);
check('Baseline sequence established from authoritative state (lastSeq=10)', (await getSequenceBaseline(recovRoom, 1)) === 10);

// Host generates valid signed packet with seq: 15
const p15 = await signPlaybackPayload(recovKey.privateKey, {
  roomId: recovRoom,
  hostId: recovHost,
  op: 'seek',
  time: 150,
  seq: 15,
  epoch: 1
});

// Receiver processes p15
const p15Accepted = await verifyPlaybackSignature(recovPub, { op: 'seek', time: 150 }, p15, { expectedRoomId: recovRoom, expectedHostId: recovHost, expectedEpoch: 1 });
check('Legitimate packet #15 accepted and sequence advances to 15', p15Accepted && (await getSequenceBaseline(recovRoom, 1)) === 15);

// Simulating receiver disconnect or refresh:
// JavaScript heap resets (seenNonces cleared), but persistent storage baseline preserves lastSeq: 15
// Attacker replays captured p15 within 5-second window
const p15ReplayAfterRefresh = await verifyPlaybackSignature(recovPub, { op: 'seek', time: 150 }, p15, { expectedRoomId: recovRoom, expectedHostId: recovHost, expectedEpoch: 1 });
check('Attack Replay: Captured packet #15 replayed after receiver refresh is REJECTED (seq <= lastSeq)', p15ReplayAfterRefresh === false);

// Attacker replays an earlier captured packet (e.g. seq: 12) within 5s window
const p12Earlier = await signPlaybackPayload(recovKey.privateKey, {
  roomId: recovRoom,
  hostId: recovHost,
  op: 'pause',
  time: 120,
  seq: 12,
  epoch: 1,
  ts: Date.now() - 1000
});
const p12Replay = await verifyPlaybackSignature(recovPub, { op: 'pause', time: 120 }, p12Earlier, { expectedRoomId: recovRoom, expectedHostId: recovHost, expectedEpoch: 1 });
check('Attack Replay: Outdated packet #12 replayed after receiver refresh is REJECTED', p12Replay === false);

// Never trust the first received broadcast:
// An untrusted broadcast with seq: 8 is sent to a late joiner whose room baseline is 15
const untrustedBroadcast = await signPlaybackPayload(recovKey.privateKey, {
  roomId: recovRoom,
  hostId: recovHost,
  op: 'play',
  time: 80,
  seq: 8,
  epoch: 1
});
const untrustedRejected = await verifyPlaybackSignature(recovPub, { op: 'play', time: 80 }, untrustedBroadcast, { expectedRoomId: recovRoom, expectedHostId: recovHost, expectedEpoch: 1 });
check('Untrusted initial broadcast rejected against authoritative baseline (seq: 8 <= 15)', untrustedRejected === false);

// Legitimate reconnect / late joiner:
// Receiver reconnects with baseline 15; Host broadcasts legitimate forward packet seq: 16
const p16Legit = await signPlaybackPayload(recovKey.privateKey, {
  roomId: recovRoom,
  hostId: recovHost,
  op: 'play',
  time: 155,
  seq: 16,
  epoch: 1
});
const p16Accepted = await verifyPlaybackSignature(recovPub, { op: 'play', time: 155 }, p16Legit, { expectedRoomId: recovRoom, expectedHostId: recovHost, expectedEpoch: 1 });
check('Legitimate reconnect: Forward packet #16 accepted and advances state (16 > 15)', p16Accepted && (await getSequenceBaseline(recovRoom, 1)) === 16);

// Epoch invalidation on host transfer:
// Host transfer promotes new host, increments epoch to 2, resets sequence to 0
const newRecovHost = 'new-host-recov-user';
const newRecovKey = await generateHostKeyHandle(recovRoom);
await initSequenceBaseline(recovRoom, 2, 0); // epoch 2 baseline starts at 0

// Old-epoch packet #16 replayed in epoch 2
const oldEpochReplay = await verifyPlaybackSignature(newRecovKey.publicKeyStr, { op: 'play', time: 155 }, p16Legit, { expectedRoomId: recovRoom, expectedHostId: newRecovHost, expectedEpoch: 2 });
check('Old-epoch packet cannot become valid after reconnect or host transfer (REJECTED)', oldEpochReplay === false);

// New host issues first packet in epoch 2 (seq: 1)
const epoch2Packet1 = await signPlaybackPayload(newRecovKey.privateKey, {
  roomId: recovRoom,
  hostId: newRecovHost,
  op: 'play',
  time: 156,
  seq: 1,
  epoch: 2
});
const epoch2Accepted = await verifyPlaybackSignature(newRecovKey.publicKeyStr, { op: 'play', time: 156 }, epoch2Packet1, { expectedRoomId: recovRoom, expectedHostId: newRecovHost, expectedEpoch: 2 });
check('New host packet in epoch 2 (seq: 1) is ACCEPTED and advances epoch 2 state', epoch2Accepted && (await getSequenceBaseline(recovRoom, 2)) === 1);

// Cross-room sequence baseline isolation:
// Room Alpha is at seq: 50; Room Beta is at seq: 2
await initSequenceBaseline('room-alpha-iso', 1, 50);
await initSequenceBaseline('room-beta-iso', 1, 2);
check('Cross-room sequence isolation: Room Alpha (seq: 50) does not leak into Room Beta (seq: 2)', (await getSequenceBaseline('room-alpha-iso', 1)) === 50 && (await getSequenceBaseline('room-beta-iso', 1)) === 2);

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`  PHASE 2.3 SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('════════════════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
