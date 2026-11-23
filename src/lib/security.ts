// Cryptographic utilities for host authorization, digital signatures, anti-spoofing, and anti-replay verification.
// Protocol version 2: JSON-canonical serialization, full MediaSource binding, synchronous nonce reservation.
export const SIGNATURE_PROTOCOL_VERSION = 2;

export interface HostKeyPair {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  publicKeyStr: string;
}

export interface HostKeyHandle {
  roomId: string;
  privateKey: CryptoKey; // non-extractable in production
  publicKey: CryptoKey;
  publicKeyStr: string;
}

export interface SignedAuth {
  sig: string;
  nonce: string;
  ts: number;
  seq?: number;
  epoch?: number;
  roomId?: string;
  hostId?: string;
  v?: number; // protocol version
}

// In-memory cache for imported CryptoKey instances to maximize performance
const pubKeyCache = new Map<string, CryptoKey>();
const privKeyCache = new Map<string, CryptoKey>();

// Replay attack prevention: seen nonces mapped to expiry timestamp
// X2 fix: pendingNonces reserves a nonce synchronously before async verification.
// pendingSequences reserves a sequence synchronously to prevent concurrent sequence races.
const seenNonces = new Map<string, number>(); // key: `${roomId}:${epoch}:${nonce}` -> expiry timestamp
const pendingNonces = new Set<string>(); // key: `${roomId}:${epoch}:${nonce}`
const pendingSequences = new Set<string>(); // key: `${roomId}:${epoch}:${seq}`
const NONCE_TTL_MS = 15_000;
const MAX_NONCE_CACHE_SIZE = 5000;
export const MAX_CLOCK_DRIFT_MS = 5_000; // Allow max 5 seconds clock skew / network delay

// Monotonic sequence number in-memory cache per `${roomId}:${epoch}:${role}`
const peerSeqMap = new Map<string, number>();

// Promise-based mutex queue for serializing atomic operations in environments without IDB
const seqMutexes = new Map<string, Promise<unknown>>();
function withKeyMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = seqMutexes.get(key) ?? Promise.resolve();
  let release: () => void;
  const barrier = new Promise<void>((r) => { release = r; });
  const next = current.then(async () => {
    try {
      return await fn();
    } finally {
      release();
    }
  });
  seqMutexes.set(key, barrier);
  return next;
}

// IndexedDB database and store configuration for atomic cross-tab sequence persistence
const SEQ_DB_NAME = 'at_sec_sequences';
const SEQ_STORE_NAME = 'sequences';

function openSeqDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not available in current environment'));
    }
    const req = indexedDB.open(SEQ_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SEQ_STORE_NAME)) {
        db.createObjectStore(SEQ_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open sequence IDB database'));
  });
}

async function withIdbStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openSeqDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(SEQ_STORE_NAME, mode);
    const store = tx.objectStore(SEQ_STORE_NAME);
    let result: T;
    fn(store)
      .then((val) => { result = val; })
      .catch((err) => {
        try { tx.abort(); } catch {}
        reject(err);
      });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('IDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
  });
}

/**
 * X1 fix: Authoritative, atomic host sequence allocator keyed by (roomId, hostEpoch).
 * Uses IndexedDB readwrite transaction (or synchronized transactional mutex) to guarantee
 * that concurrent tabs and async calls never receive the same sequence number.
 * State persists across browser reloads. Separate epochs have separate namespaces.
 */
