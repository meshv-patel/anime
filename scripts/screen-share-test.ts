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
}

class MockMediaStream {
  id = 'stream-' + Math.random().toString(36).slice(2);
  private tracks: MockTrack[] = [];

  constructor(tracks: MockTrack[] = []) {
    this.tracks = tracks;
  }

  getTracks() { return [...this.tracks]; }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  addTrack(t: MockTrack) { this.tracks.push(t); }
}

let mockDisplayAudioIncluded = true;
let mockDisplayMediaShouldFail = false;

const mockMediaDevices = {
  async getDisplayMedia(constraints?: any) {
    if (mockDisplayMediaShouldFail) {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
    const tracks: MockTrack[] = [new MockTrack('video')];
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
  senders: Array<{ track: any }> = [];

  addTrack(track: any, stream: any) {
    const sender = { track };
    this.senders.push(sender);
    return sender;
  }
  removeTrack(sender: any) {
    this.senders = this.senders.filter((s) => s !== sender);
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
  check('Host receives helpful audio warning to select Browser Tab', typeof hostMedia.screenAudioWarning === 'string' && hostMedia.screenAudioWarning.includes('Browser Tab'));

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

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  SCREEN SHARING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
