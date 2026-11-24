import type { Transport } from '../realtime/transport';

export type MediaKind = 'mic' | 'cam' | 'screen';
export interface RemoteMedia { mic?: MediaStream; cam?: MediaStream; screen?: MediaStream }
export type ScreenAudioStatus = 'active' | 'muted' | 'ended' | 'missing' | 'failed';

export interface ScreenAudioDiagnostics {
  browser: string;
  displaySurface?: string;
  hasAudioTrack: boolean;
  audioStatus: ScreenAudioStatus;
  transmissionState: 'transmitting' | 'connecting' | 'local-only' | 'none';
  videoTracksCount: number;
  audioTracksCount: number;
  videoTrackState?: string;
  audioTrackState?: string;
  audioTrackMuted?: boolean;
  addedToPeers: boolean;
  peersCount: number;
  eventsLog: Array<{ timestamp: number; type: string; detail?: string }>;
}

export interface InboundVideoDiagnostic {
  trackId?: string;
  source: MediaSourceLabel;
  ssrc?: number;
  bytesReceived?: number;
  bitrateKbps?: number;
  framesReceived?: number;
  framesDecoded?: number;
  framesDropped?: number;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  packetsReceived?: number;
  packetsLost?: number;
  packetLossPct?: number;
  frameDropRatioPct?: number;
  jitter?: number;
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
  avgJitterBufferDelayMs?: number;
  keyframesDecoded?: number;
  nackCount?: number;
  pliCount?: number;
  codec?: string;
  decoderImplementation?: string;
  totalDecodeTime?: number;
  avgDecodeTimeMs?: number;
  dropSamplingWindowMs?: number;
}

export interface OutboundVideoDiagnostic {
  trackId?: string;
  source: MediaSourceLabel;
  ssrc?: number;
  bytesSent?: number;
  bitrateKbps?: number;
  framesEncoded?: number;
  framesSent?: number;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  qualityLimitationReason?: string;
  qualityLimitationDurations?: Record<string, number>;
  retransmittedBytesSent?: number;
  retransmittedPacketsSent?: number;
  nackCount?: number;
  pliCount?: number;
  codec?: string;
  encoderImplementation?: string;
}

export interface InboundAudioDiagnostic {
  trackId?: string;
  source: MediaSourceLabel;
  ssrc?: number;
  bytesReceived?: number;
  bitrateKbps?: number;
  packetsReceived?: number;
  packetsLost?: number;
  packetLossPct?: number;
  jitter?: number;
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
  avgJitterBufferDelayMs?: number;
  audioLevel?: number;
  totalAudioEnergy?: number;
  totalSamplesDuration?: number;
  concealedSamples?: number;
  silentConcealedSamples?: number;
  concealedSamplesRatioPct?: number;
  concealmentUnavailableReason?: string;
  sampleRate?: number;
  codec?: string;
  roundTripTimeMs?: number;
  trackMuted?: boolean;
  trackEnabled?: boolean;
  audioActive?: boolean;
  audioStatus?: 'muted' | 'active' | 'silent' | 'unknown';
}

export interface OutboundAudioDiagnostic {
  trackId?: string;
  source: MediaSourceLabel;
  ssrc?: number;
  bytesSent?: number;
  bitrateKbps?: number;
  packetsSent?: number;
  retransmittedPacketsSent?: number;
  nackCount?: number;
  audioLevel?: number;
  totalAudioEnergy?: number;
  codec?: string;
  targetBitrateKbps?: number;
  trackMuted?: boolean;
  trackEnabled?: boolean;
  audioActive?: boolean;
  audioStatus?: 'muted' | 'active' | 'silent' | 'unknown';
}

export interface SelectedCandidatePairDiagnostic {
  pairId?: string;
  state?: string;
  selectionConfidence?: 'authoritative' | 'explicit' | 'uncertain';
  localCandidateType?: string;
  remoteCandidateType?: string;
  protocol?: string;
  isRelay: boolean;
  selectedPair: string;
  currentRoundTripTimeMs?: number;
  availableOutgoingBitrateKbps?: number;
  availableIncomingBitrateKbps?: number;
  bytesSent?: number;
  bytesReceived?: number;
}

export type MediaSourceLabel = 'screen' | 'cam' | 'mic' | 'screen-audio' | 'unknown';

export interface PeerDiagnostic {
  peerId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  isRelay: boolean;
  localCandidateType?: string;
  remoteCandidateType?: string;
  selectedPair?: string;
  bytesReceived?: number;
  bytesSent?: number;
  candidatePair?: SelectedCandidatePairDiagnostic;
  inboundVideo?: InboundVideoDiagnostic;
  outboundVideo?: OutboundVideoDiagnostic;
  inboundAudio?: InboundAudioDiagnostic;
  outboundAudio?: OutboundAudioDiagnostic;
  inboundVideoStreams: InboundVideoDiagnostic[];
  outboundVideoStreams: OutboundVideoDiagnostic[];
  inboundAudioStreams: InboundAudioDiagnostic[];
  outboundAudioStreams: OutboundAudioDiagnostic[];
}

export interface TrackSender {
  sender: RTCRtpSender;
  trackId: string;
  kind: MediaKind;
  mediaType: 'audio' | 'video';
}

interface PeerState {
  pc: RTCPeerConnection; polite: boolean; makingOffer: boolean; ignoreOffer: boolean;
  senders: Map<MediaKind, TrackSender[]>;
  candidateQueue: RTCIceCandidateInit[];
}

export interface RtpSampleRecord {
  timestamp: number;
  peerId?: string;
  direction?: 'inbound' | 'outbound';
  mediaType?: 'audio' | 'video';
  mediaKind?: MediaKind;
  trackId?: string;
  bytes?: number;
  packets?: number;
  packetsLost?: number;
  framesDecoded?: number;
  framesDropped?: number;
  framesReceived?: number;
  framesSent?: number;
  framesEncoded?: number;
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
  totalSamplesDuration?: number;
  concealedSamples?: number;
  totalDecodeTime?: number;
  audioEnergy?: number;
}

const num = (v: any): number | undefined => typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
const str = (v: any): string | undefined => typeof v === 'string' && v.trim() ? v.trim() : undefined;

function computeBitrateKbps(
  curBytes: number | undefined,
  curTs: number,
  prev: RtpSampleRecord | undefined
): number | undefined {
  if (curBytes === undefined || !prev || prev.bytes === undefined) return undefined;
  const deltaMs = curTs - prev.timestamp;
  if (!Number.isFinite(deltaMs) || deltaMs < 200 || deltaMs > 10000) return undefined;
  const deltaBytes = curBytes - prev.bytes;
  if (deltaBytes < 0) return undefined; // Counter reset or renegotiation
  return Math.round(((deltaBytes * 8) / (deltaMs / 1000)) / 1000);
}

function computeLossPct(
  curPackets: number | undefined,
  curLost: number | undefined,
  prev: RtpSampleRecord | undefined
): number | undefined {
  if (curPackets === undefined || curLost === undefined || !prev || prev.packets === undefined || prev.packetsLost === undefined) {
    return undefined;
  }
  const deltaPackets = curPackets - prev.packets;
  const deltaLost = curLost - prev.packetsLost;
  if (deltaPackets < 0 || deltaLost < 0) return undefined;
  const total = deltaPackets + deltaLost;
  if (total <= 0) return 0;
  return Number(((deltaLost / total) * 100).toFixed(1));
}