export async function allocateHostSequence(roomId: string, epoch: number, initialBaseline = 0): Promise<number> {
  if (!roomId || typeof roomId !== 'string') {
    throw new Error('[security] allocateHostSequence: missing or invalid roomId');
  }
  if (!Number.isInteger(epoch) || epoch <= 0) {
    throw new Error(`[security] allocateHostSequence: invalid epoch ${epoch}`);
  }

  const key = `${roomId}:${epoch}:host`;

  return withKeyMutex(key, async () => {
    if (typeof indexedDB !== 'undefined') {
      try {
        const nextSeq = await withIdbStore('readwrite', async (store) => {
          const req = store.get(key);
          const existing = await new Promise<any>((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          const current = (existing && typeof existing.seq === 'number' && Number.isFinite(existing.seq))
            ? existing.seq
            : Math.max(initialBaseline, 0);
          const allocated = current + 1;
          const putReq = store.put({ key, roomId, epoch, role: 'host', seq: allocated, updatedAt: Date.now() });
          await new Promise<void>((res, rej) => {
            putReq.onsuccess = () => res();
            putReq.onerror = () => rej(putReq.error);
          });
          return allocated;
        });
        peerSeqMap.set(key, nextSeq);
        return nextSeq;
      } catch (e) {
        console.error('[security] IndexedDB sequence allocation failed; failing closed to prevent cross-tab sequence collision', e);
        throw new Error(`[security] allocateHostSequence: IndexedDB storage error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // In-memory mutex-backed atomic allocation (only for environments where indexedDB is not defined, e.g. Node.js unit tests)
    const memCurrent = peerSeqMap.get(key) ?? Math.max(initialBaseline, 0);
    const allocated = memCurrent + 1;
    peerSeqMap.set(key, allocated);
    return allocated;
  });
}

/**
 * Commit a verified peer sequence number atomically for (roomId, epoch).
 */
export async function commitPeerSequence(roomId: string, epoch: number, seq: number): Promise<void> {
  if (!roomId || !Number.isInteger(epoch) || epoch <= 0 || !Number.isInteger(seq) || seq <= 0) return;
  const key = `${roomId}:${epoch}:peer`;

  await withKeyMutex(key, async () => {
    const current = peerSeqMap.get(key) ?? 0;
    const updated = Math.max(current, seq);
    peerSeqMap.set(key, updated);

    if (typeof indexedDB !== 'undefined') {
      try {
        await withIdbStore('readwrite', async (store) => {
          const putReq = store.put({ key, roomId, epoch, role: 'peer', seq: updated, updatedAt: Date.now() });
          await new Promise<void>((res, rej) => {
            putReq.onsuccess = () => res();
            putReq.onerror = () => rej(putReq.error);
          });
        });
      } catch { /* ignore idb write errors */ }
    }
  });
}

/**
 * Get current sequence baseline for (roomId, epoch).
 */
export async function getSequenceBaseline(roomId: string, epoch: number, role: 'peer' | 'host' = 'peer'): Promise<number> {
  if (!roomId || !Number.isInteger(epoch) || epoch <= 0) return 0;
  const key = `${roomId}:${epoch}:${role}`;
  const mem = peerSeqMap.get(key);
  if (mem !== undefined) return mem;

  if (typeof indexedDB !== 'undefined') {
    try {
      const rec = await withIdbStore('readonly', async (store) => {
        const req = store.get(key);
        return new Promise<any>((res, rej) => {
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
      });
      if (rec && typeof rec.seq === 'number' && Number.isFinite(rec.seq)) {
        peerSeqMap.set(key, rec.seq);
        return rec.seq;
      }
    } catch { /* ignore */ }
  }
  return 0;
}

/**
 * Initialize baseline sequence for (roomId, epoch).
 */
export async function initSequenceBaseline(roomId: string, epoch: number, baselineSeq: number): Promise<void> {
  if (!roomId || !Number.isInteger(epoch) || epoch <= 0) return;
  const current = await getSequenceBaseline(roomId, epoch, 'peer');
  const target = Math.max(current, baselineSeq);
  await commitPeerSequence(roomId, epoch, target);
}

/**
 * Synchronous sequence query from in-memory cache for diagnostics and legacy callers.
 */
export function loadStoredSeq(roomId: string, epoch: number, role: 'peer' | 'host' = 'peer'): number {
  const key = `${roomId}:${epoch}:${role}`;
  return peerSeqMap.get(key) ?? 0;
}

/**
 * Synchronous sequence save for tests and backward compatibility.
 */
export function saveStoredSeq(roomId: string, epoch: number, seq: number, role: 'peer' | 'host' = 'peer'): void {
  const key = `${roomId}:${epoch}:${role}`;
  const current = peerSeqMap.get(key) ?? 0;
  peerSeqMap.set(key, Math.max(current, seq));
  void commitPeerSequence(roomId, epoch, seq).catch(() => {});
}

function getSubtle(): SubtleCrypto {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!c || !c.subtle) throw new Error('Web Crypto API (crypto.subtle) is not available in this environment');
  return c.subtle;
}

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  const arr = new Uint8Array(matches.length);
  for (let i = 0; i < matches.length; i++) {
    arr[i] = parseInt(matches[i], 16);
  }
  return arr;
}

// ── Non-Extractable Key Persistence Layer (IndexedDB with In-Memory Fallback) ──
class HostKeyStore {
  private memKeys = new Map<string, { privateKey: CryptoKey; publicKey: CryptoKey; publicKeyStr: string }>();

  async saveKey(roomId: string, privateKey: CryptoKey, publicKey: CryptoKey, publicKeyStr: string): Promise<void> {
    this.memKeys.set(roomId, { privateKey, publicKey, publicKeyStr });
    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await this.openDb();
        const tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').put({ roomId, privateKey, publicKey, publicKeyStr, savedAt: Date.now() });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
      } catch (e) {
        console.warn('[security] IndexedDB key store write failed; held in memory', e);
      }
    }
  }

  async getKey(roomId: string): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicKeyStr: string } | null> {
    const mem = this.memKeys.get(roomId);
    if (mem) return mem;

    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await this.openDb();
        const tx = db.transaction('keys', 'readonly');
        const req = tx.objectStore('keys').get(roomId);
        const result = await new Promise<any>((res, rej) => {
          req.onsuccess = () => res(req.result);
          req.onerror = rej;
        });
        if (result?.privateKey && result?.publicKeyStr) {
          const entry = { privateKey: result.privateKey, publicKey: result.publicKey, publicKeyStr: result.publicKeyStr };
          this.memKeys.set(roomId, entry);
          return entry;
        }
      } catch (e) {
        console.warn('[security] IndexedDB key store read failed', e);
      }
    }
    return null;
  }

  async clearKey(roomId: string): Promise<void> {
    this.memKeys.delete(roomId);
    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await this.openDb();
        const tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').delete(roomId);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
      } catch { /* ignore */ }
    }
  }

  clearAll(): void {
    this.memKeys.clear();
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('at_sec_keystore', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys', { keyPath: 'roomId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

export const hostKeyStore = new HostKeyStore();

/**
 * Generate a non-extractable ECDSA P-256 key handle for the room host.
 * Private key is non-extractable (extractable: false) and cannot be exported as raw material.
 */
export async function generateHostKeyHandle(roomId: string): Promise<HostKeyHandle> {
  const subtle = getSubtle();
  const kp = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // extractable = false (STRICT NON-EXTRACTABLE SECURITY)
    ['sign', 'verify']
  );
  const publicKeyJwk = await subtle.exportKey('jwk', kp.publicKey);
  const publicKeyStr = JSON.stringify(publicKeyJwk);

  // Pre-cache public key
  pubKeyCache.set(publicKeyStr, kp.publicKey);

  // Store in non-extractable key persistence layer
  await hostKeyStore.saveKey(roomId, kp.privateKey, kp.publicKey, publicKeyStr);

  return { roomId, privateKey: kp.privateKey, publicKey: kp.publicKey, publicKeyStr };
}

/** Legacy keypair generator (extractable: true) for backward compatibility */
export async function generateHostKeyPair(): Promise<HostKeyPair> {
  const subtle = getSubtle();
  const kp = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const privateKeyJwk = await subtle.exportKey('jwk', kp.privateKey);
  const publicKeyJwk = await subtle.exportKey('jwk', kp.publicKey);
  const publicKeyStr = JSON.stringify(publicKeyJwk);

  pubKeyCache.set(publicKeyStr, kp.publicKey);
  return { privateKeyJwk, publicKeyJwk, publicKeyStr };
}

/** Import an ECDSA private key from JWK (legacy fallback) */
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const subtle = getSubtle();
  const jwkStr = JSON.stringify(jwk);
  const cached = privKeyCache.get(jwkStr);
  if (cached) return cached;

  const key = await subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  privKeyCache.set(jwkStr, key);
  return key;
}

/** Import an ECDSA public key from JWK string or object */
export async function importPublicKey(jwkOrStr: string | JsonWebKey): Promise<CryptoKey> {
  const subtle = getSubtle();
  const jwk: JsonWebKey = typeof jwkOrStr === 'string' ? JSON.parse(jwkOrStr) : jwkOrStr;
  const str = typeof jwkOrStr === 'string' ? jwkOrStr : JSON.stringify(jwkOrStr);
  const cached = pubKeyCache.get(str);
  if (cached) return cached;

  const key = await subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  pubKeyCache.set(str, key);
  return key;
}

/**
 * X4 fix: JSON-based deterministic canonical serializer for playback intents.
 * Uses JSON.stringify with sorted keys for unambiguous, injection-proof serialization.
 * Validates MediaSource types and bounds, rejecting malformed source structures.
 *
 * Protocol version 2: incompatible with v1 pipe-delimited format.
 * Old clients will fail signature verification (safe failure mode).
 */
export function canonicalizePlaybackIntent(intent: {
  roomId?: string | null;
  type?: string | null;
  op: string;
  time?: number | null;
  playing?: boolean | null;
  source?: unknown;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceKind?: string | null;
  sourceFileName?: string | null;
  sourceSize?: number | null;
  hostOnly?: boolean | null;
  hostId?: string | null;
  epoch?: number | null;
  seq?: number | null;
  nonce: string;
  ts: number;
}): string {
  if (!intent.op || typeof intent.op !== 'string' || intent.op.trim().length === 0 || intent.op.length > 20) {
    throw new Error(`[security] Invalid operation name "${intent.op}" in playback intent`);
  }
  if (!intent.nonce || typeof intent.nonce !== 'string' || !/^[0-9a-fA-F]{16,64}$/.test(intent.nonce)) {
    throw new Error('[security] Invalid or malformed nonce in playback intent');
  }
  if (typeof intent.ts !== 'number' || !Number.isFinite(intent.ts) || intent.ts <= 0) {
    throw new Error('[security] Invalid timestamp in playback intent');
  }

  const epoch = typeof intent.epoch === 'number' && Number.isFinite(intent.epoch) ? Math.floor(intent.epoch) : 0;
  const hostId = String(intent.hostId || '');
  const hostOnly = typeof intent.hostOnly === 'boolean' ? intent.hostOnly : null;
  const nonce = intent.nonce;
  const op = intent.op.trim();
  const playing = typeof intent.playing === 'boolean' ? intent.playing : null;
  const roomId = String(intent.roomId || '');
  const seq = typeof intent.seq === 'number' && Number.isFinite(intent.seq) ? Math.floor(intent.seq) : 0;

  // Validate and extract MediaSource fields
  let sourceKind: string | null = null;
  let sourceTitle: string | null = null;
  let sourceUrl: string | null = null;
  let sourceFileName: string | null = null;
  let sourceSize: number | null = null;

  if (intent.source !== undefined && intent.source !== null) {
    const src = intent.source as any;
    if (typeof src !== 'object' || src === null) {
      throw new Error('[security] Malformed source: source must be an object');
    }
    if (!['mp4', 'hls', 'local'].includes(src.kind)) {
      throw new Error(`[security] Malformed source: invalid kind "${src.kind}"`);
    }
    if (typeof src.title !== 'string' || src.title.length > 200) {
      throw new Error('[security] Malformed source: title must be string <= 200 characters');
    }
    sourceKind = src.kind;
    sourceTitle = src.title;

    if (src.kind === 'local') {
      if (src.url && src.url !== '') {
        throw new Error('[security] Malformed source: local source url must be empty');
      }
      sourceUrl = '';
    } else {
      if (typeof src.url !== 'string' || src.url.length > 2000 || !/^https?:\/\//i.test(src.url)) {
        throw new Error('[security] Malformed source: remote source url must be http(s) <= 2000 characters');
      }
      sourceUrl = src.url;
    }

    if (src.fileName !== undefined && src.fileName !== null) {
      if (typeof src.fileName !== 'string' || src.fileName.length > 255) {
        throw new Error('[security] Malformed source: fileName must be a string <= 255 characters');
      }
      sourceFileName = src.fileName;
    }
    if (src.size !== undefined && src.size !== null) {
      if (!Number.isInteger(src.size) || src.size < 0) {
        throw new Error('[security] Malformed source: size must be a non-negative integer');
      }
      sourceSize = src.size;
    }
  } else {
    sourceKind = intent.sourceKind || null;
    sourceTitle = intent.sourceTitle || null;
    sourceUrl = intent.sourceUrl || null;
    sourceFileName = intent.sourceFileName || null;
    sourceSize = typeof intent.sourceSize === 'number' && Number.isFinite(intent.sourceSize) ? Math.floor(intent.sourceSize) : null;
  }

  const time = typeof intent.time === 'number' && Number.isFinite(intent.time)
    ? Math.round(intent.time * 1000) / 1000
    : null;
  const ts = Math.floor(intent.ts);

  // Deterministic JSON serialization with alphabetically sorted keys.
  const obj: Record<string, string | number | boolean | null> = {
    epoch,
    hostId,
    hostOnly,
    nonce,
    op,
    playing,
    roomId,
    seq,
    sourceFileName,
    sourceKind,
    sourceSize,
    sourceTitle,
    sourceUrl,
    time,
    ts,
    type: 'pb',
    v: SIGNATURE_PROTOCOL_VERSION
  };

  const sorted = Object.keys(obj).sort();
  const canonical: Record<string, string | number | boolean | null> = {};
  for (const k of sorted) canonical[k] = obj[k];
  return JSON.stringify(canonical);
}

/**
 * Sign a playback intent using the host's private key (non-extractable CryptoKey or legacy JWK).
 * Protocol v2: includes sourceKind, sourceFileName, sourceSize in canonical serialization.
 */
export async function signPlaybackPayload(
  privateKeyOrJwk: CryptoKey | JsonWebKey,
  intent: {
    op: string;
    time?: number | null;
    playing?: boolean | null;
    source?: unknown;
    hostOnly?: boolean | null;
    roomId?: string | null;
    hostId?: string | null;
    epoch?: number | null;
    seq?: number | null;
    nonce?: string | null;
    ts?: number | null;
  }
): Promise<SignedAuth> {
  const subtle = getSubtle();
  const privateKey = privateKeyOrJwk instanceof CryptoKey
    ? privateKeyOrJwk
    : await importPrivateKey(privateKeyOrJwk);

  // Generate cryptographically secure random nonce (16 hex characters) if not provided
  let nonce = intent.nonce;
  if (!nonce) {
    const nonceBytes = new Uint8Array(8);
    crypto.getRandomValues(nonceBytes);
    nonce = bufToHex(nonceBytes);
  }
  const ts = typeof intent.ts === 'number' && Number.isFinite(intent.ts) ? intent.ts : Date.now();

  const canonical = canonicalizePlaybackIntent({ ...intent, nonce, ts });
  const data = new TextEncoder().encode(canonical);

  const sigBuf = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data
  );

  return {
    sig: bufToHex(sigBuf),
    nonce,
    ts,
    seq: intent.seq ?? 0,
    epoch: intent.epoch ?? 1,
    roomId: intent.roomId ?? '',
    hostId: intent.hostId ?? '',
    v: SIGNATURE_PROTOCOL_VERSION
  };
}

export interface VerifyPlaybackOptions {
  expectedRoomId: string;
  expectedHostId: string;
  expectedEpoch: number;
}

/**
 * Verify a received playback command's digital signature, clock freshness, nonce uniqueness,
 * monotonic sequence number, and room/host authorization binding.
 *
 * X2 fix: Nonce and sequence are reserved synchronously before async verification.
 * X3 fix: Mandatory expected room, host, and epoch validation; rejects version mismatches and invalid sequences.
 * X4 fix: Canonicalizes exact validated command against trusted state.
 */
export async function verifyPlaybackSignature(
  publicKeyStr: string | null | undefined,
  intent: {
    op: string;
    time?: number | null;
    playing?: boolean | null;
    source?: unknown;
    hostOnly?: boolean | null;
    roomId?: string | null;
    hostId?: string | null;
    seq?: number | null;
    epoch?: number | null;
  },
  auth: unknown,
  options?: VerifyPlaybackOptions
): Promise<boolean> {
  if (!publicKeyStr || !auth || typeof auth !== 'object' || !options) return false;
  if (!options.expectedRoomId || !options.expectedHostId || typeof options.expectedEpoch !== 'number') {
    return false;
  }

  const a = auth as Partial<SignedAuth>;
  if (
    typeof a.sig !== 'string' || !a.sig ||
    typeof a.nonce !== 'string' || !/^[0-9a-fA-F]{16,64}$/.test(a.nonce) ||
    typeof a.ts !== 'number' || !Number.isFinite(a.ts)
  ) {
    return false;
  }

  // 1. Strict protocol version enforcement (X3)
  if (a.v !== SIGNATURE_PROTOCOL_VERSION) {
    return false;
  }

  // 2. Strict sequence and epoch format enforcement (X3)
  if (typeof a.seq !== 'number' || !Number.isInteger(a.seq) || a.seq <= 0) {
    return false;
  }
  if (typeof a.epoch !== 'number' || !Number.isInteger(a.epoch) || a.epoch <= 0) {
    return false;
  }

  // 3. Trusted Room ID, Host ID, and Epoch validation (X3)
  // Must match trusted expected options exactly
  if (a.roomId !== options.expectedRoomId || a.hostId !== options.expectedHostId || a.epoch !== options.expectedEpoch) {
    return false;
  }

  // Compare envelope fields against received intent fields (X4)
  if (intent.roomId !== undefined && intent.roomId !== null && intent.roomId !== a.roomId) return false;
  if (intent.hostId !== undefined && intent.hostId !== null && intent.hostId !== a.hostId) return false;
  if (intent.epoch !== undefined && intent.epoch !== null && intent.epoch !== a.epoch) return false;
  if (intent.seq !== undefined && intent.seq !== null && intent.seq !== a.seq) return false;

  const now = Date.now();

  // 4. Clock drift / Stale message rejection: message must be within +/- 5 seconds of local time
  if (Math.abs(now - a.ts) > MAX_CLOCK_DRIFT_MS) {
    return false;
  }

  // 5. Active TTL sweep of expired nonces (X2)
  for (const [key, exp] of seenNonces.entries()) {
    if (now > exp) seenNonces.delete(key);
  }

  // Bound cache size without discarding unexpired nonces (X2)
  if (seenNonces.size >= MAX_NONCE_CACHE_SIZE) {
    console.warn('[security] Nonce cache full with unexpired nonces; rejecting packet to prevent memory exhaustion');
    return false;
  }

  const nonceKey = `${a.roomId}:${a.epoch}:${a.nonce}`;
  const seqKey = `${a.roomId}:${a.epoch}:${a.seq}`;

  // 6. Synchronous Nonce & Sequence Collision Check (X2)
  if (seenNonces.has(nonceKey) || pendingNonces.has(nonceKey)) {
    return false;
  }

  if (pendingSequences.has(seqKey)) {
    return false; // Concurrent in-flight packet with duplicate sequence rejected
  }

  // 7. Synchronous Reservation before awaiting async verification (X2)
  // Must be registered synchronously before any async yield to prevent concurrent race conditions
  pendingNonces.add(nonceKey);
  pendingSequences.add(seqKey);

  const verifiedRoomId = a.roomId as string;
  const verifiedHostId = a.hostId as string;
  const verifiedEpoch = a.epoch as number;
  const verifiedSeq = a.seq as number;
  const verifiedNonce = a.nonce as string;
  const verifiedTs = a.ts as number;
  const verifiedSig = a.sig as string;

  // 8. Serialized sequence acceptance and digital signature verification (X2)
  // Ensures strictly monotonic sequence acceptance: a lower sequence can never be accepted
  // after a higher sequence has already been committed for (roomId, epoch).
  let valid = false;
  try {
    const acceptKey = `${verifiedRoomId}:${verifiedEpoch}:peer_accept`;

    valid = await withKeyMutex(acceptKey, async () => {
      // Check baseline under acceptance mutex
      const currentBaseline = await getSequenceBaseline(verifiedRoomId, verifiedEpoch, 'peer');
      if (verifiedSeq <= currentBaseline) {
        return false; // Stale, duplicate, or out-of-order sequence rejected
      }

      const subtle = getSubtle();
      const publicKey = await importPublicKey(publicKeyStr);
      const canonical = canonicalizePlaybackIntent({
        ...intent,
        roomId: verifiedRoomId,
        hostId: verifiedHostId,
        epoch: verifiedEpoch,
        seq: verifiedSeq,
        nonce: verifiedNonce,
        ts: verifiedTs
      });
      const data = new TextEncoder().encode(canonical);
      const sigBuf = hexToBuf(verifiedSig);

      const isSigValid = await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        sigBuf as unknown as BufferSource,
        data
      );

      if (!isSigValid) {
        return false;
      }

      // Re-verify baseline and atomically commit under mutex before releasing lock
      const finalBaseline = await getSequenceBaseline(verifiedRoomId, verifiedEpoch, 'peer');
      if (verifiedSeq <= finalBaseline) {
        return false;
      }
      seenNonces.set(nonceKey, now + NONCE_TTL_MS);
      await commitPeerSequence(verifiedRoomId, verifiedEpoch, verifiedSeq);

      return true;
    });
  } catch {
    valid = false;
  } finally {
    // Release pending reservations on every exit path (X2)
    pendingNonces.delete(nonceKey);
    pendingSequences.delete(seqKey);
  }

  return valid;
}

/** Reset replay nonces and sequence numbers (used for isolated test scenarios) */
export function resetReplayCacheForTests(): void {
  seenNonces.clear();
  pendingNonces.clear();
  pendingSequences.clear();
  peerSeqMap.clear();
  seqMutexes.clear();
  if (typeof sessionStorage !== 'undefined') {
    try {
      const keys = Object.keys(sessionStorage).filter((k) => k.startsWith('at_peer_seq_') || k.startsWith('at_host_seq_') || k.startsWith('at_seq_'));
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('at_peer_seq_') || k.startsWith('at_host_seq_'));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }
}

// ── Legacy Token Utilities (Kept for auxiliary checks & backwards compatibility) ──

/** Generate a cryptographically secure random token for the room host */
export function generateHostToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return bufToHex(bytes);
}

/** Compute SHA-256 hash in hex string format */
export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const subtle = getSubtle();
  const buf = await subtle.digest('SHA-256', enc);
  return bufToHex(buf);
}

/** Verify if a candidate token matches the expected SHA-256 hash */
export async function verifyHostToken(token: unknown, expectedHash: string | null | undefined): Promise<boolean> {
  if (typeof token !== 'string' || !token || !expectedHash) return false;
  try {
    const computed = await hashToken(token);
    return computed.toLowerCase() === expectedHash.toLowerCase();
  } catch {
    return false;
  }
}
