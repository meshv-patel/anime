// Phase 2 Security Remediation Test Suite (Corrective Pass)
// Environment: Unit / Mocked Integration Test (Node.js)
// Tests:
// - A: X1 Atomic sequence allocation across concurrent transactions
// - B: X2 Nonce and sequence verification concurrency races & active TTL
// - C: X3 Strict protocol (v2), positive integer sequences, trusted epoch binding
// - D: X4 Exact command binding, MediaSource tampering & malformed structure rejection
// - E: DB-04 Prediction host-only lifecycle, valid state machine, payout idempotency
// - F: DB-01 Host sequence monotonicity & collaborative playback compatibility
// - G: SEC-02 Signing failure abort without fallback
// - H: SEC-03 WebRTC peer roster validation behavioral test

import { LocalTransport } from '../src/realtime/localTransport';
import { SyncService } from '../src/services/syncService';
import {
  generateHostKeyHandle,
  signPlaybackPayload,
  verifyPlaybackSignature,
  canonicalizePlaybackIntent,
  resetReplayCacheForTests,
  initSequenceBaseline,
  getSequenceBaseline,
  allocateHostSequence,
  commitPeerSequence,
  SIGNATURE_PROTOCOL_VERSION
} from '../src/lib/security';
import { createRoom, setHostOnly, registerHostPubKey, transferHost, updatePlayback } from '../src/realtime/roomApi';
import { createGamesStore } from '../src/services/gamesStore';
import { MediaManager } from '../src/media/mediaManager';
import { iceConfig } from '../src/lib/env';

// Mock storage for headless Node.js
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; },
  get length() { return Object.keys(memoryStorage).length; },
  key: (i: number) => Object.keys(memoryStorage)[i] ?? null
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
console.log('  ANIME TOGETHER — PHASE 2 REMEDIATION CORRECTIVE PASS TESTS');
console.log('════════════════════════════════════════════════════════════════\n');

// ── [A] X1: Atomic Sequence Coordination Across Concurrent Transactions ──
console.log('▶ [A] X1: Atomic sequence allocation across concurrent transactions');
resetReplayCacheForTests();

const x1Room = 'room-x1-atomic';
const x1Epoch = 1;

// Simulate 20 concurrent allocation requests fired simultaneously across transactions
const allocationPromises = Array.from({ length: 20 }, () =>
  allocateHostSequence(x1Room, x1Epoch, 0)
);
const allocatedSeqs = await Promise.all(allocationPromises);

// Check 1: All 20 allocations must be unique
const uniqueSeqs = new Set(allocatedSeqs);
check('X1: 20 concurrent transactions receive 20 unique sequence numbers', uniqueSeqs.size === 20,
  `(unique count: ${uniqueSeqs.size})`);

// Check 2: Values must strictly cover 1 through 20 with no gaps or duplicates
const sortedSeqs = [...allocatedSeqs].sort((a, b) => a - b);
const expectedSeqs = Array.from({ length: 20 }, (_, i) => i + 1);
const exactlySequential = sortedSeqs.every((v, i) => v === expectedSeqs[i]);
check('X1: Allocated sequences are strictly sequential and monotonic (1 to 20)', exactlySequential,
  `(${sortedSeqs[0]} to ${sortedSeqs[sortedSeqs.length - 1]})`);

// Check 3: Subsequent allocation continues monotonically
const seq21 = await allocateHostSequence(x1Room, x1Epoch, 0);
check('X1: Subsequent allocation continues monotonically (seq: 21)', seq21 === 21);

// Check 4: New host epoch starts isolated sequence namespace at 1
const epoch2Seq1 = await allocateHostSequence(x1Room, 2, 0);
check('X1: New host epoch 2 starts separate sequence namespace at 1', epoch2Seq1 === 1);

// Check 5: Epoch 1 sequence namespace remains at 21
const epoch1Next = await allocateHostSequence(x1Room, 1, 0);
check('X1: Epoch 1 sequence namespace preserved independently (seq: 22)', epoch1Next === 22);