function computeDropRatioPct(
  curDecoded: number | undefined,
  curDropped: number | undefined,
  prev: RtpSampleRecord | undefined
): number | undefined {
  if (curDecoded === undefined || curDropped === undefined || !prev || prev.framesDecoded === undefined || prev.framesDropped === undefined) {
    return undefined;
  }
  const deltaDecoded = curDecoded - prev.framesDecoded;
  const deltaDropped = curDropped - prev.framesDropped;
  if (deltaDecoded < 0 || deltaDropped < 0) return undefined;
  const total = deltaDecoded + deltaDropped;
  if (total <= 0) return 0;
  return Number(((deltaDropped / total) * 100).toFixed(1));
}

function computeAvgJitterBufferDelayMs(
  curDelay: number | undefined,
  curEmitted: number | undefined,
  prev: RtpSampleRecord | undefined
): number | undefined {
  if (curDelay === undefined || curEmitted === undefined) return undefined;
  if (prev && prev.jitterBufferDelay !== undefined && prev.jitterBufferEmittedCount !== undefined) {
    const deltaDelay = curDelay - prev.jitterBufferDelay;
    const deltaEmitted = curEmitted - prev.jitterBufferEmittedCount;
    if (deltaEmitted > 0 && deltaDelay >= 0) {
      return Math.round((deltaDelay / deltaEmitted) * 1000);
    }
  }
  if (curEmitted > 0 && curDelay >= 0) {
    return Math.round((curDelay / curEmitted) * 1000);
  }
  return undefined;
}

