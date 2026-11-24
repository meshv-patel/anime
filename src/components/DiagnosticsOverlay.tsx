import { useEffect, useState, useRef } from 'react';
import { Activity, Check, Copy, RefreshCw, Shield, Wifi, X, Scroll, Monitor, Video, Mic, Volume2 } from 'lucide-react';
import { env, liveConfigured } from '../lib/env';

interface DiagnosticsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  getDiagnostics: () => Promise<any>;
}

export function DiagnosticsOverlay({ isOpen, onClose, getDiagnostics }: DiagnosticsOverlayProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep a stable ref so polling interval is never torn down/recreated on parent renders
  const getDiagRef = useRef(getDiagnostics);
  getDiagRef.current = getDiagnostics;

  const refresh = async () => {
    setLoading(true);
    try {
      const diag = await getDiagRef.current();
      setData(diag);
    } catch (e) {
      console.warn('[diagnostics] error refreshing', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const diag = await getDiagRef.current();
        if (!cancelled) {
          setData(diag);
        }
      } catch (e) {
        console.warn('[diagnostics] polling error', e);
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const timer = setInterval(() => { void poll(); }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (isOpen && e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!data) return;
    const sanitized = {
      ...data,
      env: {
        liveConfigured,
        stunUrlsCount: env.stunUrls.length,
        turnConfigured: Boolean(env.turnUrl),
        privateChannels: env.privateChannels
      }
    };
    void navigator.clipboard?.writeText(JSON.stringify(sanitized, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSourceBadge = (source: string, type: 'video' | 'audio', isOutbound: boolean) => {
    if (source === 'screen') {
      return (
        <span className="flex items-center gap-1 rounded bg-sakura-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sakura-300 border border-sakura-500/30">
          <Monitor size={10} />
          {isOutbound ? 'Local Screen' : 'Remote Screen'}
        </span>
      );
    }
    if (source === 'cam') {
      return (
        <span className="flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-500/30">
          <Video size={10} />
          {isOutbound ? 'Local Webcam' : 'Remote Webcam'}
        </span>
      );
    }
    if (source === 'screen-audio') {
      return (
        <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
          <Volume2 size={10} />
          {isOutbound ? 'Screen Audio' : 'Remote Screen Audio'}
        </span>
      );
    }
    if (source === 'mic') {
      return (
        <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
          <Mic size={10} />
          {isOutbound ? 'Local Mic' : 'Remote Mic'}
        </span>
      );
    }
    return (
      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-paper/70 font-mono">
        {type === 'video' ? 'Video Stream' : 'Audio Stream'} (unlabeled)
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Developer Diagnostics">
      <div className="panel flex max-h-[92vh] w-full max-w-4xl flex-col border border-white/20 bg-ink-950/95 p-5 shadow-2xl text-xs sm:text-sm">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="text-lantern-400" size={18} />
            <h2 className="font-display text-base font-bold text-white">Diagnostics &amp; WebRTC Telemetry</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${liveConfigured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
              {liveConfigured ? 'Supabase Live Mode' : 'Local Demo Mode'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="icon-btn"
              title="Refresh telemetry"
              aria-label="Refresh telemetry"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleCopy}
              className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-xs"
              title="Copy telemetry JSON to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
            </button>
            <button onClick={onClose} className="icon-btn text-paper/70 hover:text-white" aria-label="Close diagnostics">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Section 1: Session & Transport */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 font-bold text-paper">
              <Wifi size={14} className="text-sky-400" />
              Session &amp; Transport
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs font-mono">
              <div>
                <span className="text-paper/50 block">Status:</span>
                <span className={`font-bold ${data?.connectionStatus === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {data?.connectionStatus ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-paper/50 block">Sync Status:</span>
                <span className="font-bold text-paper">{data?.syncStatus ?? '—'}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Room ID:</span>
                <span className="font-bold text-paper truncate block" title={data?.roomId}>{data?.roomId ?? '—'}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Peers Present:</span>
                <span className="font-bold text-paper">{data?.peerCount ?? 0}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Role:</span>
                <span className={`font-bold ${data?.isHost ? 'text-lantern-400' : 'text-paper/80'}`}>
                  {data?.isHost ? 'Host 👑' : 'Guest'}
                </span>
              </div>
              <div>
                <span className="text-paper/50 block">Client ID:</span>
                <span className="text-paper/70 truncate block" title={data?.clientId}>{data?.clientId ?? '—'}</span>
              </div>
              <div>
                <span className="text-paper/50 block">User ID:</span>
                <span className="text-paper/70 truncate block" title={data?.userId}>{data?.userId ? `${data.userId.slice(0, 8)}…` : '—'}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Host ID:</span>
                <span className="text-paper/70 truncate block" title={data?.hostId}>{data?.hostId ? `${data.hostId.slice(0, 8)}…` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Security & Monotonicity */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 font-bold text-paper">
              <Shield size={14} className="text-lantern-400" />
              Security &amp; Sequence Verification
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs font-mono">
              <div>
                <span className="text-paper/50 block">Host Epoch:</span>
                <span className="font-bold text-sky-300">{data?.hostEpoch ?? 1}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Authoritative Seq:</span>
                <span className="font-bold text-sky-300">{data?.hostSeq ?? 0}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Receiver Last Seq:</span>
                <span className="font-bold text-emerald-300">{data?.clientLastSeq ?? 0}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Stored Baseline:</span>
                <span className="font-bold text-paper">{data?.storedSeqBaseline ?? 0}</span>
              </div>
              <div>
                <span className="text-paper/50 block">Host-Only Control:</span>
                <span className={`font-bold ${data?.hostOnly ? 'text-lantern-300' : 'text-paper/60'}`}>
                  {data?.hostOnly ? 'Enforced' : 'Off (Open)'}
                </span>
              </div>
              <div>
                <span className="text-paper/50 block">Non-Extractable Key:</span>
                <span className={`font-bold ${data?.hasPrivateKey ? 'text-emerald-300' : 'text-paper/40'}`}>
                  {data?.hasPrivateKey ? 'Active in Memory' : 'N/A (Guest)'}
                </span>
              </div>
              <div>
                <span className="text-paper/50 block">Host PubKey Fingerprint:</span>
                <span className="text-paper/80 font-mono text-[11px] truncate block" title={data?.hostPubkeyFingerprint ?? 'None'}>
                  {data?.hostPubkeyFingerprint ?? 'None'}
                </span>
              </div>
              <div>
                <span className="text-paper/50 block">Host Token Hash:</span>
                <span className={`font-bold ${data?.hasHostTokenHash ? 'text-emerald-300' : 'text-paper/40'}`}>
                  {data?.hasHostTokenHash ? 'Registered' : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: WebRTC & ICE Candidate Analysis */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold text-paper">
                <Activity size={14} className="text-emerald-400" />
                WebRTC Mesh, Streams &amp; Candidate Pairs
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-paper/60">
                <span>STUN Servers: {env.stunUrls.length}</span>
                <span>•</span>
                <span className={env.turnUrl ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  TURN Configured: {env.turnUrl ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {(!data?.webrtcPeers || data.webrtcPeers.length === 0) ? (
              <p className="text-paper/50 text-xs italic py-2">No active WebRTC peer connections established yet.</p>
            ) : (
              <div className="space-y-3">
                {data.webrtcPeers.map((p: any) => {
                  const inboundVideos = p.inboundVideoStreams ?? (p.inboundVideo ? [p.inboundVideo] : []);
                  const outboundVideos = p.outboundVideoStreams ?? (p.outboundVideo ? [p.outboundVideo] : []);
                  const inboundAudios = p.inboundAudioStreams ?? (p.inboundAudio ? [p.inboundAudio] : []);
                  const outboundAudios = p.outboundAudioStreams ?? (p.outboundAudio ? [p.outboundAudio] : []);

                  return (
                    <div key={p.peerId} className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs font-mono space-y-2.5">
                      {/* Connection Overview */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-paper/50">Peer:</span>
                          <span className="font-bold text-white">{p.peerId}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            p.connectionState === 'connected' ? 'bg-emerald-500/20 text-emerald-300' :
                            p.connectionState === 'connecting' ? 'bg-amber-500/20 text-amber-300' :
                            'bg-sakura-500/20 text-sakura-300'
                          }`}>
                            PC: {p.connectionState}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            p.iceConnectionState === 'connected' || p.iceConnectionState === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                            'bg-amber-500/20 text-amber-300'
                          }`}>
                            ICE: {p.iceConnectionState}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            p.isRelay ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40' : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {p.isRelay ? '🟢 TURN RELAY' : '⚪ DIRECT / STUN'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px] bg-white/5 p-2 rounded">
                        <div>
                          <span className="text-paper/50 block">Selected Pair:</span>
                          <span className="text-paper font-semibold truncate block" title={p.candidatePair?.selectedPair ?? p.selectedPair}>
                            {p.candidatePair?.selectedPair ?? p.selectedPair ?? 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-paper/50 block">Current RTT:</span>
                          <span className={`font-semibold ${p.candidatePair?.currentRoundTripTimeMs && p.candidatePair.currentRoundTripTimeMs > 100 ? 'text-amber-300' : 'text-paper'}`}>
                            {p.candidatePair?.currentRoundTripTimeMs !== undefined ? `${p.candidatePair.currentRoundTripTimeMs} ms` : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-paper/50 block">Available Bitrate:</span>
                          <span className="text-paper">
                            {p.candidatePair?.availableOutgoingBitrateKbps !== undefined ? `Out: ${p.candidatePair.availableOutgoingBitrateKbps} kbps` : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-paper/50 block">Total Bytes (Rx / Tx):</span>
                          <span className="text-paper">
                            {p.bytesReceived ? `${Math.round(p.bytesReceived / 1024)} KB` : '0'} / {p.bytesSent ? `${Math.round(p.bytesSent / 1024)} KB` : '0'}
                          </span>
                        </div>
                      </div>

                      {/* Video Streams */}
                      {(inboundVideos.length > 0 || outboundVideos.length > 0) && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold text-sky-300 block flex items-center gap-1">
                            <Video size={12} /> Video Streams ({inboundVideos.length + outboundVideos.length})
                          </span>

                          {/* Inbound Video */}
                          {inboundVideos.map((v: any, idx: number) => (
                            <div key={`iv-${idx}-${v.ssrc || v.trackId}`} className="border border-white/5 bg-white/[0.02] p-2 rounded text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-paper/80">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-400 font-bold">⬇ INBOUND</span>
                                  {formatSourceBadge(v.source, 'video', false)}
                                  {v.codec && <span className="text-paper/50">({v.codec})</span>}
                                </div>
                                <span className="text-lantern-300 font-bold">
                                  {v.bitrateKbps !== undefined ? `${v.bitrateKbps} kbps` : 'Bitrate N/A'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-paper/70">
                                <div><span className="text-paper/40">Resolution: </span>{v.frameWidth && v.frameHeight ? `${v.frameWidth}x${v.frameHeight} @ ${v.framesPerSecond ?? '—'}fps` : 'N/A'}</div>
                                <div><span className="text-paper/40">Decoded / Dropped (Total): </span>{v.framesDecoded ?? 0} / {v.framesDropped ?? 0}</div>
                                <div><span className="text-paper/40">Drop Rate (Recent): </span>{v.frameDropRatioPct !== undefined ? `${v.frameDropRatioPct}% (${v.dropSamplingWindowMs ? `${(v.dropSamplingWindowMs / 1000).toFixed(1)}s window` : 'recent'})` : 'N/A'}</div>
                                <div><span className="text-paper/40">Jitter: </span>{v.jitter !== undefined ? `${(v.jitter * 1000).toFixed(1)}ms` : 'N/A'} • Buf: {v.avgJitterBufferDelayMs !== undefined ? `${v.avgJitterBufferDelayMs}ms` : 'N/A'}</div>
                                <div><span className="text-paper/40">Packets Loss: </span>{v.packetLossPct !== undefined ? `${v.packetLossPct}%` : `${v.packetsLost ?? 0} lost`}</div>
                              </div>
                            </div>
                          ))}

                          {/* Outbound Video */}
                          {outboundVideos.map((v: any, idx: number) => (
                            <div key={`ov-${idx}-${v.ssrc || v.trackId}`} className="border border-white/5 bg-white/[0.02] p-2 rounded text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-paper/80">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sky-400 font-bold">⬆ OUTBOUND</span>
                                  {formatSourceBadge(v.source, 'video', true)}
                                  {v.codec && <span className="text-paper/50">({v.codec})</span>}
                                </div>
                                <span className="text-lantern-300 font-bold">
                                  {v.bitrateKbps !== undefined ? `${v.bitrateKbps} kbps` : 'Bitrate N/A'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-paper/70">
                                <div><span className="text-paper/40">Resolution: </span>{v.frameWidth && v.frameHeight ? `${v.frameWidth}x${v.frameHeight} @ ${v.framesPerSecond ?? '—'}fps` : 'N/A'}</div>
                                <div><span className="text-paper/40">Frames Sent: </span>{v.framesSent ?? 0} (enc: {v.framesEncoded ?? 0})</div>
                                <div><span className="text-paper/40">Quality Limitation: </span><span className={v.qualityLimitationReason && v.qualityLimitationReason !== 'none' ? 'text-amber-300 font-bold' : ''}>{v.qualityLimitationReason ?? 'none'}</span></div>
                                <div><span className="text-paper/40">Retransmitted: </span>{v.retransmittedPacketsSent ?? 0} pkts</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Audio Streams */}
                      {(inboundAudios.length > 0 || outboundAudios.length > 0) && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold text-amber-300 block flex items-center gap-1">
                            <Volume2 size={12} /> Audio Streams ({inboundAudios.length + outboundAudios.length})
                          </span>

                          {/* Inbound Audio */}
                          {inboundAudios.map((a: any, idx: number) => (
                            <div key={`ia-${idx}-${a.ssrc || a.trackId}`} className="border border-white/5 bg-white/[0.02] p-2 rounded text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-paper/80">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-400 font-bold">⬇ INBOUND</span>
                                  {formatSourceBadge(a.source, 'audio', false)}
                                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                    a.audioStatus === 'muted' || a.trackMuted ? 'bg-amber-500/20 text-amber-300' :
                                    a.audioStatus === 'active' ? 'bg-emerald-500/20 text-emerald-300' :
                                    a.audioStatus === 'silent' ? 'bg-white/10 text-paper/60' :
                                    'bg-white/5 text-paper/40'
                                  }`}>
                                    {a.audioStatus === 'muted' || a.trackMuted ? '🔇 Muted' :
                                     a.audioStatus === 'active' ? '🔊 Active Audio' :
                                     a.audioStatus === 'silent' ? '🔈 Silent / Idle' :
                                     '🔈 Activity N/A'}
                                  </span>
                                  {a.codec && <span className="text-paper/50">({a.codec})</span>}
                                </div>
                                <span className="text-lantern-300 font-bold">
                                  {a.bitrateKbps !== undefined ? `${a.bitrateKbps} kbps` : 'Bitrate N/A'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-paper/70">
                                <div><span className="text-paper/40">Packets Rcvd / Lost: </span>{a.packetsReceived ?? 0} / {a.packetsLost ?? 0} {a.packetLossPct !== undefined ? `(${a.packetLossPct}%)` : ''}</div>
                                <div><span className="text-paper/40">Jitter: </span>{a.jitter !== undefined ? `${(a.jitter * 1000).toFixed(1)}ms` : 'N/A'} • Buf: {a.avgJitterBufferDelayMs !== undefined ? `${a.avgJitterBufferDelayMs}ms` : 'N/A'}</div>
                                <div>
                                  <span className="text-paper/40">Concealment: </span>
                                  {a.concealedSamplesRatioPct !== undefined
                                    ? `${a.concealedSamplesRatioPct}%`
                                    : a.concealedSamples !== undefined
                                    ? `${a.concealedSamples} samples (${a.concealmentUnavailableReason ?? 'rate N/A'})`
                                    : 'N/A'}
                                </div>
                                <div><span className="text-paper/40">Audio Level: </span>{a.audioLevel !== undefined ? `${Math.round(a.audioLevel * 100)}%` : 'N/A'}</div>
                              </div>
                            </div>
                          ))}

                          {/* Outbound Audio */}
                          {outboundAudios.map((a: any, idx: number) => (
                            <div key={`oa-${idx}-${a.ssrc || a.trackId}`} className="border border-white/5 bg-white/[0.02] p-2 rounded text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-paper/80">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sky-400 font-bold">⬆ OUTBOUND</span>
                                  {formatSourceBadge(a.source, 'audio', true)}
                                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                    a.audioStatus === 'muted' || a.trackMuted ? 'bg-amber-500/20 text-amber-300' :
                                    a.audioStatus === 'active' ? 'bg-emerald-500/20 text-emerald-300' :
                                    a.audioStatus === 'silent' ? 'bg-white/10 text-paper/60' :
                                    'bg-white/5 text-paper/40'
                                  }`}>
                                    {a.audioStatus === 'muted' || a.trackMuted ? '🔇 Muted' :
                                     a.audioStatus === 'active' ? '🔊 Active Audio' :
                                     a.audioStatus === 'silent' ? '🔈 Silent / Idle' :
                                     '🔈 Activity N/A'}
                                  </span>
                                  {a.codec && <span className="text-paper/50">({a.codec})</span>}
                                </div>
                                <span className="text-lantern-300 font-bold">
                                  {a.bitrateKbps !== undefined ? `${a.bitrateKbps} kbps` : 'Bitrate N/A'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-paper/70">
                                <div><span className="text-paper/40">Packets Sent: </span>{a.packetsSent ?? 0}</div>
                                <div><span className="text-paper/40">Retransmitted: </span>{a.retransmittedPacketsSent ?? 0} pkts</div>
                                <div><span className="text-paper/40">Target Bitrate: </span>{a.targetBitrateKbps !== undefined ? `${a.targetBitrateKbps} kbps` : 'N/A'}</div>
                                <div><span className="text-paper/40">Audio Level: </span>{a.audioLevel !== undefined ? `${Math.round(a.audioLevel * 100)}%` : 'N/A'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Metric Interpretation Reference */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-[10px] text-paper/60 space-y-1">
            <span className="font-bold text-paper/80 block">Metric Interpretation Reference:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
              <p>• <span className="text-paper/80 font-semibold">Sampled Bitrate:</span> Measured throughput over the recent 2-second interval (8 × Δbytes / Δt).</p>
              <p>• <span className="text-paper/80 font-semibold">Jitter Buffer:</span> Dynamic receive buffer delay absorbing inter-packet arrival jitter.</p>
              <p>• <span className="text-paper/80 font-semibold">Loss / Drop %:</span> Calculated strictly from consecutive counter deltas, never lifetime averages.</p>
              <p>• <span className="text-paper/80 font-semibold">N/A:</span> Metric omitted by the current browser/OS WebRTC implementation.</p>
            </div>
          </div>

          {/* Section 5: Wishes (Ema) Database Telemetry */}
          {data?.ema && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 font-bold text-paper">
                <Scroll size={14} className="text-lantern-400" />
                Wishes (Ema) Database Telemetry
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs font-mono">
                <div>
                  <span className="text-paper/50 block">Target Room:</span>
                  <span className="text-paper font-bold truncate block" title={data.ema.currentRoomId}>{data.ema.currentRoomId ?? '—'}</span>
                </div>
                <div>
                  <span className="text-paper/50 block">Queried Room:</span>
                  <span className="text-paper font-bold truncate block" title={data.ema.storeRoomId}>{data.ema.storeRoomId ?? '—'}</span>
                </div>
                <div>
                  <span className="text-paper/50 block">DB Rows Returned:</span>
                  <span className={`font-bold ${data.ema.rowsReturned > 0 ? 'text-emerald-300' : 'text-paper'}`}>
                    {data.ema.rowsReturned ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-paper/50 block">React State Count:</span>
                  <span className="text-paper font-bold">{data.ema.reactStateCount ?? 0}</span>
                </div>
                <div>
                  <span className="text-paper/50 block">Query Status:</span>
                  <span className={`font-bold ${data.ema.queryError ? 'text-rose-400' : 'text-emerald-300'}`}>
                    {data.ema.queryError ? 'Error' : 'Healthy'}
                  </span>
                </div>
                <div>
                  <span className="text-paper/50 block">Other Room Cards:</span>
                  <span className={`font-bold ${data.ema.otherRoomCards?.length > 0 ? 'text-amber-300' : 'text-paper/60'}`}>
                    {data.ema.otherRoomCards?.length ?? 0} detected
                  </span>
                </div>
              </div>
              {data.ema.queryError && (
                <div className="mt-2 text-rose-300 text-xs font-mono">
                  DB Error: {data.ema.queryError}
                </div>
              )}
            </div>
          )}

          {/* Section 6: Media & Transport Error Warnings */}
          {data?.lastTransportError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <span className="font-bold">Realtime Transport Warning: </span>
              {data.lastTransportError}
            </div>
          )}
          {data?.lastMediaError && (
            <div className="rounded-xl border border-sakura-500/30 bg-sakura-500/10 p-3 text-xs text-sakura-200">
              <span className="font-bold">Last Media Error: </span>
              {data.lastMediaError}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-paper/50">
          <span>Toggle with shortcut: <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white">Ctrl</kbd> + <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white">Shift</kbd> + <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white">D</kbd></span>
          <span>Telemetry poll: 2000ms</span>
        </div>
      </div>
    </div>
  );
}
