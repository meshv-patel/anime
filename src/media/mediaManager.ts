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
          video: { frameRate: { ideal: 30, max: 60 } },
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
                  try { st.pc.removeTrack(ts.sender); } catch {}
                } else {
                  remaining.push(ts);
                }
              }
              st.senders.set('screen', remaining);
            }
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
      for (const ts of st.senders.get(kind) ?? []) { try { st.pc.removeTrack(ts.sender); } catch { /* already gone */ } }
      st.senders.delete(kind);
    }
    s.getTracks().forEach((t) => t.stop());
    this.announce();
    this.notify();
  }

  closeAll() {
    (Object.keys(this.local) as MediaKind[]).forEach((k) => this.stop(k));
    for (const id of [...this.pcs.keys()]) this.dropPeer(id);
    this.offs.forEach((o) => o()); this.offs = [];
    this.remote.clear(); this.announced.clear(); this.orphans.clear();
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
    if (rem) for (const k of ['mic', 'cam', 'screen'] as MediaKind[]) if (rem[k] && map[rem[k]!.id] !== k) delete rem[k];
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
        isRelay: false
      };
      try {
        if (typeof st.pc.getStats === 'function') {
          const stats = await st.pc.getStats();
          let activePair: any = null;
          for (const report of stats.values()) {
            if (report.type === 'candidate-pair' && (report.selected || report.nominated || report.state === 'succeeded')) {
              activePair = report;
              break;
            }
          }
          if (activePair) {
            diag.bytesReceived = activePair.bytesReceived;
            diag.bytesSent = activePair.bytesSent;
            const local = stats.get(activePair.localCandidateId);
            const remote = stats.get(activePair.remoteCandidateId);
            if (local) diag.localCandidateType = local.candidateType;
            if (remote) diag.remoteCandidateType = remote.candidateType;
            diag.isRelay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
            diag.selectedPair = `${local?.candidateType ?? 'unknown'} → ${remote?.candidateType ?? 'unknown'}`;
          }
        }
      } catch {
        // stats query safe failure
      }
      results.push(diag);
    }
    return results;
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
