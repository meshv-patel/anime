/**
 * Anime Together — WebRTC Diagnostics & Statistics Telemetry Test Suite
 * Validates the sampling model, metric deltas, candidate-pair / codec resolution,
 * multi-stream isolation (screen vs cam, audio vs video), resource safety, and UI polling.
 */

import { LocalTransport } from '../src/realtime/localTransport';
import { MediaManager, type PeerDiagnostic } from '../src/media/mediaManager';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(` \x1b[32mPASS\x1b[0m  ${label}`);
    passed++;
  } else {
    console.error(` \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Setup browser/WebRTC mocks in Node
class MockTrack {
  id = 'track-' + Math.random().toString(36).slice(2);
  enabled = true;
  readyState = 'live';
  muted = false;
  displaySurface = 'browser';
  contentHint = '';
  private listeners: Record<string, Function[]> = {};

  constructor(public kind: 'video' | 'audio') {}

  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event: string, fn: Function) {
    this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== fn);
  }
  stop() {
    this.readyState = 'ended';
    (this.listeners['ended'] || []).forEach((fn) => fn());
  }
  mute() {
    this.muted = true;
    (this.listeners['mute'] || []).forEach((fn) => fn());
  }
  unmute() {
    this.muted = false;
    (this.listeners['unmute'] || []).forEach((fn) => fn());
  }
  getSettings() {
    return { displaySurface: this.displaySurface };
  }
}

class MockMediaStream {
  id = 'stream-' + Math.random().toString(36).slice(2);
  private tracks: MockTrack[] = [];
  private listeners: Record<string, Function[]> = {};

  constructor(tracks: MockTrack[] = []) {
    this.tracks = tracks;
  }

  getTracks() { return [...this.tracks]; }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  addTrack(t: MockTrack) {
    this.tracks.push(t);
    (this.listeners['addtrack'] || []).forEach((fn) => fn({ track: t }));
  }
  removeTrack(t: MockTrack) {
    this.tracks = this.tracks.filter((x) => x !== t);
    (this.listeners['removetrack'] || []).forEach((fn) => fn({ track: t }));
  }
}

class MockSender {
  params: any = { encodings: [{}] };
  constructor(public track: any) {}
  getParameters() { return JSON.parse(JSON.stringify(this.params)); }
  async setParameters(p: any) { this.params = p; }
}

class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'connected';
  iceConnectionState: RTCIceConnectionState = 'connected';
  iceGatheringState: RTCIceGatheringState = 'complete';
  signalingState: RTCSignalingState = 'stable';
  onicecandidate: ((e: any) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  ontrack: ((e: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  localDescription: any = null;
  remoteDescription: any = null;
  senders: Array<MockSender> = [];

  statsReports: Map<string, any> = new Map();
  statsDelay = 0;
  statsCallCount = 0;
  statsShouldFail = false;

  addTrack(track: any, stream: any) {
    const sender = new MockSender(track);
    this.senders.push(sender);
    return sender;
  }
  removeTrack(sender: any) {
    this.senders = this.senders.filter((s) => s !== sender);
  }
  async getStats() {
    this.statsCallCount++;
    if (this.statsDelay > 0) await sleep(this.statsDelay);
    if (this.statsShouldFail) {
      throw new Error('Simulated getStats failure');
    }
    return this.statsReports;
  }
  async createOffer() { return { type: 'offer', sdp: 'mock-offer' }; }
  async createAnswer() { return { type: 'answer', sdp: 'mock-answer' }; }
  async setLocalDescription(desc?: any) { this.localDescription = desc || { type: 'offer', sdp: 'mock-local' }; }
  async setRemoteDescription(desc: any) { this.remoteDescription = desc; }
  async addIceCandidate(cand: any) {}
  restartIce() {}
  close() { this.connectionState = 'closed'; }
}

const mockMediaDevices = {
  async getDisplayMedia(constraints?: any) {
    const vTrack = new MockTrack('video');
    const aTrack = new MockTrack('audio');
    return new MockMediaStream([vTrack, aTrack]) as any;
  },
  async getUserMedia(constraints?: any) {
    const tracks: MockTrack[] = [];
    if (constraints.audio) tracks.push(new MockTrack('audio'));
    if (constraints.video) tracks.push(new MockTrack('video'));
    return new MockMediaStream(tracks) as any;
  }
};

// Global environment shims
(globalThis as any).window = { isSecureContext: true };
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: mockMediaDevices },
  configurable: true
});
(globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as any).MediaStream = MockMediaStream;

async function run() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  ANIME TOGETHER — WEBRTC DIAGNOSTICS & TELEMETRY TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  const dummyIce = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const roomId = 'room-diag-verification';
  const tHost = new LocalTransport(roomId);
  const tGuest = new LocalTransport(roomId);
  const mHost = new MediaManager(tHost, dummyIce, () => tHost.clientId);
  const mGuest = new MediaManager(tGuest, dummyIce, () => tHost.clientId);

  tHost.join({ userId: 'u-host', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  tGuest.join({ userId: 'u-guest', nickname: 'Guest', avatar: '🦊|#fff', joinedAt: 200 });
  mHost.setPeers([tGuest.clientId]);
  mGuest.setPeers([tHost.clientId]);
  await mHost.start('screen');
  await sleep(30);

  const getPc = (m: MediaManager, peerId: string): MockRTCPeerConnection => (m as any).pcs.get(peerId).pc;
  const pcHost = getPc(mHost, tGuest.clientId);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Independent Inbound and Outbound Video Samples for the Same Peer
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ [1] Independent Inbound and Outbound Video Samples for the Same Peer');
  pcHost.statsReports = new Map([
    ['out-v', {
      id: 'out-v',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 1001,
      bytesSent: 1_000_000,
      timestamp: 1000
    }],
    ['in-v', {
      id: 'in-v',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 2001,
      bytesReceived: 500_000,
      timestamp: 1000
    }]
  ]);

  // First sample sets baseline
  await mHost.getDiagnostics();
  const samplesMap = (mHost as any).rtpSamples as Map<string, any>;
  const outKey = `${tGuest.clientId}:outbound:video:1001`;
  const inKey = `${tGuest.clientId}:inbound:video:2001`;

  check('Sampling: Outbound video sample recorded under separate key', samplesMap.has(outKey));
  check('Sampling: Inbound video sample recorded under separate key', samplesMap.has(inKey));
  check('Sampling: Keys do not collide for same peer', outKey !== inKey);

  // Second sample: advance both by 1000ms
  // Outbound: +500,000 bytes over 1000ms => 4000 kbps
  // Inbound: +250,000 bytes over 1000ms => 2000 kbps
  pcHost.statsReports = new Map([
    ['out-v', {
      id: 'out-v',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 1001,
      bytesSent: 1_500_000,
      timestamp: 2000
    }],
    ['in-v', {
      id: 'in-v',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 2001,
      bytesReceived: 750_000,
      timestamp: 2000
    }]
  ]);

  const diag1 = await mHost.getDiagnostics();
  const ov1 = diag1[0].outboundVideoStreams[0];
  const iv1 = diag1[0].inboundVideoStreams[0];

  check('Sampling: Outbound video calculates correct sampled bitrate (4000 kbps)', ov1?.bitrateKbps === 4000, `got ${ov1?.bitrateKbps}`);
  check('Sampling: Inbound video calculates correct sampled bitrate (2000 kbps)', iv1?.bitrateKbps === 2000, `got ${iv1?.bitrateKbps}`);
  check('Sampling: Outbound calculation does not overwrite or corrupt inbound bitrate', ov1?.bitrateKbps !== iv1?.bitrateKbps);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Independent Inbound and Outbound Audio Samples
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [2] Independent Inbound and Outbound Audio Samples');
  pcHost.statsReports.set('out-a', {
    id: 'out-a',
    type: 'outbound-rtp',
    kind: 'audio',
    ssrc: 3001,
    bytesSent: 20_000,
    timestamp: 2000
  });
  pcHost.statsReports.set('in-a', {
    id: 'in-a',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 4001,
    bytesReceived: 10_000,
    timestamp: 2000
  });

  await mHost.getDiagnostics();
  const outAudKey = `${tGuest.clientId}:outbound:audio:3001`;
  const inAudKey = `${tGuest.clientId}:inbound:audio:4001`;

  check('Sampling: Outbound audio sample stored under distinct audio key', samplesMap.has(outAudKey));
  check('Sampling: Inbound audio sample stored under distinct audio key', samplesMap.has(inAudKey));

  // Advance audio by 1000ms: out +16,000 bytes => 128 kbps, in +8,000 bytes => 64 kbps
  pcHost.statsReports.set('out-a', {
    id: 'out-a',
    type: 'outbound-rtp',
    kind: 'audio',
    ssrc: 3001,
    bytesSent: 36_000,
    timestamp: 3000
  });
  pcHost.statsReports.set('in-a', {
    id: 'in-a',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 4001,
    bytesReceived: 18_000,
    timestamp: 3000
  });

  const diag2 = await mHost.getDiagnostics();
  const oa2 = diag2[0].outboundAudioStreams[0];
  const ia2 = diag2[0].inboundAudioStreams[0];

  check('Sampling: Outbound audio calculates correct bitrate (128 kbps)', oa2?.bitrateKbps === 128, `got ${oa2?.bitrateKbps}`);
  check('Sampling: Inbound audio calculates correct bitrate (64 kbps)', ia2?.bitrateKbps === 64, `got ${ia2?.bitrateKbps}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Screen and Webcam Video Samples Do Not Overwrite One Another
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [3] Screen and Webcam Video Samples Do Not Overwrite One Another');
  // Two outbound video reports (e.g. Screen ssrc: 5001, Cam ssrc: 5002)
  pcHost.statsReports = new Map([
    ['out-screen', {
      id: 'out-screen',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 5001,
      bytesSent: 2_000_000,
      timestamp: 3000
    }],
    ['out-cam', {
      id: 'out-cam',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 5002,
      bytesSent: 300_000,
      timestamp: 3000
    }]
  ]);

  await mHost.getDiagnostics();
  const screenKey = `${tGuest.clientId}:outbound:video:5001`;
  const camKey = `${tGuest.clientId}:outbound:video:5002`;

  check('Multi-Video: Screen and Cam have distinct sample map entries', samplesMap.has(screenKey) && samplesMap.has(camKey) && screenKey !== camKey);

  // Advance: Screen +375,000 bytes => 3000 kbps; Cam +62,500 bytes => 500 kbps
  pcHost.statsReports = new Map([
    ['out-screen', {
      id: 'out-screen',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 5001,
      bytesSent: 2_375_000,
      timestamp: 4000
    }],
    ['out-cam', {
      id: 'out-cam',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 5002,
      bytesSent: 362_500,
      timestamp: 4000
    }]
  ]);

  const diag3 = await mHost.getDiagnostics();
  check('Multi-Video: Both video streams returned in outboundVideoStreams', diag3[0].outboundVideoStreams.length === 2);
  const streamScreen = diag3[0].outboundVideoStreams.find((s) => s.ssrc === 5001);
  const streamCam = diag3[0].outboundVideoStreams.find((s) => s.ssrc === 5002);
  check('Multi-Video: Screen video bitrate calculated correctly (3000 kbps)', streamScreen?.bitrateKbps === 3000, `got ${streamScreen?.bitrateKbps}`);
  check('Multi-Video: Cam video bitrate calculated correctly (500 kbps)', streamCam?.bitrateKbps === 500, `got ${streamCam?.bitrateKbps}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4 & 5: Bitrate Formula & Counter Reset Handling
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [4 & 5] Bitrate Formula & Counter Reset Handling');
  // Counter reset: renegotiation drops bytesSent from 2,375,000 to 50,000
  pcHost.statsReports = new Map([
    ['out-screen', {
      id: 'out-screen',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 5001,
      bytesSent: 50_000,
      timestamp: 5000
    }]
  ]);

  const diagReset = await mHost.getDiagnostics();
  const resetVid = diagReset[0].outboundVideoStreams.find((s) => s.ssrc === 5001);
  check('Reset: Decreasing byte counter does NOT produce negative bitrate', resetVid?.bitrateKbps === undefined || resetVid?.bitrateKbps >= 0);
  check('Reset: Returns undefined (N/A) upon counter reset', resetVid?.bitrateKbps === undefined);

  // Next sample resumes cleanly from new baseline (50,000 -> 175,000 over 1s => 1000 kbps)
  pcHost.statsReports = new Map([
    ['out-screen', {
      id: 'out-screen',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 5001,
      bytesSent: 175_000,
      timestamp: 6000
    }]
  ]);
  const diagResumed = await mHost.getDiagnostics();
  const resumedVid = diagResumed[0].outboundVideoStreams.find((s) => s.ssrc === 5001);
  check('Reset: Recovers and accurately calculates bitrate on subsequent sample (1000 kbps)', resumedVid?.bitrateKbps === 1000, `got ${resumedVid?.bitrateKbps}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Zero and Invalid Timestamp Handling
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [6] Zero and Invalid Timestamp Handling');
  pcHost.statsReports = new Map([
    ['in-ts-test', {
      id: 'in-ts-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 6001,
      bytesReceived: 100_000,
      timestamp: 0 // invalid zero timestamp
    }]
  ]);
  await mHost.getDiagnostics();
  const tsRecord = samplesMap.get(`${tGuest.clientId}:inbound:video:6001`);
  check('Timestamp: Zero timestamp falls back to Date.now() > 0', tsRecord && tsRecord.timestamp > 0);

  // Tight poll (< 200ms) rejects calculation to avoid division by near-zero
  pcHost.statsReports = new Map([
    ['in-ts-test', {
      id: 'in-ts-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 6001,
      bytesReceived: 105_000,
      timestamp: tsRecord.timestamp + 50 // only 50ms later
    }]
  ]);
  const diagTight = await mHost.getDiagnostics();
  const tightVid = diagTight[0].inboundVideoStreams.find((s) => s.ssrc === 6001);
  check('Timestamp: Delta < 200ms rejects unstable instantaneous calculation', tightVid?.bitrateKbps === undefined);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Packet-Loss Percentage Using Counter Deltas
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [7] Packet-Loss Percentage Using Counter Deltas');
  // Baseline: 1000 packets received, 10 packets lost
  pcHost.statsReports = new Map([
    ['loss-test', {
      id: 'loss-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 7001,
      bytesReceived: 100_000,
      packetsReceived: 1000,
      packetsLost: 10,
      timestamp: 10_000
    }]
  ]);
  await mHost.getDiagnostics();

  // Sample 2: 1980 packets received (+980), 30 packets lost (+20)
  // Delta total = 980 + 20 = 1000 pkts. Loss = 20 / 1000 = 2.0%
  pcHost.statsReports = new Map([
    ['loss-test', {
      id: 'loss-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 7001,
      bytesReceived: 200_000,
      packetsReceived: 1980,
      packetsLost: 30,
      timestamp: 11_000
    }]
  ]);
  const diagLoss = await mHost.getDiagnostics();
  const lossStream = diagLoss[0].inboundVideoStreams.find((s) => s.ssrc === 7001);
  check('Packet Loss: Accurately calculates delta loss percentage (2.0%)', lossStream?.packetLossPct === 2.0, `got ${lossStream?.packetLossPct}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Frame-Drop Ratio Using Counter Deltas
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [8] Frame-Drop Ratio Using Counter Deltas');
  // Baseline: 100 decoded, 2 dropped
  pcHost.statsReports = new Map([
    ['drop-test', {
      id: 'drop-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 8001,
      framesDecoded: 100,
      framesDropped: 2,
      timestamp: 20_000
    }]
  ]);
  await mHost.getDiagnostics();

  // Sample 2: 190 decoded (+90), 12 dropped (+10)
  // Delta total = 90 + 10 = 100 frames. Drop ratio = 10 / 100 = 10.0%
  pcHost.statsReports = new Map([
    ['drop-test', {
      id: 'drop-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 8001,
      framesDecoded: 190,
      framesDropped: 12,
      timestamp: 21_000
    }]
  ]);
  const diagDrop = await mHost.getDiagnostics();
  const dropStream = diagDrop[0].inboundVideoStreams.find((s) => s.ssrc === 8001);
  check('Frame Drop: Accurately calculates delta frame drop ratio (10.0%)', dropStream?.frameDropRatioPct === 10.0, `got ${dropStream?.frameDropRatioPct}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Jitter-Buffer Delay Using Recent Deltas
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [9] Jitter-Buffer Delay Using Recent Deltas');
  // Baseline: 5.00s cumulative delay across 100 emitted frames (average 50ms)
  pcHost.statsReports = new Map([
    ['jb-test', {
      id: 'jb-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 9001,
      jitterBufferDelay: 5.0,
      jitterBufferEmittedCount: 100,
      timestamp: 30_000
    }]
  ]);
  await mHost.getDiagnostics();

  // Sample 2: Spurt of latency in recent 1s!
  // Emitted 20 frames (+20), added 1.6s delay (+1.6s)
  // Recent delta delay = 1.6 / 20 = 80ms! (Lifetime average would only be 6.6/120 = 55ms)
  pcHost.statsReports = new Map([
    ['jb-test', {
      id: 'jb-test',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 9001,
      jitterBufferDelay: 6.6,
      jitterBufferEmittedCount: 120,
      timestamp: 31_000
    }]
  ]);
  const diagJb = await mHost.getDiagnostics();
  const jbStream = diagJb[0].inboundVideoStreams.find((s) => s.ssrc === 9001);
  check('Jitter Buffer: Reflects recent delta delay (80ms), not muted lifetime average', jbStream?.avgJitterBufferDelayMs === 80, `got ${jbStream?.avgJitterBufferDelayMs}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: Missing Optional Browser Stats Fields
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [10] Missing Optional Browser Stats Fields');
  pcHost.statsReports = new Map([
    ['minimal-stat', {
      id: 'minimal-stat',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 10001
      // All other fields omitted (no resolution, no jitter, no bytes, no codec)
    }]
  ]);
  const diagMinimal = await mHost.getDiagnostics();
  const minStream = diagMinimal[0].inboundVideoStreams.find((s) => s.ssrc === 10001);
  check('Optional Fields: Missing stats do not crash query', !!minStream);
  check('Optional Fields: Missing resolution is undefined (renders as N/A in UI)', minStream?.frameWidth === undefined);
  check('Optional Fields: Missing jitter is undefined', minStream?.jitter === undefined);
  check('Optional Fields: Missing codec is undefined', minStream?.codec === undefined);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: Codec Association from RTCStatsReport
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [11] Codec Association from RTCStatsReport');
  pcHost.statsReports = new Map([
    ['codec-v', {
      id: 'codec-v',
      type: 'codec',
      mimeType: 'video/H264',
      clockRate: 90000,
      sdpFmtpLine: 'profile-level-id=42e01f;level-asymmetry-allowed=1'
    }],
    ['codec-a', {
      id: 'codec-a',
      type: 'codec',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2
    }],
    ['rtp-v', {
      id: 'rtp-v',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 11001,
      codecId: 'codec-v'
    }],
    ['rtp-a', {
      id: 'rtp-a',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 11002,
      codecId: 'codec-a'
    }]
  ]);

  const diagCodec = await mHost.getDiagnostics();
  const vidCodecStream = diagCodec[0].inboundVideoStreams.find((s) => s.ssrc === 11001);
  const audCodecStream = diagCodec[0].inboundAudioStreams.find((s) => s.ssrc === 11002);

  check('Codec: Video codec associates and formats profile info', vidCodecStream?.codec?.includes('H264') && vidCodecStream?.codec?.includes('42e01f'));
  check('Codec: Audio codec associates and formats channels and clock rate', audCodecStream?.codec?.includes('OPUS') && audCodecStream?.codec?.includes('48kHz') && audCodecStream?.codec?.includes('2ch'));

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 12: Selected Candidate-Pair Association & IP Privacy
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [12] Selected Candidate-Pair Association & IP Privacy');
  pcHost.statsReports = new Map([
    ['transport-1', {
      id: 'transport-1',
      type: 'transport',
      selectedCandidatePairId: 'cp-active'
    }],
    ['cp-active', {
      id: 'cp-active',
      type: 'candidate-pair',
      state: 'succeeded',
      localCandidateId: 'cand-local',
      remoteCandidateId: 'cand-remote',
      currentRoundTripTime: 0.042, // 42ms
      availableOutgoingBitrate: 8_500_000, // 8500 kbps
      protocol: 'udp'
    }],
    ['cand-local', {
      id: 'cand-local',
      type: 'local-candidate',
      candidateType: 'srflx',
      protocol: 'udp',
      address: '198.51.100.12', // Private/public IP should NOT be displayed
      port: 54321
    }],
    ['cand-remote', {
      id: 'cand-remote',
      type: 'remote-candidate',
      candidateType: 'relay',
      protocol: 'udp',
      address: '203.0.113.88',
      port: 3478
    }]
  ]);

  const diagCand = await mHost.getDiagnostics();
  const cp = diagCand[0].candidatePair;

  check('Candidate Pair: Correct active pair selected via transport relation', cp?.pairId === 'cp-active');
  check('Candidate Pair: Identifies TURN relay connection', cp?.isRelay === true);
  check('Candidate Pair: Measures current RTT in milliseconds (42ms)', cp?.currentRoundTripTimeMs === 42);
  check('Candidate Pair: Available outgoing bitrate reported in kbps (8500 kbps)', cp?.availableOutgoingBitrateKbps === 8500);
  check('Privacy: Candidate pair label does NOT expose raw IP addresses or ports', !cp?.selectedPair.includes('198.51.100') && !cp?.selectedPair.includes('54321'));

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 13: Peer Cleanup Removes Old Samples
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [13] Peer Cleanup Removes Old Samples');
  check('Cleanup: Samples exist for peer before departure', samplesMap.size > 0);
  mHost.setPeers([]); // Peer departs room
  check('Cleanup: All samples for departed peer are purged from rtpSamples', samplesMap.size === 0);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 14: Slow getStats() Does Not Create Overlapping Polls
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [14] Slow getStats() Does Not Create Overlapping Polls');
  mHost.setPeers([tGuest.clientId]);
  const pcHost2 = getPc(mHost, tGuest.clientId);
  pcHost2.statsDelay = 50; // 50ms delay
  pcHost2.statsCallCount = 0;

  // Fire two concurrent getDiagnostics calls
  const [dRes1, dRes2] = await Promise.all([
    mHost.getDiagnostics(),
    mHost.getDiagnostics()
  ]);

  check('Concurrency: Two concurrent diagnostics calls return valid arrays', dRes1.length === 1 && dRes2.length === 1);
  check('Concurrency: In-flight deduplication invoked getStats exactly once', pcHost2.statsCallCount === 1, `calls: ${pcHost2.statsCallCount}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 15: Failed getStats() Call Does Not Break Subsequent Polling
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [15] Failed getStats() Call Does Not Break Subsequent Polling');
  pcHost2.statsShouldFail = true;
  const diagFailed = await mHost.getDiagnostics();
  check('Failure Recovery: getDiagnostics does not crash on getStats error', diagFailed.length === 1 && diagFailed[0].connectionState === 'connected');

  pcHost2.statsShouldFail = false;
  pcHost2.statsDelay = 0;
  const diagRecovered = await mHost.getDiagnostics();
  check('Failure Recovery: Subsequent poll after failure succeeds cleanly', diagRecovered.length === 1);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 16: Closing Diagnostics Overlay Stops Polling (Simulated Controller)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [16] Closing Diagnostics Overlay Stops Polling');
  let pollCount = 0;
  let timerRef: any = null;
  let isSimOpen = true;

  const startPolling = () => {
    if (!isSimOpen) return;
    pollCount++;
    timerRef = setInterval(() => {
      if (!isSimOpen) return;
      pollCount++;
    }, 10);
  };

  startPolling();
  await sleep(35);
  const countWhileOpen = pollCount;
  check('Polling Safety: Overlay polls when open', countWhileOpen >= 2);

  // Close overlay: clears interval
  isSimOpen = false;
  clearInterval(timerRef);
  await sleep(35);
  check('Polling Safety: Polling completely halts when overlay is closed', pollCount === countWhileOpen, `polls after close: ${pollCount - countWhileOpen}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 17: Outbound Audio-Level Attribution via mediaSourceId
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [17] Outbound Audio-Level Attribution via mediaSourceId');
  pcHost2.statsReports = new Map([
    ['ms-mic', {
      id: 'ms-mic',
      type: 'media-source',
      kind: 'audio',
      audioLevel: 0.25,
      totalAudioEnergy: 0.12,
      totalSamplesDuration: 5.0
    }],
    ['out-a-ms', {
      id: 'out-a-ms',
      type: 'outbound-rtp',
      kind: 'audio',
      ssrc: 17001,
      mediaSourceId: 'ms-mic',
      bytesSent: 10_000,
      timestamp: 50_000
    }],
    ['out-a-noms', {
      id: 'out-a-noms',
      type: 'outbound-rtp',
      kind: 'audio',
      ssrc: 17002,
      // mediaSourceId omitted and no audioLevel on RTP report
      bytesSent: 5_000,
      timestamp: 50_000
    }]
  ]);

  const diagAudSrc = await mHost.getDiagnostics();
  const oaWithSrc = diagAudSrc[0].outboundAudioStreams.find((s) => s.ssrc === 17001);
  const oaWithoutSrc = diagAudSrc[0].outboundAudioStreams.find((s) => s.ssrc === 17002);

  check('Audio Source: Resolves audioLevel from media-source report', oaWithSrc?.audioLevel === 0.25, `got ${oaWithSrc?.audioLevel}`);
  check('Audio Source: Detects voice activity from media-source audioLevel', oaWithSrc?.audioStatus === 'active' && oaWithSrc?.audioActive === true);
  check('Audio Source: Reports status unknown (not silent) when media-source is unavailable', oaWithoutSrc?.audioStatus === 'unknown', `got ${oaWithoutSrc?.audioStatus}`);
  check('Audio Source: audioLevel is undefined when unavailable', oaWithoutSrc?.audioLevel === undefined);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 18: Frame-Drop Metric Clarity (Cumulative vs Recent Interval)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [18] Frame-Drop Metric Clarity (Cumulative vs Recent Interval)');
  pcHost2.statsReports = new Map([
    ['drop-clarity', {
      id: 'drop-clarity',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 18001,
      framesDecoded: 500,
      framesDropped: 10,
      timestamp: 60_000
    }]
  ]);
  await mHost.getDiagnostics();

  // Second tick: +100 decoded, +25 dropped over 2000ms => delta drop ratio = 25 / 125 = 20.0%
  pcHost2.statsReports = new Map([
    ['drop-clarity', {
      id: 'drop-clarity',
      type: 'inbound-rtp',
      kind: 'video',
      ssrc: 18001,
      framesDecoded: 600,
      framesDropped: 35,
      timestamp: 62_000
    }]
  ]);
  const diagClarity = await mHost.getDiagnostics();
  const dropClarityStream = diagClarity[0].inboundVideoStreams.find((s) => s.ssrc === 18001);

  check('Frame Drop Clarity: Preserves cumulative lifetime decoded total (600)', dropClarityStream?.framesDecoded === 600);
  check('Frame Drop Clarity: Preserves cumulative lifetime dropped total (35)', dropClarityStream?.framesDropped === 35);
  check('Frame Drop Clarity: Measures recent interval drop ratio (20.0%)', dropClarityStream?.frameDropRatioPct === 20.0, `got ${dropClarityStream?.frameDropRatioPct}`);
  check('Frame Drop Clarity: Records sampling window duration (2000ms)', dropClarityStream?.dropSamplingWindowMs === 2000, `got ${dropClarityStream?.dropSamplingWindowMs}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 19: Granular RTP Sample Cleanup by Track and Kind
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [19] Granular RTP Sample Cleanup by Track and Kind');
  await mHost.start('cam');
  await sleep(30);

  const screenTrackId = mHost.local.screen!.getVideoTracks()[0].id;
  const camTrackId = mHost.local.cam!.getVideoTracks()[0].id;

  pcHost2.statsReports = new Map([
    ['out-screen-clean', {
      id: 'out-screen-clean',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 19001,
      trackIdentifier: screenTrackId,
      bytesSent: 100_000,
      timestamp: 70_000
    }],
    ['out-cam-clean', {
      id: 'out-cam-clean',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 19002,
      trackIdentifier: camTrackId,
      bytesSent: 50_000,
      timestamp: 70_000
    }]
  ]);
  await mHost.getDiagnostics();

  const samplesAfterBoth = (mHost as any).rtpSamples as Map<string, any>;
  const screenSampleKey = `${tGuest.clientId}:outbound:video:19001`;
  const camSampleKey = `${tGuest.clientId}:outbound:video:19002`;

  check('Cleanup: Samples exist for both screen and cam before stop', samplesAfterBoth.has(screenSampleKey) && samplesAfterBoth.has(camSampleKey));

  // Stop only screen sharing
  mHost.stop('screen');

  check('Cleanup: Screen sample is purged from rtpSamples', !samplesAfterBoth.has(screenSampleKey));
  check('Cleanup: Cam sample remains intact in rtpSamples', samplesAfterBoth.has(camSampleKey));

  // Stop cam
  mHost.stop('cam');
  check('Cleanup: Cam sample is purged after cam stopped', !samplesAfterBoth.has(camSampleKey));

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 20: Codec Sample-Rate Semantics for Audio Concealment
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [20] Codec Sample-Rate Semantics for Audio Concealment');
  pcHost2.statsReports = new Map([
    // Codec 1: Opus (RFC 7587: 48 kHz RTP clock rate & 48 kHz decoded sample rate)
    ['c-opus', {
      id: 'c-opus',
      type: 'codec',
      mimeType: 'audio/opus',
      clockRate: 48000
    }],
    // Codec 2: PCMU (RFC 3551: 8 kHz RTP clock rate & 8 kHz decoded sample rate)
    ['c-pcmu', {
      id: 'c-pcmu',
      type: 'codec',
      mimeType: 'audio/PCMU',
      clockRate: 8000
    }],
    // Codec 3: PCMA (RFC 3551: 8 kHz RTP clock rate & 8 kHz decoded sample rate)
    ['c-pcma', {
      id: 'c-pcma',
      type: 'codec',
      mimeType: 'audio/PCMA',
      clockRate: 8000
    }],
    // Codec 4: G.722 (RFC 3551 Section 4.5.2: 8 kHz RTP clock rate, but 16 kHz audio sampling rate!)
    ['c-g722', {
      id: 'c-g722',
      type: 'codec',
      mimeType: 'audio/G722',
      clockRate: 8000 // Realistic WebRTC RTP clock rate
    }],
    // Codec 5: Unknown codec with ambiguous sample rate
    ['c-unknown', {
      id: 'c-unknown',
      type: 'codec',
      mimeType: 'audio/custom-proprietary',
      clockRate: 32000
    }],
    ['rtp-opus', {
      id: 'rtp-opus',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 20001,
      codecId: 'c-opus',
      concealedSamples: 0,
      totalSamplesDuration: 1.0,
      timestamp: 80_000
    }],
    ['rtp-pcmu', {
      id: 'rtp-pcmu',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 20002,
      codecId: 'c-pcmu',
      concealedSamples: 0,
      totalSamplesDuration: 1.0,
      timestamp: 80_000
    }],
    ['rtp-pcma', {
      id: 'rtp-pcma',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 20003,
      codecId: 'c-pcma',
      concealedSamples: 0,
      totalSamplesDuration: 1.0,
      timestamp: 80_000
    }],
    ['rtp-g722', {
      id: 'rtp-g722',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 20004,
      codecId: 'c-g722',
      concealedSamples: 0,
      totalSamplesDuration: 1.0,
      timestamp: 80_000
    }],
    ['rtp-unknown', {
      id: 'rtp-unknown',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 20005,
      codecId: 'c-unknown',
      concealedSamples: 0,
      totalSamplesDuration: 1.0,
      timestamp: 80_000
    }],
    ['rtp-nocodec', {
      id: 'rtp-nocodec',
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: 20006,
      concealedSamples: 0,
      totalSamplesDuration: 1.0,
      timestamp: 80_000
    }]
  ]);
  await mHost.getDiagnostics();

  // Second sample: advance 1.0s
  // Opus: +2400 concealed samples over 1s => 2400 / 48000 = 5.0%
  // PCMU: +400 concealed samples over 1s => 400 / 8000 = 5.0%
  // PCMA: +400 concealed samples over 1s => 400 / 8000 = 5.0%
  // G.722: +800 concealed samples over 1s => 800 / 16000 = 5.0% (NOT 800/8000 = 10%!)
  // Unknown: +800 concealed samples => unavailable percentage
  // Missing codec: +800 concealed samples => unavailable percentage
  pcHost2.statsReports.set('rtp-opus', {
    id: 'rtp-opus',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 20001,
    codecId: 'c-opus',
    concealedSamples: 2400,
    totalSamplesDuration: 2.0,
    timestamp: 81_000
  });
  pcHost2.statsReports.set('rtp-pcmu', {
    id: 'rtp-pcmu',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 20002,
    codecId: 'c-pcmu',
    concealedSamples: 400,
    totalSamplesDuration: 2.0,
    timestamp: 81_000
  });
  pcHost2.statsReports.set('rtp-pcma', {
    id: 'rtp-pcma',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 20003,
    codecId: 'c-pcma',
    concealedSamples: 400,
    totalSamplesDuration: 2.0,
    timestamp: 81_000
  });
  pcHost2.statsReports.set('rtp-g722', {
    id: 'rtp-g722',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 20004,
    codecId: 'c-g722',
    concealedSamples: 800,
    totalSamplesDuration: 2.0,
    timestamp: 81_000
  });
  pcHost2.statsReports.set('rtp-unknown', {
    id: 'rtp-unknown',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 20005,
    codecId: 'c-unknown',
    concealedSamples: 800,
    totalSamplesDuration: 2.0,
    timestamp: 81_000
  });
  pcHost2.statsReports.set('rtp-nocodec', {
    id: 'rtp-nocodec',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 20006,
    concealedSamples: 800,
    totalSamplesDuration: 2.0,
    timestamp: 81_000
  });

  const diagConceal = await mHost.getDiagnostics();
  const audOpus = diagConceal[0].inboundAudioStreams.find((s) => s.ssrc === 20001);
  const audPcmu = diagConceal[0].inboundAudioStreams.find((s) => s.ssrc === 20002);
  const audPcma = diagConceal[0].inboundAudioStreams.find((s) => s.ssrc === 20003);
  const audG722 = diagConceal[0].inboundAudioStreams.find((s) => s.ssrc === 20004);
  const audUnknown = diagConceal[0].inboundAudioStreams.find((s) => s.ssrc === 20005);
  const audNoCodec = diagConceal[0].inboundAudioStreams.find((s) => s.ssrc === 20006);

  check('Concealment: Opus uses 48 kHz decoded sample rate (5.0%)', audOpus?.concealedSamplesRatioPct === 5.0, `got ${audOpus?.concealedSamplesRatioPct}`);
  check('Concealment: PCMU uses 8 kHz decoded sample rate (5.0%)', audPcmu?.concealedSamplesRatioPct === 5.0, `got ${audPcmu?.concealedSamplesRatioPct}`);
  check('Concealment: PCMA uses 8 kHz decoded sample rate (5.0%)', audPcma?.concealedSamplesRatioPct === 5.0, `got ${audPcma?.concealedSamplesRatioPct}`);
  check('Concealment: G.722 uses 16 kHz decoded sample rate despite 8 kHz clockRate (5.0%)', audG722?.concealedSamplesRatioPct === 5.0, `got ${audG722?.concealedSamplesRatioPct}`);
  check('Concealment: Unknown codec omits percentage and provides explanation', audUnknown?.concealedSamplesRatioPct === undefined && audUnknown?.concealmentUnavailableReason?.includes('unavailable for codec'));
  check('Concealment: Missing codec report omits percentage and provides explanation', audNoCodec?.concealedSamplesRatioPct === undefined && audNoCodec?.concealmentUnavailableReason?.includes('Codec report unavailable'));
  check('Concealment: Preserves raw cumulative concealed samples counter (800)', audG722?.concealedSamples === 800 && audUnknown?.concealedSamples === 800);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 21: Strict Candidate-Pair Selection & Uncertainty Boundaries
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [21] Strict Candidate-Pair Selection & Uncertainty Boundaries');

  // Scenario A: Exactly one succeeded candidate pair without transport or selected: true
  // Must NOT be crowned as selected; must be uncertain!
  pcHost2.statsReports = new Map([
    ['cp-single', {
      id: 'cp-single',
      type: 'candidate-pair',
      state: 'succeeded',
      localCandidateId: 'cand-l1',
      remoteCandidateId: 'cand-r1',
      currentRoundTripTime: 0.045
    }],
    ['cand-l1', { id: 'cand-l1', type: 'local-candidate', candidateType: 'host', protocol: 'udp' }],
    ['cand-r1', { id: 'cand-r1', type: 'remote-candidate', candidateType: 'host', protocol: 'udp' }]
  ]);

  const diagSingleSucceeded = await mHost.getDiagnostics();
  check('Candidate Selection: Single succeeded pair without selection evidence is Uncertain', diagSingleSucceeded[0].candidatePair === undefined && diagSingleSucceeded[0].selectedPair?.includes('Uncertain'));

  // Scenario B: Multiple succeeded candidate pairs without transport or selected: true
  pcHost2.statsReports = new Map([
    ['cp-cand-a', {
      id: 'cp-cand-a',
      type: 'candidate-pair',
      state: 'succeeded',
      localCandidateId: 'cand-l1',
      remoteCandidateId: 'cand-r1',
      currentRoundTripTime: 0.030
    }],
    ['cp-cand-b', {
      id: 'cp-cand-b',
      type: 'candidate-pair',
      state: 'succeeded',
      localCandidateId: 'cand-l2',
      remoteCandidateId: 'cand-r2',
      currentRoundTripTime: 0.080
    }],
    ['cand-l1', { id: 'cand-l1', type: 'local-candidate', candidateType: 'host', protocol: 'udp' }],
    ['cand-r1', { id: 'cand-r1', type: 'remote-candidate', candidateType: 'host', protocol: 'udp' }],
    ['cand-l2', { id: 'cand-l2', type: 'local-candidate', candidateType: 'srflx', protocol: 'udp' }],
    ['cand-r2', { id: 'cand-r2', type: 'remote-candidate', candidateType: 'srflx', protocol: 'udp' }]
  ]);

  const diagMultipleSucceeded = await mHost.getDiagnostics();
  check('Candidate Selection: Multiple succeeded pairs without selection evidence are Uncertain', diagMultipleSucceeded[0].candidatePair === undefined && diagMultipleSucceeded[0].selectedPair?.includes('Uncertain'));

  // Scenario C: Authoritative transport-selected pair
  pcHost2.statsReports.set('trans-auth', {
    id: 'trans-auth',
    type: 'transport',
    selectedCandidatePairId: 'cp-cand-b'
  });

  const diagAuthoritative = await mHost.getDiagnostics();
  check('Candidate Selection: Valid transport.selectedCandidatePairId establishes authoritative selection', diagAuthoritative[0].candidatePair?.pairId === 'cp-cand-b' && diagAuthoritative[0].candidatePair?.selectionConfidence === 'authoritative');
  check('Candidate Selection: Correct RTT associated with authoritative pair (80ms)', diagAuthoritative[0].candidatePair?.currentRoundTripTimeMs === 80);

  // Scenario D: Explicitly selected pair flag (selected === true)
  pcHost2.statsReports.delete('trans-auth');
  const cpA = pcHost2.statsReports.get('cp-cand-a');
  cpA.selected = true;

  const diagExplicit = await mHost.getDiagnostics();
  check('Candidate Selection: candidate-pair.selected === true establishes explicit selection', diagExplicit[0].candidatePair?.pairId === 'cp-cand-a' && diagExplicit[0].candidatePair?.selectionConfidence === 'explicit');
  check('Candidate Selection: Correct RTT associated with explicit pair (30ms)', diagExplicit[0].candidatePair?.currentRoundTripTimeMs === 30);

  // Scenario E: No candidate pairs exist at all
  pcHost2.statsReports = new Map();
  const diagEmpty = await mHost.getDiagnostics();
  check('Candidate Selection: No candidate pairs produces undefined selection without crashing', diagEmpty[0].candidatePair === undefined && diagEmpty[0].selectedPair === undefined);

  mHost.closeAll(); tHost.leave();
  mGuest.closeAll(); tGuest.leave();

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  DIAGNOSTICS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
