/**
 * Screen Sharing & WebRTC Watch Experience Test Suite.
 * Validates the primary playback experience: host screen sharing with audio,
 * guest stream reception, missing audio warnings, simultaneous voice chat,
 * clean teardown, host disconnect, and error handling.
 */

import { LocalTransport } from '../src/realtime/localTransport';
import { MediaManager, MediaError, type MediaKind } from '../src/media/mediaManager';

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
  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event: string, fn: Function) {
    this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== fn);
  }
}

let mockDisplayAudioIncluded = true;
let mockDisplayMediaShouldFail = false;
let mockDisplayFailTier1 = false;
let mockDisplaySurfaceType = 'browser';
let mockDisplayConstraintsHistory: any[] = [];

const mockMediaDevices = {
  async getDisplayMedia(constraints?: any) {
    mockDisplayConstraintsHistory.push(constraints);
    if (mockDisplayMediaShouldFail) {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
    if (mockDisplayFailTier1 && constraints?.systemAudio) {
      const err = new Error('Invalid constraint');
      err.name = 'TypeError';
      throw err;
    }
    const vTrack = new MockTrack('video');
    vTrack.displaySurface = mockDisplaySurfaceType;
    const tracks: MockTrack[] = [vTrack];
    if (mockDisplayAudioIncluded) {
      tracks.push(new MockTrack('audio'));
    }
    return new MockMediaStream(tracks) as any;
  },
  async getUserMedia(constraints?: any) {
    const tracks: MockTrack[] = [];
    if (constraints.audio) tracks.push(new MockTrack('audio'));
    if (constraints.video) tracks.push(new MockTrack('video'));
    return new MockMediaStream(tracks) as any;
  }
};

class MockSender {
  params: any = { encodings: [{}] };
  constructor(public track: any) {}
  getParameters() { return JSON.parse(JSON.stringify(this.params)); }
  async setParameters(p: any) { this.params = p; }
}

class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'connected';
  iceConnectionState: RTCIceConnectionState = 'connected';
  signalingState: RTCSignalingState = 'stable';
  onicecandidate: ((e: any) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  ontrack: ((e: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  localDescription: any = null;
  remoteDescription: any = null;
  senders: Array<any> = [];

  addTrack(track: any, stream: any) {
    const sender = new MockSender(track);
    this.senders.push(sender);
    return sender;
  }
  removeTrack(sender: any) {
    this.senders = this.senders.filter((s) => s !== sender);
  }
  async getStats() {
    const map = new Map<string, any>();
    map.set('inbound-video', {
      type: 'inbound-rtp',
      kind: 'video',
      framesDecoded: 120,
      framesDropped: 2,
      framesReceived: 122,
      frameWidth: 1920,
      frameHeight: 1080,
      framesPerSecond: 30,
      jitter: 0.005,
      jitterBufferDelay: 0.05,
      jitterBufferEmittedCount: 120,
      packetsLost: 1,
      bytesReceived: 1000000,
      timestamp: 1000
    });
    map.set('outbound-video', {
      type: 'outbound-rtp',
      kind: 'video',
      framesSent: 122,
      frameWidth: 1920,
      frameHeight: 1080,
      framesPerSecond: 30,
      bytesSent: 1000000,
      qualityLimitationReason: 'none',
      timestamp: 1000
    });
    return map;
  }
  async createOffer() { return { type: 'offer', sdp: 'mock-offer' }; }
  async createAnswer() { return { type: 'answer', sdp: 'mock-answer' }; }
  async setLocalDescription(desc?: any) { this.localDescription = desc || { type: 'offer', sdp: 'mock-local' }; }
  async setRemoteDescription(desc: any) { this.remoteDescription = desc; }
  async addIceCandidate(cand: any) {}
  restartIce() {}
  close() { this.connectionState = 'closed'; }
}

// Attach mocks to global environment
(globalThis as any).window = { isSecureContext: true };
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: mockMediaDevices },
  configurable: true
});
(globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as any).MediaStream = MockMediaStream;