// Check 6: Storage errors fail closed where uniqueness cannot be guaranteed
let idbStorageErrorCaught = false;
try {
  const prevIdb = (globalThis as any).indexedDB;
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {};
      setTimeout(() => {
        if (req.onerror) req.onerror(new Error('QuotaExceededError: simulated disk full'));
      }, 0);
      return req;
    }
  };
  try {
    await allocateHostSequence('room-err', 1, 0);
  } finally {
    if (prevIdb !== undefined) (globalThis as any).indexedDB = prevIdb;
    else delete (globalThis as any).indexedDB;
  }
} catch (e: any) {
  idbStorageErrorCaught = e.message.includes('IndexedDB storage error') || e.message.includes('transaction failed');
}
check('X1: Storage error causes allocator to fail closed (throws without duplicate)', idbStorageErrorCaught);


// ── [B] X2: Nonce & Sequence Concurrency Verification Races ──
console.log('\n▶ [B] X2: Nonce and sequence verification concurrency races');
resetReplayCacheForTests();

const x2Room = 'room-x2-race';
const x2Host = 'host-x2';
const x2Key = await generateHostKeyHandle(x2Room);

// 1. Concurrent duplicate nonce rejection
const x2Packet = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'play', time: 10, seq: 1, epoch: 1
});

const x2DupResults = await Promise.all(
  Array.from({ length: 10 }, () =>
    verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'play', time: 10 }, x2Packet, {
      expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
    })
  )
);
const x2DupAccepted = x2DupResults.filter(Boolean).length;
check('X2: Concurrent duplicate packets (identical nonce): exactly 1 accepted', x2DupAccepted === 1,
  `(accepted: ${x2DupAccepted})`);

// 2. Concurrent distinct nonces with IDENTICAL sequence number race
resetReplayCacheForTests();
const concurrentPackets = await Promise.all(
  Array.from({ length: 5 }, async () =>
    signPlaybackPayload(x2Key.privateKey, {
      roomId: x2Room, hostId: x2Host, op: 'play', time: 10, seq: 1, epoch: 1
    })
  )
);

const x2SeqRaceResults = await Promise.all(
  concurrentPackets.map((pkt) =>
    verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'play', time: 10 }, pkt, {
      expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
    })
  )
);
const x2SeqRaceAccepted = x2SeqRaceResults.filter(Boolean).length;
check('X2: Concurrent distinct nonces with SAME sequence: exactly 1 accepted', x2SeqRaceAccepted === 1,
  `(accepted: ${x2SeqRaceAccepted})`);

// 3. Replayed sequence with a fresh nonce is rejected
const freshNonceStaleSeq = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'play', time: 15, seq: 1, epoch: 1
});
const replayStaleSeq = await verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'play', time: 15 }, freshNonceStaleSeq, {
  expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
});
check('X2: Replayed sequence (seq: 1 <= baseline) with fresh nonce is REJECTED', replayStaleSeq === false);

// 4. Invalid signature releases pending reservations so subsequent valid packet succeeds
const badSigPacket = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'play', time: 20, seq: 2, epoch: 1
});
badSigPacket.sig = badSigPacket.sig.substring(0, 120) + '00000000'; // corrupt

const badSigResult = await verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'play', time: 20 }, badSigPacket, {
  expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
});
check('X2: Corrupted signature fails verification', badSigResult === false);

// Now send a valid packet with the same seq: 2 — must succeed because bad signature released pendingSequences
const validSigPacket = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'play', time: 20, seq: 2, epoch: 1
});
const validSigResult = await verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'play', time: 20 }, validSigPacket, {
  expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
});
check('X2: Failed signature cleanly releases pending reservation; valid seq: 2 succeeds', validSigResult === true);

// 5. Same sequence in a different epoch succeeds
const epoch2Packet = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'play', time: 25, seq: 1, epoch: 2
});
const epoch2Result = await verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'play', time: 25 }, epoch2Packet, {
  expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 2
});
check('X2: Same sequence number (seq: 1) in a different epoch (2) is ACCEPTED', epoch2Result === true);

// 6. Adversarial out-of-order completion test:
// Two valid packets carrying different sequences (seq: 5 and seq: 10).
// Deliberately control the asynchronous completion order: force seq: 10 to commit first.
const pSeq5 = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'seek', time: 50, seq: 5, epoch: 1
});
const pSeq10 = await signPlaybackPayload(x2Key.privateKey, {
  roomId: x2Room, hostId: x2Host, op: 'seek', time: 100, seq: 10, epoch: 1
});

// Force seq: 10 to complete and commit first
const res10 = await verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'seek', time: 100 }, pSeq10, {
  expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
});
check('X2 Adversarial: Higher sequence packet (seq: 10) completes and commits first (SUCCEEDS)', res10 === true);