function formatCodecInfo(codecId: string | undefined, codecMap: Map<string, any>): string | undefined {
  if (!codecId || !codecMap.has(codecId)) return undefined;
  const c = codecMap.get(codecId)!;
  if (!c.mimeType) return undefined;
  const cleanMime = c.mimeType.replace(/^(video|audio)\//i, '').toUpperCase();
  const parts = [cleanMime];
  if (c.clockRate) parts.push(`${c.clockRate / 1000}kHz`);
  if (c.channels && c.channels > 1) parts.push(`${c.channels}ch`);
  if (c.sdpFmtpLine) {
    const profMatch = c.sdpFmtpLine.match(/profile-level-id=([a-fA-F0-9]+)/);
    if (profMatch) parts.push(`profile ${profMatch[1]}`);
  }
  return parts.join(' • ');
}

function classifyOutboundSource(
  report: any,
  kind: 'audio' | 'video',
  st: PeerState
): MediaSourceLabel {
  const tid = report.trackIdentifier ?? report.trackId;
  for (const [mediaKind, senders] of st.senders.entries()) {
    for (const ts of senders) {
      if ((tid && ts.trackId === tid) || (ts.sender && (ts.sender as any).track?.id === tid)) {
        if (mediaKind === 'screen') {
          return ts.mediaType === 'audio' ? 'screen-audio' : 'screen';
        }
        if (mediaKind === 'mic') return 'mic';
        if (mediaKind === 'cam') return 'cam';
      }
    }
  }
  const matchingSenders: Array<{ mediaKind: MediaKind; mediaType: 'audio' | 'video' }> = [];
  for (const [mediaKind, senders] of st.senders.entries()) {
    for (const ts of senders) {
      if (ts.mediaType === kind) matchingSenders.push({ mediaKind, mediaType: ts.mediaType });
    }
  }
  if (matchingSenders.length === 1) {
    const s = matchingSenders[0];
    if (s.mediaKind === 'screen') return s.mediaType === 'audio' ? 'screen-audio' : 'screen';
    if (s.mediaKind === 'mic') return 'mic';
    if (s.mediaKind === 'cam') return 'cam';
  }
  return 'unknown';
}

function classifyInboundSource(
  report: any,
  kind: 'audio' | 'video',
  peerId: string,
  rem: RemoteMedia | undefined
): MediaSourceLabel {
  const tid = report.trackIdentifier ?? report.trackId;
  if (rem) {
    if (kind === 'video') {
      if (rem.screen && rem.screen.getVideoTracks().some(t => t.id === tid)) return 'screen';
      if (rem.cam && rem.cam.getVideoTracks().some(t => t.id === tid)) return 'cam';
      if (rem.screen && !rem.cam) return 'screen';
      if (rem.cam && !rem.screen) return 'cam';
    } else if (kind === 'audio') {
      if (rem.screen && rem.screen.getAudioTracks().some(t => t.id === tid)) return 'screen-audio';
      if (rem.mic && rem.mic.getAudioTracks().some(t => t.id === tid)) return 'mic';
      if (rem.screen && !rem.mic) return 'screen-audio';
      if (rem.mic && !rem.screen) return 'mic';
    }
  }
  return 'unknown';
}

export class MediaError extends Error {
  constructor(public code: 'unsupported' | 'insecure' | 'denied' | 'no-device' | 'busy' | 'other', message: string) { super(message); }
}

export function describeMediaError(e: unknown, kind: MediaKind): MediaError {
  if (e instanceof MediaError) return e;
  const name = (e as any)?.name as string | undefined;
  const what = kind === 'screen' ? 'screen sharing' : kind === 'mic' ? 'the microphone' : 'the camera';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (kind === 'screen') {
      return new MediaError('denied', 'Screen sharing was cancelled or permission was denied.');
    }
    return new MediaError('denied', `Permission to use ${what} was denied. Allow it in your browser's site settings and try again.`);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new MediaError('no-device', `No ${kind === 'mic' ? 'microphone' : 'camera'} was found.`);
  if (name === 'NotReadableError' || name === 'AbortError') return new MediaError('busy', `${what} is in use by another app or could not be started.`);
  return new MediaError('other', `Could not start ${what}: ${(e as Error)?.message ?? 'unknown error'}`);
}

/**
 * Mesh WebRTC manager for mic / webcam / screen. Media flows peer-to-peer; the Transport only carries signaling.
 * Uses the "perfect negotiation" pattern. Announces which stream is which kind via the `mm` event.
 * Supports N peers architecturally (full mesh), but a mesh is only comfortable for a handful of people.
 */
export class MediaManager {
  local: Partial<Record<MediaKind, MediaStream>> = {};
  remote = new Map<string, RemoteMedia>();
  lastError: MediaError | null = null;
  screenAudioWarning: string | null = null;
  screenAudioStatus: ScreenAudioStatus = 'missing';
  lastScreenState: 'idle' | 'sharing' | 'connecting' | 'ended' | 'failed' = 'idle';
  private screenAudioEvents: Array<{ timestamp: number; type: string; detail?: string }> = [];
  private screenDisplaySurface?: string;
  private audioTrackListeners = new Map<MediaStreamTrack, { ended: () => void; mute: () => void; unmute: () => void }>();
  private announced = new Map<string, Record<string, MediaKind>>(); // peer -> streamId -> kind
  private orphans = new Map<string, MediaStream>();                  // `${peer}:${streamId}` -> stream, awaiting `mm`
  private pcs = new Map<string, PeerState>();
  private rtpSamples = new Map<string, RtpSampleRecord>();
  private inFlightStats = new Map<string, Promise<any>>();
  private peerIds: string[] = [];
  private listeners = new Set<() => void>();
  private offs: Array<() => void> = [];
  version = 0;

  constructor(
    private t: Transport,
    private cfg: RTCConfiguration,
    private getHostClientId?: () => string | null
  ) {
    this.offs.push(t.on('rtc', (d, from) => void this.onSignal(from, d)));
    this.offs.push(t.on('mm', (d, from) => this.onAnnounce(from, d)));
  }

  setHostResolver(resolver: () => string | null) {
    this.getHostClientId = resolver;
  }

  subscribe(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private notify() { this.version++; this.listeners.forEach((l) => l()); }

  static support() {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    return { secure: window.isSecureContext, webrtc: typeof RTCPeerConnection !== 'undefined', screen: !!md?.getDisplayMedia, usermedia: !!md?.getUserMedia };
  }

  /** Detect browser family for diagnostics and telemetry. */
  static detectBrowser(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'Edge';
    if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') return 'Brave';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    if (/Firefox\//.test(ua)) return 'Firefox';
    return 'Other';
  }

  private logScreenEvent(type: string, detail?: string) {
    const entry = { timestamp: Date.now(), type, detail };
    this.screenAudioEvents.push(entry);
    if (this.screenAudioEvents.length > 50) this.screenAudioEvents.shift();
    if (typeof console !== 'undefined' && console.info) {
      console.info(`[media:screen] ${type}${detail ? ` - ${detail}` : ''}`);
    }
  }

  /** Who is sharing a screen right now (clientId), based on announcements and host authorization. */
  remoteSharer(): string | null {
    const hostClientId = this.getHostClientId ? this.getHostClientId() : null;
    for (const [id, map] of this.announced) {
      if (Object.values(map).includes('screen')) {
        if (!hostClientId || id === hostClientId) return id;
      }
    }
    return null;
  }
  isLocal(kind: MediaKind) { return !!this.local[kind]; }

  /** Check if the screen stream (local or remote) contains an active live audio track. */
  hasScreenAudio(clientId?: string): boolean {
    if (!clientId || clientId === this.t.clientId) {
      const s = this.local.screen;
      if (!s) return false;
      return s.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted && t.enabled);
    }
    const rem = this.remote.get(clientId)?.screen;
    if (!rem) return false;
    return rem.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted && t.enabled);
  }

  /** Current screen sharing lifecycle state for UI indicators. */
  getScreenState(): {
    state: 'idle' | 'sharing' | 'connecting' | 'ended' | 'failed';
    sharerId: string | null;
    isLocal: boolean;
    hasAudio: boolean;
    audioStatus: ScreenAudioStatus;
    transmissionState: 'transmitting' | 'connecting' | 'local-only' | 'none';
    warning: string | null;
  } {
    if (this.isLocal('screen')) {
      const hasAudio = this.hasScreenAudio();
      let audioStatus = this.screenAudioStatus;
      let transmissionState: 'transmitting' | 'connecting' | 'local-only' | 'none' = 'none';

      const audioTracks = this.local.screen?.getAudioTracks() ?? [];
      if (audioTracks.length === 0) {
        audioStatus = 'missing';
        transmissionState = 'none';
      } else if (audioTracks.some((t) => t.readyState === 'ended')) {
        audioStatus = 'ended';
        transmissionState = 'none';
      } else if (audioTracks.some((t) => t.muted || !t.enabled)) {
        audioStatus = 'muted';
        transmissionState = 'none';
      } else if (hasAudio) {
        audioStatus = 'active';
        if (this.pcs.size === 0) {
          transmissionState = 'local-only';
        } else {
          let hasConnectedPeer = false;
          for (const st of this.pcs.values()) {
            if (st.pc.connectionState === 'connected') {
              hasConnectedPeer = true;
              break;
            }
          }
          transmissionState = hasConnectedPeer ? 'transmitting' : 'connecting';
        }
      }

      return {
        state: 'sharing',
        sharerId: this.t.clientId,
        isLocal: true,
        hasAudio,
        audioStatus,
        transmissionState,
        warning: this.screenAudioWarning
      };
    }
    const remoteId = this.remoteSharer();
    if (remoteId) {
      const rem = this.remote.get(remoteId)?.screen;
      const pc = this.pcs.get(remoteId)?.pc;
      if (pc && pc.connectionState === 'failed') {
        return {
          state: 'failed',
          sharerId: remoteId,
          isLocal: false,
          hasAudio: false,
          audioStatus: 'failed',
          transmissionState: 'none',
          warning: 'WebRTC connection to host failed.'
        };
      }
      if (rem) {
        const hasAudio = this.hasScreenAudio(remoteId);
        const remAudioTracks = rem.getAudioTracks();
        let remStatus: ScreenAudioStatus = 'missing';
        if (remAudioTracks.length === 0) {
          remStatus = 'missing';
        } else if (remAudioTracks.some((t) => t.readyState === 'ended')) {
          remStatus = 'ended';
        } else if (remAudioTracks.some((t) => t.muted || !t.enabled)) {
          remStatus = 'muted';
        } else if (hasAudio) {
          remStatus = 'active';
        }
        return {
          state: 'sharing',
          sharerId: remoteId,
          isLocal: false,
          hasAudio,
          audioStatus: remStatus,
          transmissionState: hasAudio ? 'transmitting' : 'none',
          warning: null
        };
      }
      return {
        state: 'connecting',
        sharerId: remoteId,
        isLocal: false,
        hasAudio: false,
        audioStatus: 'missing',
        transmissionState: 'connecting',
        warning: null
      };
    }
    if (this.lastScreenState === 'ended') {
      return {
        state: 'ended',
        sharerId: null,
        isLocal: false,
        hasAudio: false,
        audioStatus: this.screenAudioStatus,
        transmissionState: 'none',
        warning: null
      };
    }
    if (this.lastScreenState === 'failed') {
      return {
        state: 'failed',
        sharerId: null,
        isLocal: false,
        hasAudio: false,
        audioStatus: 'failed',
        transmissionState: 'none',
        warning: this.lastError?.message ?? null
      };
    }
    return {
      state: 'idle',
      sharerId: null,
      isLocal: false,
      hasAudio: false,
      audioStatus: 'missing',
      transmissionState: 'none',
      warning: null
    };
  }

  /** Retrieve full diagnostics regarding screen-share audio capture and WebRTC transmission. */
  getScreenAudioDiagnostics(): ScreenAudioDiagnostics {
    const screen = this.local.screen;
    const videoTrack = screen?.getVideoTracks()[0];
    const audioTrack = screen?.getAudioTracks()[0];
    let peersWithAudio = 0;
    for (const st of this.pcs.values()) {
      const senders = st.senders.get('screen') ?? [];
      if (senders.some((ts) => ts.mediaType === 'audio')) {
        peersWithAudio++;
      }
    }
    const state = this.getScreenState();
    return {
      browser: MediaManager.detectBrowser(),
      displaySurface: this.screenDisplaySurface ?? videoTrack?.getSettings?.()?.displaySurface,
      hasAudioTrack: this.hasScreenAudio(),
      audioStatus: state.audioStatus,
      transmissionState: state.transmissionState,
      videoTracksCount: screen ? screen.getVideoTracks().length : 0,
      audioTracksCount: screen ? screen.getAudioTracks().length : 0,
      videoTrackState: videoTrack?.readyState,
      audioTrackState: audioTrack?.readyState,
      audioTrackMuted: audioTrack?.muted,
      addedToPeers: peersWithAudio > 0,
      peersCount: this.pcs.size,
      eventsLog: [...this.screenAudioEvents]
    };
  }

  setPeers(ids: string[]) {
    const prev = new Set(this.peerIds);
    this.peerIds = ids;
    const allKnown = new Set([...this.pcs.keys(), ...this.remote.keys(), ...this.announced.keys()]);
    for (const id of allKnown) if (!ids.includes(id)) this.dropPeer(id);
    const fresh = ids.filter((id) => !prev.has(id));
    if (fresh.length && Object.keys(this.local).length) {
      this.announce();
      for (const id of fresh) for (const k of Object.keys(this.local) as MediaKind[]) this.addTo(id, k, this.local[k]!);
    }
    this.notify();
  }

  async start(kind: MediaKind) {
    if (this.local[kind]) return;
    if (kind === 'screen' && this.getHostClientId) {
      const hostId = this.getHostClientId();
      if (hostId && hostId !== this.t.clientId) {
        throw new MediaError('denied', 'Only the room host can share screen in this room.');
      }
    }
    const sup = MediaManager.support();
    if (!sup.secure) throw new MediaError('insecure', 'Camera, microphone and screen capture need HTTPS (or localhost). Open the site over https://.');
    if (!sup.webrtc) throw new MediaError('unsupported', 'This browser does not support WebRTC.');
    if (kind === 'screen' && !sup.screen) throw new MediaError('unsupported', 'Screen sharing is not supported in this browser (it is generally unavailable on phones). Try desktop Chrome, Edge, Firefox or Safari.');
    if (kind !== 'screen' && !sup.usermedia) throw new MediaError('unsupported', 'This browser cannot access the camera or microphone.');
    let stream: MediaStream;
    try {
      if (kind === 'screen') {
        this.logScreenEvent('capture-requested', `Browser: ${MediaManager.detectBrowser()}`);
        const displayOptsTier1: any = {
          video: {
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include'
        };
        try {
          stream = await navigator.mediaDevices.getDisplayMedia(displayOptsTier1);
        } catch (displayErr1: any) {
          if (
            displayErr1?.name === 'OverconstrainedError' ||
            displayErr1?.name === 'TypeError' ||
            displayErr1?.name === 'NotSupportedError'
          ) {
            this.logScreenEvent('capture-fallback-tier2', displayErr1.message);
            try {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            } catch (displayErr2: any) {
              if (
                displayErr2?.name === 'OverconstrainedError' ||
                displayErr2?.name === 'TypeError' ||
                displayErr2?.name === 'NotSupportedError'
              ) {
                this.logScreenEvent('capture-fallback-tier3-video-only', displayErr2.message);
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
              } else {
                throw displayErr2;
              }
            }
          } else {
            throw displayErr1;
          }
        }

        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
          throw new MediaError('other', 'No video track was captured from the display.');
        }

        const videoTrack = videoTracks[0];
        if (videoTrack && 'contentHint' in videoTrack) {
          try {
            videoTrack.contentHint = 'motion';
            this.logScreenEvent('content-hint-set', 'Video track contentHint set to motion');
          } catch {
            // Non-fatal if browser restricts setting contentHint
          }
        }

        const audioTracks = stream.getAudioTracks();
        const displaySurface = videoTracks[0]?.getSettings?.()?.displaySurface;
        this.screenDisplaySurface = displaySurface;

        if (audioTracks.length > 0) {
          const audioTrack = audioTracks[0];
          this.screenAudioStatus = 'active';
          this.screenAudioWarning = null;
          this.logScreenEvent('audio-captured', `Tracks: ${audioTracks.length}, surface: ${displaySurface ?? 'unknown'}`);

          const onAudioEnded = () => {
            this.logScreenEvent('audio-track-ended', `Audio track ${audioTrack.id} ended`);
            this.screenAudioStatus = 'ended';
            this.screenAudioWarning = "Screen audio track ended or was disconnected. Video continues sharing.";
            for (const st of this.pcs.values()) {
              const senders = st.senders.get('screen') ?? [];
              const remaining: TrackSender[] = [];
              for (const ts of senders) {
                if (ts.trackId === audioTrack.id || ts.sender.track === audioTrack) {
                  this.pruneSamplesForTrack(ts.trackId);
                  try { st.pc.removeTrack(ts.sender); } catch {}
                } else {
                  remaining.push(ts);
                }
              }
              st.senders.set('screen', remaining);
            }
            this.pruneSamplesForTrack(audioTrack.id);
            this.notify();
          };

          const onAudioMute = () => {
            this.logScreenEvent('audio-track-muted', `Audio track ${audioTrack.id} muted`);
            this.notify();
          };

          const onAudioUnmute = () => {
            this.logScreenEvent('audio-track-unmuted', `Audio track ${audioTrack.id} unmuted`);
            this.notify();
          };

          audioTrack.addEventListener('ended', onAudioEnded);
          audioTrack.addEventListener('mute', onAudioMute);
          audioTrack.addEventListener('unmute', onAudioUnmute);
          this.audioTrackListeners.set(audioTrack, { ended: onAudioEnded, mute: onAudioMute, unmute: onAudioUnmute });
        } else {
          this.screenAudioStatus = 'missing';
          this.screenAudioWarning = "Your browser or selected sharing source did not provide audio. Try sharing a browser tab in Chrome or Brave.";
          this.logScreenEvent('audio-missing', `No audio tracks returned. Surface: ${displaySurface ?? 'unknown'}`);
        }

        this.lastScreenState = 'sharing';
      } else {
        stream = await navigator.mediaDevices.getUserMedia(kind === 'mic'
          ? { audio: { echoCancellation: true, noiseSuppression: true } }
          : { video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } });
      }
      this.lastError = null;
    } catch (e) {
      const err = describeMediaError(e, kind);
      this.lastError = err;
      if (kind === 'screen') {
        this.screenAudioStatus = 'failed';
        this.lastScreenState = 'failed';
      }
      throw err;
    }
    // The browser/OS can end a share (e.g. "Stop sharing" bar). Detect and clean up.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.logScreenEvent('video-track-ended', 'Screen sharing stopped by user or browser');
      this.stop(kind);
    });
    this.local[kind] = stream;
    this.announce();
    for (const id of this.peerIds) this.addTo(id, kind, stream);
    this.notify();
  }

  stop(kind: MediaKind) {
    const s = this.local[kind];
    if (!s) return;
    delete this.local[kind];
    if (kind === 'screen') {
      this.screenAudioWarning = null;
      this.screenAudioStatus = 'missing';
      this.screenDisplaySurface = undefined;
      this.lastScreenState = 'ended';
      this.logScreenEvent('screen-stopped');
      for (const [track, listeners] of this.audioTrackListeners) {
        track.removeEventListener('ended', listeners.ended);
        track.removeEventListener('mute', listeners.mute);
        track.removeEventListener('unmute', listeners.unmute);
      }
      this.audioTrackListeners.clear();
    }
    for (const st of this.pcs.values()) {
      for (const ts of st.senders.get(kind) ?? []) {
        this.pruneSamplesForTrack(ts.trackId);
        try { st.pc.removeTrack(ts.sender); } catch { /* already gone */ }
      }
      st.senders.delete(kind);
    }
    s.getTracks().forEach((t) => {
      this.pruneSamplesForTrack(t.id);
      t.stop();
    });
    this.pruneSamplesForKind(kind, 'outbound');
    this.announce();
    this.notify();
  }

  private pruneSamplesForTrack(trackId: string | undefined) {
    if (!trackId) return;
    for (const [key, rec] of this.rtpSamples.entries()) {
      if (rec.trackId === trackId || key.endsWith(`:${trackId}`)) {
        this.rtpSamples.delete(key);
      }
    }
  }

  private pruneSamplesForKind(kind: MediaKind, direction?: 'inbound' | 'outbound') {
    for (const [key, rec] of this.rtpSamples.entries()) {
      if (rec.mediaKind === kind && (!direction || rec.direction === direction)) {
        this.rtpSamples.delete(key);
      }
    }
  }

  closeAll() {
    (Object.keys(this.local) as MediaKind[]).forEach((k) => this.stop(k));
    for (const id of [...this.pcs.keys()]) this.dropPeer(id);
    this.offs.forEach((o) => o()); this.offs = [];
    this.remote.clear(); this.announced.clear(); this.orphans.clear();
    this.rtpSamples.clear();
    this.inFlightStats.clear();
  }

  // ── internals ──
  private announce() {
    const streams: Record<string, MediaKind> = {};
    for (const [k, s] of Object.entries(this.local)) streams[s!.id] = k as MediaKind;
    this.t.send('mm', { streams });
  }
  private onAnnounce(from: string, d: any) {
    if (!d || typeof d.streams !== 'object' || d.streams === null) return;
    const hostClientId = this.getHostClientId ? this.getHostClientId() : null;
    const map: Record<string, MediaKind> = {};
    for (const [id, k] of Object.entries(d.streams)) {
      if (k === 'mic' || k === 'cam') {
        map[id.slice(0, 80)] = k;
      } else if (k === 'screen') {
        // Enforce host authorization for primary screen sharing
        if (!hostClientId || from === hostClientId) {
          map[id.slice(0, 80)] = k;
        }
      }
    }
    const hadScreen = Object.values(this.announced.get(from) ?? {}).includes('screen');
    const nowHasScreen = Object.values(map).includes('screen');
    this.announced.set(from, map);
    // drop remote streams that are no longer announced
    const rem = this.remote.get(from);
    if (rem) {
      for (const k of ['mic', 'cam', 'screen'] as MediaKind[]) {
        if (rem[k] && map[rem[k]!.id] !== k) {
          rem[k]!.getTracks().forEach((t) => this.pruneSamplesForTrack(t.id));
          delete rem[k];
        }
      }
    }
    for (const [key, stream] of [...this.orphans]) if (key.startsWith(from + ':') && map[stream.id]) { this.orphans.delete(key); this.assign(from, stream); }

    if (nowHasScreen) {
      this.lastScreenState = this.remote.get(from)?.screen ? 'sharing' : 'connecting';
    } else if (hadScreen && !nowHasScreen) {
      this.lastScreenState = 'ended';
    }
    this.notify();
  }
  private assign(from: string, stream: MediaStream) {
    const kind = this.announced.get(from)?.[stream.id];
    if (!kind) { this.orphans.set(`${from}:${stream.id}`, stream); return; }
    this.remote.set(from, { ...this.remote.get(from), [kind]: stream });
    if (kind === 'screen') {
      this.lastScreenState = 'sharing';
    }
    this.notify();
  }
  private sig(to: string, payload: Record<string, unknown>) { this.t.send('rtc', { to, ...payload }); }

  /** Retrieve diagnostic snapshot of all active WebRTC peer connections and candidate pairs. */
  async getDiagnostics(): Promise<PeerDiagnostic[]> {
    const results: PeerDiagnostic[] = [];
    for (const [peerId, st] of this.pcs) {
      const diag: PeerDiagnostic = {
        peerId,
        connectionState: st.pc.connectionState,
        iceConnectionState: st.pc.iceConnectionState,
        iceGatheringState: st.pc.iceGatheringState,
        signalingState: st.pc.signalingState,
        isRelay: false,
        inboundVideoStreams: [],
        outboundVideoStreams: [],
        inboundAudioStreams: [],
        outboundAudioStreams: []
      };

      try {
        if (typeof st.pc.getStats === 'function') {
          let statsPromise = this.inFlightStats.get(peerId);
          if (!statsPromise) {
            statsPromise = st.pc.getStats();
            this.inFlightStats.set(peerId, statsPromise);
          }
          let stats: any = null;
          try {
            stats = await statsPromise;
          } finally {
            this.inFlightStats.delete(peerId);
          }

          if (stats) {
            this.processPeerStats(peerId, st, stats, diag);
          }
        }
      } catch (err) {
        console.warn(`[rtc] Failed to query stats for peer ${peerId}:`, err);
      }
      results.push(diag);
    }
    return results;
  }

  private processPeerStats(peerId: string, st: PeerState, stats: any, diag: PeerDiagnostic) {
    const reports: any[] = typeof stats.values === 'function'
      ? [...stats.values()]
      : Array.isArray(stats)
      ? stats
      : Object.values(stats);

    const getReport = (id: string) => typeof stats.get === 'function' ? stats.get(id) : reports.find((r: any) => r.id === id);

    // 1. Codec Map
    const codecMap = new Map<string, any>();
    for (const r of reports) {
      if (r.type === 'codec') {
        codecMap.set(r.id, r);
      }
    }

    // 2. Candidate Pair Resolution
    let selectedPair: any = null;
    let selectionConfidence: 'authoritative' | 'explicit' | 'uncertain' = 'uncertain';

    // Priority 1: Transport relationship (authoritative per W3C WebRTC-Stats)
    for (const r of reports) {
      if (r.type === 'transport' && r.selectedCandidatePairId) {
        selectedPair = getReport(r.selectedCandidatePairId);
        if (selectedPair) {
          selectionConfidence = 'authoritative';
          break;
        }
      }
    }
    // Priority 2: Explicitly marked selected on candidate-pair
    if (!selectedPair) {
      const explicitlySelected = reports.filter((r: any) => r.type === 'candidate-pair' && r.selected === true);
      if (explicitlySelected.length === 1) {
        selectedPair = explicitlySelected[0];
        selectionConfidence = 'explicit';
      }
    }
    // When selection cannot be established, candidate pair is indeterminate (uncertain)
    if (!selectedPair) {
      const candidatePairs = reports.filter((r: any) => r.type === 'candidate-pair');
      if (candidatePairs.length > 0) {
        diag.selectedPair = 'Uncertain (candidate pair selection indeterminate)';
      }
    }
    if (selectedPair) {
      const local = getReport(selectedPair.localCandidateId);
      const remote = getReport(selectedPair.remoteCandidateId);
      const localType = local?.candidateType ?? 'unknown';
      const remoteType = remote?.candidateType ?? 'unknown';
      const protocol = (selectedPair.protocol || local?.protocol || 'udp').toUpperCase();
      const isRelay = localType === 'relay' || remoteType === 'relay';
      const formatType = (t: string) => t === 'relay' ? 'TURN (relay)' : t === 'srflx' ? 'STUN (srflx)' : t === 'host' ? 'Host (direct)' : t;

      diag.localCandidateType = localType;
      diag.remoteCandidateType = remoteType;
      diag.isRelay = isRelay;
      diag.selectedPair = `${formatType(localType)} → ${formatType(remoteType)} (${protocol})`;
      diag.bytesSent = num(selectedPair.bytesSent);
      diag.bytesReceived = num(selectedPair.bytesReceived);

      diag.candidatePair = {
        pairId: selectedPair.id,
        state: selectedPair.state ?? 'active',
        selectionConfidence,
        localCandidateType: localType,
        remoteCandidateType: remoteType,
        protocol,
        isRelay,
        selectedPair: diag.selectedPair,
        currentRoundTripTimeMs: typeof selectedPair.currentRoundTripTime === 'number'
          ? Math.round(selectedPair.currentRoundTripTime * 1000)
          : (typeof selectedPair.totalRoundTripTime === 'number' && selectedPair.responsesReceived
            ? Math.round((selectedPair.totalRoundTripTime / selectedPair.responsesReceived) * 1000)
            : undefined),
        availableOutgoingBitrateKbps: typeof selectedPair.availableOutgoingBitrate === 'number'
          ? Math.round(selectedPair.availableOutgoingBitrate / 1000)
          : undefined,
        availableIncomingBitrateKbps: typeof selectedPair.availableIncomingBitrate === 'number'
          ? Math.round(selectedPair.availableIncomingBitrate / 1000)
          : undefined,
        bytesSent: num(selectedPair.bytesSent),
        bytesReceived: num(selectedPair.bytesReceived)
      };
    }

    // 3. Process RTP Reports
    const rem = this.remote.get(peerId);

    for (const r of reports) {
      if (r.type === 'inbound-rtp') {
        const isVideo = r.kind === 'video' || r.mediaType === 'video';
        const isAudio = r.kind === 'audio' || r.mediaType === 'audio';
        if (!isVideo && !isAudio) continue;

        const mediaType = isVideo ? 'video' : 'audio';
        const streamKey = String(r.ssrc ?? r.trackIdentifier ?? r.trackId ?? r.id);
        const sampleKey = `${peerId}:inbound:${mediaType}:${streamKey}`;
        const prev = this.rtpSamples.get(sampleKey);
        const nowTs = typeof r.timestamp === 'number' && r.timestamp > 0 ? r.timestamp : Date.now();

        const curBytes = num(r.bytesReceived);
        const curPackets = num(r.packetsReceived);
        const curLost = num(r.packetsLost);
        const curDecoded = num(r.framesDecoded);
        const curDropped = num(r.framesDropped);
        const curJitterDelay = num(r.jitterBufferDelay);
        const curJitterEmitted = num(r.jitterBufferEmittedCount);
        const curConcealed = num(r.concealedSamples);
        const curDuration = num(r.totalSamplesDuration);
        const curDecodeTime = num(r.totalDecodeTime);

        const bitrateKbps = computeBitrateKbps(curBytes, nowTs, prev);
        const packetLossPct = computeLossPct(curPackets, curLost, prev);
        const avgJitterBufferDelayMs = computeAvgJitterBufferDelayMs(curJitterDelay, curJitterEmitted, prev);

        const codec = formatCodecInfo(r.codecId, codecMap);
        const source = classifyInboundSource(r, mediaType, peerId, rem);

        if (isVideo) {
          const frameDropRatioPct = computeDropRatioPct(curDecoded, curDropped, prev);
          const dropSamplingWindowMs = prev && prev.framesDecoded !== undefined && prev.framesDropped !== undefined
            ? Math.max(0, nowTs - prev.timestamp)
            : undefined;
          let avgDecodeTimeMs: number | undefined;
          if (curDecodeTime !== undefined && curDecoded !== undefined && prev && prev.totalDecodeTime !== undefined && prev.framesDecoded !== undefined) {
            const dTime = curDecodeTime - prev.totalDecodeTime;
            const dFrames = curDecoded - prev.framesDecoded;
            if (dFrames > 0 && dTime >= 0) {
              avgDecodeTimeMs = Number(((dTime / dFrames) * 1000).toFixed(1));
            }
          }

          const iv: InboundVideoDiagnostic = {
            trackId: r.trackIdentifier ?? r.trackId,
            source,
            ssrc: num(r.ssrc),
            bytesReceived: curBytes,
            bitrateKbps,
            framesReceived: num(r.framesReceived),
            framesDecoded: curDecoded,
            framesDropped: curDropped,
            frameWidth: num(r.frameWidth),
            frameHeight: num(r.frameHeight),
            framesPerSecond: num(r.framesPerSecond),
            packetsReceived: curPackets,
            packetsLost: curLost,
            packetLossPct,
            frameDropRatioPct,
            dropSamplingWindowMs,
            jitter: num(r.jitter),
            jitterBufferDelay: curJitterDelay,
            jitterBufferEmittedCount: curJitterEmitted,
            avgJitterBufferDelayMs,
            keyframesDecoded: num(r.keyFramesDecoded),
            nackCount: num(r.nackCount),
            pliCount: num(r.pliCount),
            codec,
            decoderImplementation: str(r.decoderImplementation),
            totalDecodeTime: curDecodeTime,
            avgDecodeTimeMs
          };
          diag.inboundVideoStreams.push(iv);
        } else {
          // Inbound Audio
          // Defensible codec-specific mappings for decoded audio sample rate (not RTP clockRate)
          const codecReport = r.codecId ? codecMap.get(r.codecId) : undefined;
          let sampleRate: number | undefined;
          let concealmentUnavailableReason: string | undefined;

          const mime = (codecReport?.mimeType ?? '').toLowerCase();
          if (mime.includes('opus')) {
            // RFC 7587: Opus decoded audio sample rate in WebRTC is 48000 Hz
            sampleRate = 48000;
          } else if (mime.includes('pcmu')) {
            // RFC 3551: PCMU (G.711 u-law) decoded audio sample rate is 8000 Hz
            sampleRate = 8000;
          } else if (mime.includes('pcma')) {
            // RFC 3551: PCMA (G.711 A-law) decoded audio sample rate is 8000 Hz
            sampleRate = 8000;
          } else if (mime.includes('g722')) {
            // RFC 3551 Section 4.5.2: G.722 audio sampling rate is 16000 Hz (even though RTP clockRate is 8000 Hz)
            sampleRate = 16000;
          } else {
            concealmentUnavailableReason = codecReport
              ? `Decoded audio sample rate unavailable for codec ${codecReport.mimeType || 'unknown'}`
              : 'Codec report unavailable from WebRTC stats';
          }

          let concealedSamplesRatioPct: number | undefined;
          if (curConcealed !== undefined && curDuration !== undefined && prev && prev.concealedSamples !== undefined && prev.totalSamplesDuration !== undefined) {
            const dConcealed = curConcealed - prev.concealedSamples;
            const dDuration = curDuration - prev.totalSamplesDuration;
            if (dDuration > 0 && dConcealed >= 0) {
              if (sampleRate !== undefined) {
                const expectedSamples = dDuration * sampleRate;
                if (expectedSamples > 0) {
                  concealedSamplesRatioPct = Number(((dConcealed / expectedSamples) * 100).toFixed(1));
                }
              }
            }
          }

          const trackId = r.trackIdentifier ?? r.trackId;
          const matchedTrack = rem ? (
            source === 'screen-audio' ? rem.screen?.getAudioTracks().find(t => t.id === trackId) :
            source === 'mic' ? rem.mic?.getAudioTracks().find(t => t.id === trackId) :
            undefined
          ) : undefined;

          const audioLevel = num(r.audioLevel);
          const totalAudioEnergy = num(r.totalAudioEnergy);
          const deltaEnergy = totalAudioEnergy !== undefined && prev?.audioEnergy !== undefined ? totalAudioEnergy - prev.audioEnergy : undefined;

          let audioStatus: 'muted' | 'active' | 'silent' | 'unknown' = 'unknown';
          let audioActive = false;
          if (matchedTrack && matchedTrack.muted) {
            audioStatus = 'muted';
          } else if (audioLevel !== undefined || deltaEnergy !== undefined) {
            const hasSound = (audioLevel !== undefined && audioLevel > 0.005) || (deltaEnergy !== undefined && deltaEnergy > 0.0001);
            audioActive = hasSound;
            audioStatus = hasSound ? 'active' : 'silent';
          } else {
            audioStatus = 'unknown';
          }

          const ia: InboundAudioDiagnostic = {
            trackId,
            source,
            ssrc: num(r.ssrc),
            bytesReceived: curBytes,
            bitrateKbps,
            packetsReceived: curPackets,
            packetsLost: curLost,
            packetLossPct,
            jitter: num(r.jitter),
            jitterBufferDelay: curJitterDelay,
            jitterBufferEmittedCount: curJitterEmitted,
            avgJitterBufferDelayMs,
            audioLevel,
            totalAudioEnergy,
            totalSamplesDuration: curDuration,
            concealedSamples: curConcealed,
            silentConcealedSamples: num(r.silentConcealedSamples),
            concealedSamplesRatioPct,
            concealmentUnavailableReason,
            sampleRate,
            codec,
            roundTripTimeMs: typeof r.roundTripTime === 'number' ? Math.round(r.roundTripTime * 1000) : undefined,
            trackMuted: matchedTrack ? matchedTrack.muted : undefined,
            trackEnabled: matchedTrack ? matchedTrack.enabled : undefined,
            audioActive,
            audioStatus
          };
          diag.inboundAudioStreams.push(ia);
        }

        // Store new sample with trackId and mediaKind
        this.rtpSamples.set(sampleKey, {
          timestamp: nowTs,
          peerId,
          direction: 'inbound',
          mediaType: isVideo ? 'video' : 'audio',
          mediaKind: source === 'screen' || source === 'screen-audio' ? 'screen' : source === 'cam' ? 'cam' : source === 'mic' ? 'mic' : undefined,
          trackId: r.trackIdentifier ?? r.trackId,
          bytes: curBytes,
          packets: curPackets,
          packetsLost: curLost,
          framesDecoded: curDecoded,
          framesDropped: curDropped,
          framesReceived: num(r.framesReceived),
          jitterBufferDelay: curJitterDelay,
          jitterBufferEmittedCount: curJitterEmitted,
          totalSamplesDuration: curDuration,
          concealedSamples: curConcealed,
          totalDecodeTime: curDecodeTime,
          audioEnergy: num(r.totalAudioEnergy)
        });
      } else if (r.type === 'outbound-rtp') {
        const isVideo = r.kind === 'video' || r.mediaType === 'video';
        const isAudio = r.kind === 'audio' || r.mediaType === 'audio';
        if (!isVideo && !isAudio) continue;

        const mediaType = isVideo ? 'video' : 'audio';
        const streamKey = String(r.ssrc ?? r.trackIdentifier ?? r.trackId ?? r.id);
        const sampleKey = `${peerId}:outbound:${mediaType}:${streamKey}`;
        const prev = this.rtpSamples.get(sampleKey);
        const nowTs = typeof r.timestamp === 'number' && r.timestamp > 0 ? r.timestamp : Date.now();

        const curBytes = num(r.bytesSent);
        const curPackets = num(r.packetsSent);
        const curFramesSent = num(r.framesSent);
        const curFramesEncoded = num(r.framesEncoded);
        const bitrateKbps = computeBitrateKbps(curBytes, nowTs, prev);
        const codec = formatCodecInfo(r.codecId, codecMap);
        const source = classifyOutboundSource(r, mediaType, st);
        let outboundAudioEnergy: number | undefined;

        if (isVideo) {
          const ov: OutboundVideoDiagnostic = {
            trackId: r.trackIdentifier ?? r.trackId,
            source,
            ssrc: num(r.ssrc),
            bytesSent: curBytes,
            bitrateKbps,
            framesEncoded: curFramesEncoded,
            framesSent: curFramesSent,
            frameWidth: num(r.frameWidth),
            frameHeight: num(r.frameHeight),
            framesPerSecond: num(r.framesPerSecond),
            qualityLimitationReason: str(r.qualityLimitationReason),
            qualityLimitationDurations: typeof r.qualityLimitationDurations === 'object' && r.qualityLimitationDurations !== null ? r.qualityLimitationDurations : undefined,
            retransmittedBytesSent: num(r.retransmittedBytesSent),
            retransmittedPacketsSent: num(r.retransmittedPacketsSent),
            nackCount: num(r.nackCount),
            pliCount: num(r.pliCount),
            codec,
            encoderImplementation: str(r.encoderImplementation)
          };
          diag.outboundVideoStreams.push(ov);
        } else {
          // Outbound Audio
          const trackId = r.trackIdentifier ?? r.trackId;
          const matchedTrack = (
            source === 'screen-audio' ? this.local.screen?.getAudioTracks().find(t => t.id === trackId) :
            source === 'mic' ? this.local.mic?.getAudioTracks().find(t => t.id === trackId) :
            undefined
          );

          // Correction 1: Inspect outbound-rtp.mediaSourceId and resolve media-source report
          const mediaSource = r.mediaSourceId ? getReport(r.mediaSourceId) : undefined;
          const audioLevel = num(mediaSource?.audioLevel) ?? num(r.audioLevel);
          const totalAudioEnergy = num(mediaSource?.totalAudioEnergy) ?? num(r.totalAudioEnergy);
          outboundAudioEnergy = totalAudioEnergy;
          const deltaEnergy = totalAudioEnergy !== undefined && prev?.audioEnergy !== undefined ? totalAudioEnergy - prev.audioEnergy : undefined;

          let audioStatus: 'muted' | 'active' | 'silent' | 'unknown' = 'unknown';
          let audioActive = false;
          if (matchedTrack && matchedTrack.muted) {
            audioStatus = 'muted';
          } else if (audioLevel !== undefined || deltaEnergy !== undefined) {
            const hasSound = (audioLevel !== undefined && audioLevel > 0.005) || (deltaEnergy !== undefined && deltaEnergy > 0.0001);
            audioActive = hasSound;
            audioStatus = hasSound ? 'active' : 'silent';
          } else {
            audioStatus = 'unknown';
          }

          const oa: OutboundAudioDiagnostic = {
            trackId,
            source,
            ssrc: num(r.ssrc),
            bytesSent: curBytes,
            bitrateKbps,
            packetsSent: curPackets,
            retransmittedPacketsSent: num(r.retransmittedPacketsSent),
            nackCount: num(r.nackCount),
            audioLevel,
            totalAudioEnergy,
            codec,
            targetBitrateKbps: typeof r.targetBitrate === 'number' ? Math.round(r.targetBitrate / 1000) : undefined,
            trackMuted: matchedTrack ? matchedTrack.muted : undefined,
            trackEnabled: matchedTrack ? matchedTrack.enabled : undefined,
            audioActive,
            audioStatus
          };
          diag.outboundAudioStreams.push(oa);
        }

        // Store new sample with trackId and mediaKind
        this.rtpSamples.set(sampleKey, {
          timestamp: nowTs,
          peerId,
          direction: 'outbound',
          mediaType: isVideo ? 'video' : 'audio',
          mediaKind: source === 'screen' || source === 'screen-audio' ? 'screen' : source === 'cam' ? 'cam' : source === 'mic' ? 'mic' : undefined,
          trackId: r.trackIdentifier ?? r.trackId,
          bytes: curBytes,
          packets: curPackets,
          framesSent: curFramesSent,
          framesEncoded: curFramesEncoded,
          audioEnergy: outboundAudioEnergy
        });
      }
    }

    // Set legacy shortcuts (prioritizing screen, then first stream)
    diag.inboundVideo = diag.inboundVideoStreams.find(s => s.source === 'screen') ?? diag.inboundVideoStreams[0];
    diag.outboundVideo = diag.outboundVideoStreams.find(s => s.source === 'screen') ?? diag.outboundVideoStreams[0];
    diag.inboundAudio = diag.inboundAudioStreams.find(s => s.source === 'screen-audio') ?? diag.inboundAudioStreams[0];
    diag.outboundAudio = diag.outboundAudioStreams.find(s => s.source === 'screen-audio') ?? diag.outboundAudioStreams[0];
  }

  private createPc(id: string): PeerState {
    const pc = new RTCPeerConnection(this.cfg);
    const st: PeerState = { pc, polite: this.t.clientId < id, makingOffer: false, ignoreOffer: false, senders: new Map(), candidateQueue: [] };
    pc.onicecandidate = (e) => { if (e.candidate) this.sig(id, { candidate: e.candidate.toJSON() }); };
    pc.onnegotiationneeded = async () => {
      try { st.makingOffer = true; await pc.setLocalDescription(); this.sig(id, { description: pc.localDescription?.toJSON() }); }
      catch (e) { console.warn('[rtc] negotiation failed', e); }
      finally { st.makingOffer = false; }
    };
    pc.ontrack = (e) => { if (e.streams[0]) this.assign(id, e.streams[0]); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      this.notify();
    };
    pc.oniceconnectionstatechange = () => { this.notify(); };
    pc.onicegatheringstatechange = () => { this.notify(); };
    this.pcs.set(id, st);
    return st;
  }
  private addTo(id: string, kind: MediaKind, stream: MediaStream) {
    const st = this.pcs.get(id) ?? this.createPc(id);
    const existing = st.senders.get(kind);
    if (existing && existing.length > 0) {
      for (const ts of existing) {
        this.pruneSamplesForTrack(ts.trackId);
        try { st.pc.removeTrack(ts.sender); } catch { /* ignore */ }
      }
      st.senders.delete(kind);
    }
    const senders: TrackSender[] = [];
    for (const tr of stream.getTracks()) {
      try {
        const sender = st.pc.addTrack(tr, stream);
        senders.push({
          sender,
          trackId: tr.id,
          kind,
          mediaType: tr.kind as 'audio' | 'video'
        });
        if (kind === 'screen') {
          this.logScreenEvent('track-added-to-peer', `Peer: ${id}, track: ${tr.kind} (${tr.id})`);
          if (tr.kind === 'video' && typeof sender.getParameters === 'function') {
            try {
              const params = sender.getParameters();
              if (params && params.encodings && params.encodings.length > 0) {
                let modified = false;
                (params as any).degradationPreference = 'maintain-framerate';
                modified = true;
                const peerCount = Math.max(1, this.peerIds.length);
                const targetBitrate = peerCount > 2 ? 3_000_000 : 4_500_000;
                if (params.encodings[0].maxBitrate === undefined || params.encodings[0].maxBitrate > targetBitrate) {
                  params.encodings[0].maxBitrate = targetBitrate;
                  modified = true;
                }
                if (modified && typeof sender.setParameters === 'function') {
                  sender.setParameters(params).catch((err) => {
                    console.warn('[media] Safe setParameters notice:', err?.message);
                  });
                }
              }
            } catch {
              // Gracefully handle unsupported getParameters/setParameters
            }
          }
        }
      } catch (e) {
        console.warn(`[media] Failed to add track ${tr.kind} to peer ${id}`, e);
      }
    }
    st.senders.set(kind, senders);
  }
  private dropPeer(id: string) {
    const st = this.pcs.get(id);
    if (st) { st.pc.ontrack = null; st.pc.onicecandidate = null; st.pc.onnegotiationneeded = null; st.pc.close(); this.pcs.delete(id); }
    this.remote.delete(id); this.announced.delete(id);
    this.inFlightStats.delete(id);
    for (const k of [...this.rtpSamples.keys()]) {
      if (k.startsWith(`${id}:`)) this.rtpSamples.delete(k);
    }
    for (const k of [...this.orphans.keys()]) if (k.startsWith(id + ':')) this.orphans.delete(k);
    this.notify();
  }

  private async onSignal(from: string, d: any) {
    if (!d || d.to !== this.t.clientId) return;
    // SEC-03 fix: Validate sender is in the authorized room roster before allocating resources.
    // Reject unknown or departed peers to prevent unbounded RTCPeerConnection allocation.
    if (!this.peerIds.includes(from)) return;
    // SEC-03 fix: Enforce maximum peer connection count based on room capacity.
    // Room max is typically 6-12; we allow up to 12 peers (max room size).
    const MAX_PEERS = 12;
    if (this.pcs.size >= MAX_PEERS && !this.pcs.has(from)) return;
    const st = this.pcs.get(from) ?? this.createPc(from);
    try {
      if (d.description && typeof d.description.type === 'string') {
        const collision = d.description.type === 'offer' && (st.makingOffer || st.pc.signalingState !== 'stable');
        st.ignoreOffer = !st.polite && collision;
        if (st.ignoreOffer) return;
        await st.pc.setRemoteDescription(d.description);
        if (st.candidateQueue.length) {
          for (const cand of st.candidateQueue) {
            try { await st.pc.addIceCandidate(cand); } catch (e) { console.warn('[rtc] queued candidate error', e); }
          }
          st.candidateQueue = [];
        }
        if (d.description.type === 'offer') {
          await st.pc.setLocalDescription();
          this.sig(from, { description: st.pc.localDescription?.toJSON() });
        }
      } else if (d.candidate) {
        if (!st.pc.remoteDescription) {
          st.candidateQueue.push(d.candidate);
        } else {
          try { await st.pc.addIceCandidate(d.candidate); } catch (e) { if (!st.ignoreOffer) console.warn('[rtc] candidate', e); }
        }
      }
    } catch (e) { console.warn('[rtc] signal error', e); }
  }
}