async function run() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  ANIME TOGETHER — SCREEN SHARING PRIMARY WATCH EXPERIENCE TESTS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const roomId = 'room-screen-test-999';
  const hostTransport = new LocalTransport(roomId);
  const guestTransport = new LocalTransport(roomId);

  const dummyIce: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const hostMedia = new MediaManager(hostTransport, dummyIce);
  const guestMedia = new MediaManager(guestTransport, dummyIce);

  hostTransport.join({ userId: 'host-uid', nickname: 'HostSenpai', avatar: '🌸|#f4a6c0', joinedAt: 1000 });
  guestTransport.join({ userId: 'guest-uid', nickname: 'GuestKohai', avatar: '🦊|#ffb86b', joinedAt: 2000 });

  hostMedia.setPeers([guestTransport.clientId]);
  guestMedia.setPeers([hostTransport.clientId]);

  await sleep(50);

  console.log('▶ [1] Host Starts Screen Sharing (Video + Audio Captured)');
  mockDisplayAudioIncluded = true;
  mockDisplayMediaShouldFail = false;

  await hostMedia.start('screen');

  check('Host isLocal("screen") is true after starting share', hostMedia.isLocal('screen'));
  check('Host screen has video tracks', hostMedia.local.screen!.getVideoTracks().length === 1);
  check('Host screen has audio track when tab audio is shared', hostMedia.local.screen!.getAudioTracks().length === 1);
  check('Host hasScreenAudio() returns true', hostMedia.hasScreenAudio());
  check('Host screenAudioWarning is null when audio is present', hostMedia.screenAudioWarning === null);

  const hostState = hostMedia.getScreenState();
  check('Host getScreenState() reports "sharing"', hostState.state === 'sharing');
  check('Host getScreenState() identifies local sharing', hostState.isLocal === true);
  check('Host getScreenState() reports audio active', hostState.hasAudio === true);

  console.log('\n▶ [2] Guest Stream Reception & Remote Sharer Discovery');
  await sleep(100);

  check('Guest discovers Host as remoteSharer()', guestMedia.remoteSharer() === hostTransport.clientId);
  const guestStateBeforeTrack = guestMedia.getScreenState();
  check('Guest getScreenState() reports "connecting" or "sharing"', guestStateBeforeTrack.state === 'connecting' || guestStateBeforeTrack.state === 'sharing');

  // Simulate WebRTC track delivery to guest's peer connection
  const guestStream = new MockMediaStream([new MockTrack('video'), new MockTrack('audio')]);
  guestStream.id = hostMedia.local.screen!.id;
  (guestMedia as any).assign(hostTransport.clientId, guestStream);

  await sleep(50);

  const guestStateAfterTrack = guestMedia.getScreenState();
  check('Guest getScreenState() reports "sharing" after track assignment', guestStateAfterTrack.state === 'sharing');
  check('Guest identifies Host as remote sharer ID', guestStateAfterTrack.sharerId === hostTransport.clientId);
  check('Guest detects audio track on remote stream', guestMedia.hasScreenAudio(hostTransport.clientId));

  console.log('\n▶ [3] Missing Audio Warning & Instructions');
  // Stop existing screen and test sharing without audio
  hostMedia.stop('screen');
  mockDisplayAudioIncluded = false;

  await hostMedia.start('screen');
  check('Host is sharing video without audio', hostMedia.isLocal('screen') && !hostMedia.hasScreenAudio());
  check('Host receives helpful audio warning to select Browser Tab', typeof hostMedia.screenAudioWarning === 'string' && hostMedia.screenAudioWarning.toLowerCase().includes('browser tab'));

  console.log('\n▶ [4] Simultaneous Voice Chat & Screen Share');
  // Host and Guest both enable mic while screen share is active
  await hostMedia.start('mic');
  await guestMedia.start('mic');

  check('Host has both local screen and local mic active', hostMedia.isLocal('screen') && hostMedia.isLocal('mic'));
  check('Guest has local mic active', guestMedia.isLocal('mic'));

  // Simulate delivery of mic tracks and new screen stream
  const newScreenStream = new MockMediaStream([new MockTrack('video')]);
  newScreenStream.id = hostMedia.local.screen!.id;
  (guestMedia as any).assign(hostTransport.clientId, newScreenStream);

  const hostMicStream = new MockMediaStream([new MockTrack('audio')]);
  hostMicStream.id = hostMedia.local.mic!.id;
  const guestMicStream = new MockMediaStream([new MockTrack('audio')]);
  guestMicStream.id = guestMedia.local.mic!.id;
  (guestMedia as any).assign(hostTransport.clientId, hostMicStream);
  (hostMedia as any).assign(guestTransport.clientId, guestMicStream);

  await sleep(50);

  const guestRemoteMedia = guestMedia.remote.get(hostTransport.clientId);
  check('Guest has remote mic from host', Boolean(guestRemoteMedia?.mic));
  check('Guest has remote screen from host alongside mic', Boolean(guestRemoteMedia?.screen));

  console.log('\n▶ [5] Screen Sharing Stops Cleanly');
  hostMedia.stop('screen');

  check('Host isLocal("screen") is false after stopping', !hostMedia.isLocal('screen'));
  check('Host mic remains active after screen share stops', hostMedia.isLocal('mic'));

  await sleep(100);

  const guestRemoteAfterStop = guestMedia.remote.get(hostTransport.clientId);
  check('Guest remote screen is removed', !guestRemoteAfterStop?.screen);
  check('Guest remote mic is preserved after screen share ends', Boolean(guestRemoteAfterStop?.mic));
  check('Guest getScreenState() reports "ended" or "idle"', guestMedia.getScreenState().state === 'ended' || guestMedia.getScreenState().state === 'idle');

  console.log('\n▶ [6] Host Disconnects While Sharing');
  // Start screen again, then host drops connection
  await hostMedia.start('screen');
  await sleep(50);
  check('Host re-started screen share', hostMedia.isLocal('screen'));

  // Host closes media and leaves
  hostMedia.closeAll();
  hostTransport.leave();
  guestMedia.setPeers([]);

  await sleep(50);

  check('Guest drops host peer connection cleanly', guestMedia.remoteSharer() === null);
  check('Guest getScreenState() transitions cleanly when host departs', guestMedia.getScreenState().state === 'ended' || guestMedia.getScreenState().state === 'idle');

  console.log('\n▶ [7] Error Handling & Picker Cancellation');
  mockDisplayMediaShouldFail = true;
  let caughtError: any = null;
  try {
    await hostMedia.start('screen');
  } catch (e: any) {
    caughtError = e;
  }

  check('Picker cancellation or denial throws MediaError', caughtError instanceof MediaError);
  check('Error message explains cancellation gracefully', caughtError?.message?.includes('cancelled') || caughtError?.message?.includes('denied'));
  check('Host lastScreenState marks "failed"', hostMedia.lastScreenState === 'failed');

  // Clean up initial pair
  guestMedia.closeAll();
  guestTransport.leave();

  console.log('\n▶ [8] Multi-Participant Late Joining');
  mockDisplayMediaShouldFail = false;
  mockDisplayAudioIncluded = true;

  const lateRoomId = 'room-late-join-777';
  const lateHostTrans = new LocalTransport(lateRoomId);
  const lateGuestATrans = new LocalTransport(lateRoomId);

  const lateHostMedia = new MediaManager(lateHostTrans, dummyIce, () => lateHostTrans.clientId);
  const lateGuestAMedia = new MediaManager(lateGuestATrans, dummyIce, () => lateHostTrans.clientId);

  lateHostTrans.join({ userId: 'host-uid', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  lateGuestATrans.join({ userId: 'guest-a-uid', nickname: 'GuestA', avatar: '🦊|#fff', joinedAt: 200 });

  lateHostMedia.setPeers([lateGuestATrans.clientId]);
  lateGuestAMedia.setPeers([lateHostTrans.clientId]);
  await sleep(30);

  // Host starts sharing to Guest A
  await lateHostMedia.start('screen');
  await sleep(50);
  check('Late test: Host is sharing screen', lateHostMedia.isLocal('screen'));
  check('Late test: Guest A sees Host as remoteSharer', lateGuestAMedia.remoteSharer() === lateHostTrans.clientId);

  // Now Guest B joins late
  const lateGuestBTrans = new LocalTransport(lateRoomId);
  const lateGuestBMedia = new MediaManager(lateGuestBTrans, dummyIce, () => lateHostTrans.clientId);
  lateGuestBTrans.join({ userId: 'guest-b-uid', nickname: 'GuestB', avatar: '🐼|#fff', joinedAt: 300 });

  // Host presence updates with Guest B
  lateHostMedia.setPeers([lateGuestATrans.clientId, lateGuestBTrans.clientId]);
  lateGuestBMedia.setPeers([lateHostTrans.clientId, lateGuestATrans.clientId]);
  await sleep(80);

  // Verify Host announced to Guest B and registered senders for Guest B
  check('Late test: Guest B automatically detects Host as remoteSharer without Host restarting', lateGuestBMedia.remoteSharer() === lateHostTrans.clientId);
  check('Late test: Guest B screen state is connecting or sharing', lateGuestBMedia.getScreenState().state === 'connecting' || lateGuestBMedia.getScreenState().state === 'sharing');

  // Simulate delivery of screen stream to Guest B
  const lateGuestBStream = new MockMediaStream([new MockTrack('video'), new MockTrack('audio')]);
  lateGuestBStream.id = lateHostMedia.local.screen!.id;
  (lateGuestBMedia as any).assign(lateHostTrans.clientId, lateGuestBStream);
  await sleep(30);

  check('Late test: Guest B successfully transitioned to sharing state', lateGuestBMedia.getScreenState().state === 'sharing');
  check('Late test: Guest B has audio track on received stream', lateGuestBMedia.hasScreenAudio(lateHostTrans.clientId));

  lateHostMedia.closeAll(); lateHostTrans.leave();
  lateGuestAMedia.closeAll(); lateGuestATrans.leave();
  lateGuestBMedia.closeAll(); lateGuestBTrans.leave();

  console.log('\n▶ [9] Security & Anti-Spoofing: Host Screen-Share Authorization');
  const secRoomId = 'room-sec-screenshare-888';
  const secHostTrans = new LocalTransport(secRoomId);
  const secGuestTrans = new LocalTransport(secRoomId);

  const secHostMedia = new MediaManager(secHostTrans, dummyIce, () => secHostTrans.clientId);
  const secGuestMedia = new MediaManager(secGuestTrans, dummyIce, () => secHostTrans.clientId);

  secHostTrans.join({ userId: 'sec-host', nickname: 'LegitHost', avatar: '👑|#fff', joinedAt: 100 });
  secGuestTrans.join({ userId: 'sec-guest', nickname: 'AttackerGuest', avatar: '🥷|#fff', joinedAt: 200 });

  secHostMedia.setPeers([secGuestTrans.clientId]);
  secGuestMedia.setPeers([secHostTrans.clientId]);
  await sleep(30);

  // 1. Guest attempts to call start('screen') directly
  let guestStartErr: any = null;
  try {
    await secGuestMedia.start('screen');
  } catch (e) {
    guestStartErr = e;
  }
  check('Unauthorized guest calling start("screen") is BLOCKED', guestStartErr instanceof MediaError && guestStartErr.code === 'denied');
  check('Unauthorized guest local screen remains inactive', !secGuestMedia.isLocal('screen'));

  // 2. Guest attempts to spoof an mm announcement packet claiming to be the screen sharer
  secGuestTrans.send('mm', { streams: { 'rogue-stream-id': 'screen' } });
  await sleep(50);

  check('Host ignores rogue mm screen announcement from non-host', secHostMedia.remoteSharer() === null);
  check('Host lastScreenState remains idle', secHostMedia.getScreenState().state === 'idle');

  // 3. Host legitimately starts screen share
  await secHostMedia.start('screen');
  await sleep(50);
  check('Legitimate host screen share is accepted by guest', secGuestMedia.remoteSharer() === secHostTrans.clientId);

  // 4. Guest again attempts to spoof an mm announcement to override the host screen
  secGuestTrans.send('mm', { streams: { 'rogue-stream-2': 'screen' } });
  await sleep(50);
  check('Host remains the authoritative remoteSharer despite spoof attempt', secGuestMedia.remoteSharer() === secHostTrans.clientId);

  secHostMedia.closeAll(); secHostTrans.leave();
  secGuestMedia.closeAll(); secGuestTrans.leave();

  console.log('\n▶ [10] Audio Track Ending Mid-Sharing (Video Continues, Audio Transitions to Ended)');
  mockDisplayMediaShouldFail = false;
  mockDisplayAudioIncluded = true;
  mockDisplayFailTier1 = false;

  const testTrans1 = new LocalTransport('room-audio-ended-test');
  const testTrans2 = new LocalTransport('room-audio-ended-test');
  const testMediaHost = new MediaManager(testTrans1, dummyIce, () => testTrans1.clientId);
  const testMediaGuest = new MediaManager(testTrans2, dummyIce, () => testTrans1.clientId);

  testTrans1.join({ userId: 'u1', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  testTrans2.join({ userId: 'u2', nickname: 'Guest', avatar: '🦊|#fff', joinedAt: 200 });
  testMediaHost.setPeers([testTrans2.clientId]);
  testMediaGuest.setPeers([testTrans1.clientId]);
  await sleep(30);

  await testMediaHost.start('screen');
  check('Audio-ended test: Host started sharing with audio', testMediaHost.hasScreenAudio());
  check('Audio-ended test: Initial audioStatus is "active"', testMediaHost.getScreenState().audioStatus === 'active');

  const hostAudioTrack = testMediaHost.local.screen!.getAudioTracks()[0];
  const hostVideoTrack = testMediaHost.local.screen!.getVideoTracks()[0];
  check('Audio-ended test: Audio track exists', Boolean(hostAudioTrack));

  // Simulate audio track ending during share (e.g. user unshared tab audio)
  hostAudioTrack.stop();
  await sleep(30);

  check('Audio-ended test: Video track is still live after audio track ended', hostVideoTrack.readyState === 'live');
  check('Audio-ended test: Screen share is still active (video continues)', testMediaHost.isLocal('screen'));
  check('Audio-ended test: hasScreenAudio() is now false', !testMediaHost.hasScreenAudio());
  check('Audio-ended test: audioStatus transitioned to "ended"', testMediaHost.getScreenState().audioStatus === 'ended');
  check('Audio-ended test: Warning informs host that audio track ended', typeof testMediaHost.screenAudioWarning === 'string' && testMediaHost.screenAudioWarning.includes('ended'));

  testMediaHost.closeAll(); testTrans1.leave();
  testMediaGuest.closeAll(); testTrans2.leave();

  console.log('\n▶ [11] Repeated Start/Stop Screen Sharing (No Duplicate Audio Senders)');
  const repTrans1 = new LocalTransport('room-repeat-share-test');
  const repTrans2 = new LocalTransport('room-repeat-share-test');
  const repMediaHost = new MediaManager(repTrans1, dummyIce, () => repTrans1.clientId);
  const repMediaGuest = new MediaManager(repTrans2, dummyIce, () => repTrans1.clientId);

  repTrans1.join({ userId: 'r1', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  repTrans2.join({ userId: 'r2', nickname: 'Guest', avatar: '🦊|#fff', joinedAt: 200 });
  repMediaHost.setPeers([repTrans2.clientId]);
  repMediaGuest.setPeers([repTrans1.clientId]);
  await sleep(30);

  // Cycle 1
  await repMediaHost.start('screen');
  await sleep(20);
  repMediaHost.stop('screen');

  // Cycle 2
  await repMediaHost.start('screen');
  await sleep(20);
  repMediaHost.stop('screen');

  // Cycle 3
  await repMediaHost.start('screen');
  await sleep(20);

  const pcSenders = (repMediaHost as any).pcs.get(repTrans2.clientId)?.senders.get('screen') ?? [];
  check('Repeat test: Screen is currently sharing', repMediaHost.isLocal('screen'));
  check('Repeat test: Exactly 2 senders registered for peer (1 video, 1 audio; no duplicates)', pcSenders.length === 2);
  check('Repeat test: Host screen has exactly 1 audio track and 1 video track', repMediaHost.local.screen!.getAudioTracks().length === 1 && repMediaHost.local.screen!.getVideoTracks().length === 1);

  repMediaHost.closeAll(); repTrans1.leave();
  repMediaGuest.closeAll(); repTrans2.leave();

  console.log('\n▶ [12] Safari-Style Video-Only Capture (Tier-1 Fallback, Friendly Warning)');
  mockDisplayFailTier1 = true;
  mockDisplayAudioIncluded = false;
  mockDisplaySurfaceType = 'window';

  const safariTrans1 = new LocalTransport('room-safari-test');
  const safariMediaHost = new MediaManager(safariTrans1, dummyIce, () => safariTrans1.clientId);
  safariTrans1.join({ userId: 'safari-host', nickname: 'SafariHost', avatar: '🍎|#fff', joinedAt: 100 });

  await safariMediaHost.start('screen');
  check('Safari test: Screen share succeeded via progressive fallback', safariMediaHost.isLocal('screen'));
  check('Safari test: Video track captured', safariMediaHost.local.screen!.getVideoTracks().length === 1);
  check('Safari test: Audio track is not present (as in Safari/WebKit)', safariMediaHost.local.screen!.getAudioTracks().length === 0);
  check('Safari test: hasScreenAudio() is false', !safariMediaHost.hasScreenAudio());
  check('Safari test: audioStatus reports "missing"', safariMediaHost.getScreenState().audioStatus === 'missing');
  check('Safari test: Warning advises sharing browser tab in Chrome or Brave', safariMediaHost.screenAudioWarning === 'Your browser or selected sharing source did not provide audio. Try sharing a browser tab in Chrome or Brave.');

  safariMediaHost.closeAll(); safariTrans1.leave();
  mockDisplayFailTier1 = false;
  mockDisplayAudioIncluded = true;
  mockDisplaySurfaceType = 'browser';

  console.log('\n▶ [13] Chromium-Style Tab Audio Capture (Stereo Audio Hints & displaySurface)');
  mockDisplayConstraintsHistory = [];
  const chromeTrans1 = new LocalTransport('room-chrome-test');
  const chromeMediaHost = new MediaManager(chromeTrans1, dummyIce, () => chromeTrans1.clientId);
  chromeTrans1.join({ userId: 'chrome-host', nickname: 'ChromeHost', avatar: '💻|#fff', joinedAt: 100 });

  await chromeMediaHost.start('screen');
  const lastConstraints = mockDisplayConstraintsHistory[mockDisplayConstraintsHistory.length - 1];

  check('Chrome test: Initial getDisplayMedia constraints requested systemAudio: "include"', lastConstraints?.systemAudio === 'include');
  check('Chrome test: selfBrowserSurface: "exclude" hint provided', lastConstraints?.selfBrowserSurface === 'exclude');
  check('Chrome test: surfaceSwitching: "include" hint provided', lastConstraints?.surfaceSwitching === 'include');
  check('Chrome test: audio constraints requested stereo/high-fidelity audio', lastConstraints?.audio?.echoCancellation === false);
  check('Chrome test: Screen sharing is active with audio', chromeMediaHost.hasScreenAudio());
  check('Chrome test: screenAudioWarning is null', chromeMediaHost.screenAudioWarning === null);

  chromeMediaHost.closeAll(); chromeTrans1.leave();

  console.log('\n▶ [14] Audio Status & Diagnostics Telemetry (getScreenAudioDiagnostics)');
  const diagTrans1 = new LocalTransport('room-diag-test');
  const diagTrans2 = new LocalTransport('room-diag-test');
  const diagMediaHost = new MediaManager(diagTrans1, dummyIce, () => diagTrans1.clientId);
  const diagMediaGuest = new MediaManager(diagTrans2, dummyIce, () => diagTrans1.clientId);

  diagTrans1.join({ userId: 'dh', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  diagTrans2.join({ userId: 'dg', nickname: 'Guest', avatar: '🦊|#fff', joinedAt: 200 });
  diagMediaHost.setPeers([diagTrans2.clientId]);
  diagMediaGuest.setPeers([diagTrans1.clientId]);
  await sleep(30);

  await diagMediaHost.start('screen');
  const diag = diagMediaHost.getScreenAudioDiagnostics();

  check('Diagnostics: Detects browser string', typeof diag.browser === 'string');
  check('Diagnostics: displaySurface is "browser"', diag.displaySurface === 'browser');
  check('Diagnostics: hasAudioTrack is true', diag.hasAudioTrack === true);
  check('Diagnostics: audioStatus is "active"', diag.audioStatus === 'active');
  check('Diagnostics: videoTracksCount is 1', diag.videoTracksCount === 1);
  check('Diagnostics: audioTracksCount is 1', diag.audioTracksCount === 1);
  check('Diagnostics: addedToPeers is true', diag.addedToPeers === true);
  check('Diagnostics: Event log records screen events', diag.eventsLog.length > 0);
  check('Diagnostics: Event log contains "capture-requested" and "audio-captured"', diag.eventsLog.some((e) => e.type === 'capture-requested') && diag.eventsLog.some((e) => e.type === 'audio-captured'));

  diagMediaHost.closeAll(); diagTrans1.leave();
  diagMediaGuest.closeAll(); diagTrans2.leave();

  console.log('\n▶ [15] Strict RTCRtpSender Isolation: Independent Microphone, Screen Audio, and Video');
  const isoTrans1 = new LocalTransport('room-iso-test');
  const isoTrans2 = new LocalTransport('room-iso-test');
  const isoMediaHost = new MediaManager(isoTrans1, dummyIce, () => isoTrans1.clientId);
  const isoMediaGuest = new MediaManager(isoTrans2, dummyIce, () => isoTrans1.clientId);

  isoTrans1.join({ userId: 'h-iso', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  isoTrans2.join({ userId: 'g-iso', nickname: 'Guest', avatar: '🦊|#fff', joinedAt: 200 });
  isoMediaHost.setPeers([isoTrans2.clientId]);
  isoMediaGuest.setPeers([isoTrans1.clientId]);
  await sleep(30);

  const getPc = (m: MediaManager, peerId: string) => (m as any).pcs.get(peerId);

  // 1. Start microphone alone
  await isoMediaHost.start('mic');
  const hostMicTrack = isoMediaHost.local.mic!.getAudioTracks()[0];
  const st1 = getPc(isoMediaHost, isoTrans2.clientId);
  const micSenders = st1.senders.get('mic') ?? [];

  check('Isolation: Mic is local active', isoMediaHost.isLocal('mic'));
  check('Isolation: Mic sender allocated under "mic"', micSenders.length === 1);
  check('Isolation: Mic sender track matches mic audio track', micSenders[0].trackId === hostMicTrack.id);
  check('Isolation: Mic sender mediaType is "audio"', micSenders[0].mediaType === 'audio');

  // 2. Start screen sharing with video + audio while mic is already active
  await isoMediaHost.start('screen');
  const hostScreenVidTrack = isoMediaHost.local.screen!.getVideoTracks()[0];
  const hostScreenAudTrack = isoMediaHost.local.screen!.getAudioTracks()[0];
  const screenSenders = st1.senders.get('screen') ?? [];
  const micSendersAfterScreenStart = st1.senders.get('mic') ?? [];

  check('Isolation: Screen is local active with video & audio', isoMediaHost.isLocal('screen') && isoMediaHost.hasScreenAudio());
  check('Isolation: Screen senders allocated under "screen" (1 video, 1 audio)', screenSenders.length === 2);
  check('Isolation: Mic sender was NOT removed when screen share started', micSendersAfterScreenStart.length === 1 && micSendersAfterScreenStart[0].trackId === hostMicTrack.id);
  check('Isolation: PC total senders includes both mic and screen (total 3)', st1.pc.senders.length === 3);

  // 3. Start webcam (cam) while both mic and screen are active
  await isoMediaHost.start('cam');
  const camSenders = st1.senders.get('cam') ?? [];
  check('Isolation: Cam sender allocated under "cam"', camSenders.length === 1);
  check('Isolation: Cam start did NOT disturb mic sender', st1.senders.get('mic')?.length === 1);
  check('Isolation: Cam start did NOT disturb screen senders', st1.senders.get('screen')?.length === 2);
  check('Isolation: PC total senders is now 4 (1 mic audio, 1 screen audio, 1 screen video, 1 cam video)', st1.pc.senders.length === 4);

  // 4. Stop screen sharing: must remove only screen senders (video & audio), keeping mic and cam
  isoMediaHost.stop('screen');
  check('Isolation: Screen share is stopped', !isoMediaHost.isLocal('screen'));
  check('Isolation: Screen senders deleted from senders map', !st1.senders.has('screen'));
  check('Isolation: Stopping screen sharing PRESERVED mic sender', st1.senders.get('mic')?.length === 1 && st1.senders.get('mic')[0].trackId === hostMicTrack.id);
  check('Isolation: Stopping screen sharing PRESERVED cam sender', st1.senders.get('cam')?.length === 1);
  check('Isolation: PC total senders reduced from 4 to 2 (only screen tracks removed)', st1.pc.senders.length === 2);

  // 5. Restart screen sharing: must not create duplicate senders
  await isoMediaHost.start('screen');
  check('Isolation: Screen re-started', isoMediaHost.isLocal('screen'));
  check('Isolation: Screen senders count is exactly 2 (no duplicates)', st1.senders.get('screen')?.length === 2);
  check('Isolation: Mic sender remains exactly 1 (no duplicates)', st1.senders.get('mic')?.length === 1);
  check('Isolation: Cam sender remains exactly 1 (no duplicates)', st1.senders.get('cam')?.length === 1);
  check('Isolation: Total senders on PC is 4', st1.pc.senders.length === 4);

  // 6. Stop microphone: must remove only mic sender, keeping screen (video + audio) and cam
  isoMediaHost.stop('mic');
  check('Isolation: Mic stopped', !isoMediaHost.isLocal('mic'));
  check('Isolation: Mic senders deleted from senders map', !st1.senders.has('mic'));
  check('Isolation: Stopping mic PRESERVED screen senders (both video and audio intact)', st1.senders.get('screen')?.length === 2);
  check('Isolation: Stopping mic PRESERVED cam sender', st1.senders.get('cam')?.length === 1);
  check('Isolation: PC total senders reduced to 3 (only mic track removed)', st1.pc.senders.length === 3);

  // 7. Restart microphone: must re-add mic sender cleanly without touching screen
  await isoMediaHost.start('mic');
  check('Isolation: Mic re-started', isoMediaHost.isLocal('mic'));
  check('Isolation: Mic senders count is exactly 1', st1.senders.get('mic')?.length === 1);
  check('Isolation: Screen senders remain exactly 2', st1.senders.get('screen')?.length === 2);
  check('Isolation: Cam sender remains exactly 1', st1.senders.get('cam')?.length === 1);
  check('Isolation: Total senders on PC restored to 4', st1.pc.senders.length === 4);

  // 8. Test audio mute and transmissionState
  const newScreenAudioTrack = isoMediaHost.local.screen!.getAudioTracks()[0];
  newScreenAudioTrack.mute();
  check('Status test: Screen audioStatus is "muted" when track is muted', isoMediaHost.getScreenState().audioStatus === 'muted');
  check('Status test: hasScreenAudio() is false when track is muted', !isoMediaHost.hasScreenAudio());

  newScreenAudioTrack.unmute();
  check('Status test: Screen audioStatus returns to "active" when unmuted', isoMediaHost.getScreenState().audioStatus === 'active');
  check('Status test: hasScreenAudio() returns true when unmuted', isoMediaHost.hasScreenAudio());

  isoMediaHost.closeAll(); isoTrans1.leave();
  isoMediaGuest.closeAll(); isoTrans2.leave();

  console.log('\n▶ [16] WebRTC Screen-Share Streaming Optimization & Inbound/Outbound Diagnostics');
  const optTrans1 = new LocalTransport('room-opt-test');
  const optTrans2 = new LocalTransport('room-opt-test');
  const optMediaHost = new MediaManager(optTrans1, dummyIce, () => optTrans1.clientId);
  const optMediaGuest = new MediaManager(optTrans2, dummyIce, () => optTrans1.clientId);

  optTrans1.join({ userId: 'h-opt', nickname: 'Host', avatar: '🌸|#fff', joinedAt: 100 });
  optTrans2.join({ userId: 'g-opt', nickname: 'Guest', avatar: '🦊|#fff', joinedAt: 200 });
  optMediaHost.setPeers([optTrans2.clientId]);
  optMediaGuest.setPeers([optTrans1.clientId]);
  await sleep(30);

  mockDisplayConstraintsHistory = [];
  await optMediaHost.start('screen');
  const hostScreenVid = optMediaHost.local.screen!.getVideoTracks()[0];
  const lastScreenConstraints = mockDisplayConstraintsHistory[mockDisplayConstraintsHistory.length - 1];

  check('Optimization: Screen capture caps resolution to 1080p ideal / 1440p max in Tier 1',
    lastScreenConstraints?.video?.width?.ideal === 1920 &&
    lastScreenConstraints?.video?.width?.max === 2560 &&
    lastScreenConstraints?.video?.height?.ideal === 1080 &&
    lastScreenConstraints?.video?.height?.max === 1440
  );
  check('Optimization: Screen capture caps framerate to 30 fps max',
    lastScreenConstraints?.video?.frameRate?.max === 30
  );
  check('Optimization: Video track sets contentHint to "motion"',
    hostScreenVid.contentHint === 'motion'
  );

  const optSt1 = getPc(optMediaHost, optTrans2.clientId);
  const screenSenderEntries = optSt1.senders.get('screen') ?? [];
  const screenVidSender = screenSenderEntries.find((s: any) => s.mediaType === 'video');
  check('Optimization: Screen video sender has adaptive maxBitrate configured',
    screenVidSender?.sender?.params?.encodings?.[0]?.maxBitrate >= 3_000_000 &&
    screenVidSender?.sender?.params?.encodings?.[0]?.maxBitrate <= 4_500_000
  );
  check('Optimization: Screen video sender specifies maintain-framerate degradation preference',
    screenVidSender?.sender?.params?.degradationPreference === 'maintain-framerate'
  );

  const diagHost = await optMediaHost.getDiagnostics();
  check('Diagnostics: getDiagnostics() inspects RTP stats without throwing', diagHost.length === 1);
  check('Diagnostics: Populates inboundVideo telemetry', !!diagHost[0].inboundVideo && diagHost[0].inboundVideo.framesDecoded === 120);
  check('Diagnostics: Populates outboundVideo telemetry', !!diagHost[0].outboundVideo && diagHost[0].outboundVideo.framesSent === 122);
  check('Diagnostics: Tracks frame dimensions and framerate in RTP stats', diagHost[0].inboundVideo?.framesPerSecond === 30 && diagHost[0].inboundVideo?.frameWidth === 1920);

  optMediaHost.closeAll(); optTrans1.leave();
  optMediaGuest.closeAll(); optTrans2.leave();

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  SCREEN SHARING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