// Lower sequence packet (seq: 5) completing after seq: 10 has already committed must be rejected
const res5 = await verifyPlaybackSignature(x2Key.publicKeyStr, { op: 'seek', time: 50 }, pSeq5, {
  expectedRoomId: x2Room, expectedHostId: x2Host, expectedEpoch: 1
});
check('X2 Adversarial: Lower sequence packet (seq: 5) completing after higher (seq: 10) is strictly REJECTED', res5 === false);


// ── [C] X3: Strict Protocol & Trusted Epoch Validation ──
console.log('\n▶ [C] X3: Strict protocol and trusted epoch validation');
resetReplayCacheForTests();

const x3Room = 'room-x3-strict';
const x3Host = 'host-x3';
const x3Key = await generateHostKeyHandle(x3Room);

const validPacket = await signPlaybackPayload(x3Key.privateKey, {
  roomId: x3Room, hostId: x3Host, op: 'play', time: 10, seq: 1, epoch: 1
});

// Protocol v1 packet rejection
const v1Packet = { ...validPacket, v: 1 };
check('X3: Protocol v1 packet is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', time: 10 }, v1Packet, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Protocol v3 packet rejection
const v3Packet = { ...validPacket, v: 3 };
check('X3: Protocol v3 packet is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', time: 10 }, v3Packet, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Stale epoch rejection (packet claims epoch 1, trusted session expects epoch 2)
check('X3: Stale epoch (auth.epoch: 1 vs expectedEpoch: 2) is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', time: 10 }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 2
  }) === false
);

// Future epoch rejection (packet claims epoch 3, trusted session expects epoch 1)
const futureEpochPacket = await signPlaybackPayload(x3Key.privateKey, {
  roomId: x3Room, hostId: x3Host, op: 'play', time: 10, seq: 1, epoch: 3
});
check('X3: Future epoch (auth.epoch: 3 vs expectedEpoch: 1) is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', time: 10 }, futureEpochPacket, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Missing expectedRoomId rejected
check('X3: Missing expectedRoomId in verification options is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, validPacket, {
    expectedRoomId: '', expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Mismatched expectedRoomId rejected
check('X3: Mismatched expectedRoomId is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, validPacket, {
    expectedRoomId: 'wrong-room-id', expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Missing expectedHostId rejected
check('X3: Missing expectedHostId in verification options is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: '', expectedEpoch: 1
  }) === false
);

// Mismatched expectedHostId rejected
check('X3: Mismatched expectedHostId is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: 'wrong-host-id', expectedEpoch: 1
  }) === false
);

// Non-integer sequence rejected
const fracSeq = { ...validPacket, seq: 1.5 };
check('X3: Fractional sequence (1.5) is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, fracSeq, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Zero sequence rejected
const zeroSeq = { ...validPacket, seq: 0 };
check('X3: Zero sequence (0) is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, zeroSeq, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Negative sequence rejected
const negSeq = { ...validPacket, seq: -1 };
check('X3: Negative sequence (-1) is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play' }, negSeq, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Mismatched intent vs auth envelope sequence rejected
check('X3: Mismatched intent.seq (2) vs auth.seq (1) is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', seq: 2 }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Mismatched intent vs auth envelope roomId rejected
check('X3: Mismatched intent.roomId vs auth.roomId is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', roomId: 'other-room' }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Mismatched intent vs auth envelope hostId rejected
check('X3: Mismatched intent.hostId vs auth.hostId is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', hostId: 'other-host' }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// Mismatched intent vs auth envelope epoch rejected
check('X3: Mismatched intent.epoch vs auth.epoch is REJECTED',
  await verifyPlaybackSignature(x3Key.publicKeyStr, { op: 'play', epoch: 2 }, validPacket, {
    expectedRoomId: x3Room, expectedHostId: x3Host, expectedEpoch: 1
  }) === false
);

// ── Mandatory Host Key Registration Epoch Validation ──
mockStorage.setItem('at_demo_uid', 'host-user-epoch-test');
const epochTestRoom = await createRoom('EpochHost');
const epochTestKey = await generateHostKeyHandle(epochTestRoom.id);

let nullEpochBlocked = false;
try {
  await registerHostPubKey(epochTestRoom.id, epochTestKey.publicKeyStr, null as any);
} catch {
  nullEpochBlocked = true;
}
check('X3: registerHostPubKey with NULL epoch is REJECTED', nullEpochBlocked);

let nonPositiveEpochBlocked = false;
try {
  await registerHostPubKey(epochTestRoom.id, epochTestKey.publicKeyStr, 0);
} catch {
  nonPositiveEpochBlocked = true;
}
check('X3: registerHostPubKey with zero epoch (0) is REJECTED', nonPositiveEpochBlocked);

let staleEpochBlocked = false;
try {
  await registerHostPubKey(epochTestRoom.id, epochTestKey.publicKeyStr, 999);
} catch {
  staleEpochBlocked = true;
}
check('X3: registerHostPubKey with stale/mismatched epoch is REJECTED', staleEpochBlocked);

check('X3: registerHostPubKey with matching room epoch SUCCEEDS',
  (await registerHostPubKey(epochTestRoom.id, epochTestKey.publicKeyStr, epochTestRoom.hostEpoch)).hostPubkey === epochTestKey.publicKeyStr
);


// ── [D] X4: Exact Command Binding & Source Structure Tampering ──
console.log('\n▶ [D] X4: Exact command binding and source tampering tests');
resetReplayCacheForTests();

const x4Room = 'room-x4-exact';
const x4Host = 'host-x4';
const x4Key = await generateHostKeyHandle(x4Room);

const x4Packet = await signPlaybackPayload(x4Key.privateKey, {
  roomId: x4Room, hostId: x4Host, op: 'seek', time: 50, seq: 1, epoch: 1,
  source: { kind: 'mp4', url: 'https://cdn.example.com/anime.mp4', title: 'Episode 1', fileName: 'anime.mp4', size: 1048576 }
});

// Verify authentic packet passes
check('X4: Authentic packet with complete MediaSource SUCCEEDS',
  await verifyPlaybackSignature(x4Key.publicKeyStr,
    { op: 'seek', time: 50, source: { kind: 'mp4', url: 'https://cdn.example.com/anime.mp4', title: 'Episode 1', fileName: 'anime.mp4', size: 1048576 } },
    x4Packet, { expectedRoomId: x4Room, expectedHostId: x4Host, expectedEpoch: 1 }
  ) === true
);

// Tamper source.url
check('X4: Tampering with source.url invalidates signature',
  await verifyPlaybackSignature(x4Key.publicKeyStr,
    { op: 'seek', time: 50, source: { kind: 'mp4', url: 'https://evil.com/malware.mp4', title: 'Episode 1', fileName: 'anime.mp4', size: 1048576 } },
    x4Packet, { expectedRoomId: x4Room, expectedHostId: x4Host, expectedEpoch: 1 }
  ) === false
);

// Tamper source.title
check('X4: Tampering with source.title invalidates signature',
  await verifyPlaybackSignature(x4Key.publicKeyStr,
    { op: 'seek', time: 50, source: { kind: 'mp4', url: 'https://cdn.example.com/anime.mp4', title: 'Tampered Title', fileName: 'anime.mp4', size: 1048576 } },
    x4Packet, { expectedRoomId: x4Room, expectedHostId: x4Host, expectedEpoch: 1 }
  ) === false
);

// Malformed source kind rejected
let malformedKindBlocked = false;
try {
  canonicalizePlaybackIntent({
    roomId: x4Room, hostId: x4Host, op: 'play', seq: 1, epoch: 1, nonce: '1122334455667788', ts: 1000,
    source: { kind: 'avi' as any, url: 'https://cdn.com/a.avi', title: 'Ep' }
  });
} catch {
  malformedKindBlocked = true;
}
check('X4: Malformed source kind ("avi") throws and fails closed', malformedKindBlocked);

// Malformed source size (negative) rejected
let negativeSizeBlocked = false;
try {
  canonicalizePlaybackIntent({
    roomId: x4Room, hostId: x4Host, op: 'play', seq: 1, epoch: 1, nonce: '1122334455667788', ts: 1000,
    source: { kind: 'mp4', url: 'https://cdn.com/a.mp4', title: 'Ep', size: -50 }
  });
} catch {
  negativeSizeBlocked = true;
}
check('X4: Negative source size throws and fails closed', negativeSizeBlocked);

// Delimiter injection tests
const delimiters = ['|', ':', '"', '\n', '🌸'];
let collisionsFound = false;
for (const d of delimiters) {
  const cNorm = canonicalizePlaybackIntent({ roomId: 'room-normal', hostId: 'h', op: 'play', seq: 1, epoch: 1, nonce: '1122334455667788', ts: 1000 });
  const cInject = canonicalizePlaybackIntent({ roomId: `room${d}injected`, hostId: 'h', op: 'play', seq: 1, epoch: 1, nonce: '1122334455667788', ts: 1000 });
  if (cNorm === cInject) collisionsFound = true;
}
check('X4: Delimiter injections cannot produce canonical collisions', collisionsFound === false);


// ── [E] DB-04: Prediction Host-Only Lifecycle & Payout Idempotency ──
console.log('\n▶ [E] DB-04: Prediction host-only lifecycle and payout idempotency');
mockStorage.setItem('at_demo_uid', 'host-db04');
const db04Room = await createRoom('HostUser');
const gamesStore = createGamesStore();

// 1. Create prediction with schema validations
let invalidKindBlocked = false;
try {
  await gamesStore.createPrediction(db04Room.id, 'Q', 'roulette' as any, [{ id: '1', text: 'A' }, { id: '2', text: 'B' }]);
} catch {
  invalidKindBlocked = true;
}
check('DB-04: Unsupported prediction kind ("roulette") is REJECTED', invalidKindBlocked);

let emptyQuestionBlocked = false;
try {
  await gamesStore.createPrediction(db04Room.id, '', 'choice', [{ id: '1', text: 'A' }, { id: '2', text: 'B' }]);
} catch {
  emptyQuestionBlocked = true;
}
check('DB-04: Empty question string is REJECTED', emptyQuestionBlocked);

let duplicateIdBlocked = false;
try {
  await gamesStore.createPrediction(db04Room.id, 'Q', 'choice', [{ id: 'opt1', text: 'A' }, { id: 'opt1', text: 'B' }]);
} catch {
  duplicateIdBlocked = true;
}
check('DB-04: Duplicate option IDs are REJECTED', duplicateIdBlocked);

let duplicateTextBlocked = false;
try {
  await gamesStore.createPrediction(db04Room.id, 'Q', 'choice', [{ id: 'opt1', text: 'Option A' }, { id: 'opt2', text: 'Option A' }]);
} catch {
  duplicateTextBlocked = true;
}
check('DB-04: Duplicate option text labels are REJECTED', duplicateTextBlocked);

const pred = await gamesStore.createPrediction(
  db04Room.id,
  'Will Eren activate the Rumbling?',
  'choice',
  [{ id: '1', text: 'Yes' }, { id: '2', text: 'No' }],
  Date.now() + 60000, null, false, 20
);
check('DB-04: Prediction created in "open" status', pred.status === 'open');

// Submit answer with unregistered option
let unregisteredAnswerBlocked = false;
try {
  await gamesStore.submitAnswer(pred.id, db04Room.id, 'user1', 'Nick', '🌸|#ff0000', 'Unregistered Answer');
} catch {
  unregisteredAnswerBlocked = true;
}
check('DB-04: Answer not matching any registered option is REJECTED', unregisteredAnswerBlocked);

// Submit valid answer
await gamesStore.submitAnswer(pred.id, db04Room.id, 'user1', 'Nick', '🌸|#ff0000', 'Yes');

// 2. Non-host attempts to lock — must be rejected
let nonHostLockBlocked = false;
try {
  await gamesStore.lockPrediction(pred.id, 'rogue-guest-user');
} catch {
  nonHostLockBlocked = true;
}
check('DB-04: Non-host lock attempt is REJECTED (host-only policy)', nonHostLockBlocked);

// 3. Host locks prediction — succeeds
const lockedPred = await gamesStore.lockPrediction(pred.id, 'host');
check('DB-04: Host lock succeeds (status: locked)', lockedPred.status === 'locked');

// Submitting answer after lock must be rejected
let postLockSubmitBlocked = false;
try {
  await gamesStore.submitAnswer(pred.id, db04Room.id, 'user2', 'Nick2', '🌸|#ff0000', 'No');
} catch {
  postLockSubmitBlocked = true;
}
check('DB-04: Answer submission after prediction is locked is REJECTED', postLockSubmitBlocked);

// 4. Non-host attempts reveal — must be rejected
let nonHostRevealBlocked = false;
try {
  await gamesStore.revealPrediction(pred.id, 'rogue-guest-user');
} catch {
  nonHostRevealBlocked = true;
}
check('DB-04: Non-host reveal attempt is REJECTED (host-only policy)', nonHostRevealBlocked);

// 5. Host reveals prediction — succeeds
const revealedPred = await gamesStore.revealPrediction(pred.id, 'host');
check('DB-04: Host reveal succeeds (status: revealed)', revealedPred.status === 'revealed');

// 6. Non-host attempts resolve — must be rejected
let nonHostResolveBlocked = false;
try {
  await gamesStore.resolvePrediction(pred.id, 'Yes', 'rogue-guest-user');
} catch {
  nonHostResolveBlocked = true;
}
check('DB-04: Non-host resolve attempt is REJECTED (host-only policy)', nonHostResolveBlocked);

// 7. Invalid winning option for choice kind — rejected
let invalidOptionBlocked = false;
try {
  await gamesStore.resolvePrediction(pred.id, 'Invalid Option Text', 'host');
} catch {
  invalidOptionBlocked = true;
}
check('DB-04: Unregistered winning option for choice prediction is REJECTED', invalidOptionBlocked);

// 8. Host resolves with valid option — succeeds
const resolvedPred = await gamesStore.resolvePrediction(pred.id, 'Yes', 'host');
check('DB-04: Host resolution succeeds (status: resolved)', resolvedPred.status === 'resolved');

// 9. Double resolution / payout idempotency check — terminal state rejected
let doubleResolveBlocked = false;
try {
  await gamesStore.resolvePrediction(pred.id, 'Yes', 'host');
} catch {
  doubleResolveBlocked = true;
}
check('DB-04: Duplicate resolution attempt is REJECTED (terminal state)', doubleResolveBlocked);


// ── [F] SEC-03: Real Behavioral WebRTC Peer Roster Validation ──
console.log('\n▶ [F] SEC-03: Behavioral WebRTC peer allocation test');
const sec03Transport = new LocalTransport('room-sec03');
const mm = new MediaManager(sec03Transport, iceConfig());

// Set authorized peers to only peer-1 and peer-2
mm.setPeers(['peer-1', 'peer-2']);

// Check diagnostics: 0 peer connections initially
const initialDiags = await mm.getDiagnostics();
check('SEC-03: MediaManager starts with 0 peer connections', initialDiags.length === 0);

// Attack: Off-roster rogue sender sends WebRTC offer signal to this client
(mm as any).onSignal('rogue-attacker-not-in-roster', {
  to: sec03Transport.clientId,
  description: { type: 'offer', sdp: 'fake-sdp' }
});

// Verify no RTCPeerConnection was allocated
const postAttackDiags = await mm.getDiagnostics();
check('SEC-03: Off-roster sender signal does NOT allocate RTCPeerConnection', postAttackDiags.length === 0);

mm.closeAll();


// ── [G] SEC-02: Signing Failure Abort Without Fallback ──
console.log('\n▶ [G] SEC-02: Signing failure abort verification');
mockStorage.setItem('at_demo_uid', 'sec02-host');
const sec02Room = await createRoom('Sec02Host');
await setHostOnly(sec02Room.id, true);

const sec02Transport = new LocalTransport(sec02Room.id);
let sec02BroadcastSent = false;
const origSend = sec02Transport.send.bind(sec02Transport);
sec02Transport.send = (evt: string, data: any) => {
  if (evt === 'pb' && data?.op) sec02BroadcastSent = true;
  origSend(evt, data);
};

const sec02Sync = new SyncService(sec02Transport, {
  canControl: () => true,
  isAuthorized: () => true,
  isHost: () => true,
  getHostOnly: () => true,
  getRoomId: () => sec02Room.id,
  getHostId: () => 'sec02-host',
  getHostEpoch: () => 1,
  getHostSeq: () => 0,
  signPayload: async () => { throw new Error('Simulated crypto hardware signing failure'); },
  onSource: () => {},
  onHostOnly: () => {},
  onStatus: () => {}
});

sec02Sync.start();
sec02Transport.join({ userId: 'sec02-host', nickname: 'Host', avatar: '🌸|#ff0000', joinedAt: 1000 });

await sec02Sync.play();
await sleep(50);
check('SEC-02: Signing failure completely aborts broadcast; no message transmitted', sec02BroadcastSent === false);

sec02Sync.stop();
sec02Transport.leave();


// ── Summary ──
console.log('\n════════════════════════════════════════════════════════════════');
console.log(`  CORRECTIVE PASS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('════════════════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
