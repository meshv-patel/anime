import { useEffect, useState } from 'react';
import { Activity, Check, Copy, RefreshCw, Shield, Wifi, X, Scroll } from 'lucide-react';
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

  const refresh = async () => {
    setLoading(true);
    try {
      const diag = await getDiagnostics();
      setData(diag);
    } catch (e) {
      console.warn('[diagnostics] error refreshing', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [isOpen, getDiagnostics]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Developer Diagnostics">
      <div className="panel flex max-h-[90vh] w-full max-w-3xl flex-col border border-white/20 bg-ink-950/95 p-5 shadow-2xl text-xs sm:text-sm">
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
                WebRTC Mesh &amp; ICE Candidate Pairs
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
              <div className="space-y-2">
                {data.webrtcPeers.map((p: any) => (
                  <div key={p.peerId} className="rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs font-mono">
                    <div className="flex flex-wrap items-center justify-between gap-1 border-b border-white/5 pb-1.5 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-paper/50">Peer:</span>
                        <span className="font-bold text-white">{p.peerId}</span>
                      </div>
                      <div className="flex items-center gap-2">
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
                      <div>
                        <span className="text-paper/50 block">Local Candidate:</span>
                        <span className="text-paper font-semibold">{p.localCandidateType ?? 'unknown'}</span>
                      </div>
                      <div>
                        <span className="text-paper/50 block">Remote Candidate:</span>
                        <span className="text-paper font-semibold">{p.remoteCandidateType ?? 'unknown'}</span>
                      </div>
                      <div>
                        <span className="text-paper/50 block">Selected Pair:</span>
                        <span className="text-paper font-semibold">{p.selectedPair ?? 'pending'}</span>
                      </div>
                      <div>
                        <span className="text-paper/50 block">Bytes (Rx / Tx):</span>
                        <span className="text-paper">
                          {p.bytesReceived ? `${Math.round(p.bytesReceived / 1024)} KB` : '0'} / {p.bytesSent ? `${Math.round(p.bytesSent / 1024)} KB` : '0'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Wishes (Ema) Database Telemetry */}
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
              {data.ema.otherRoomCards && data.ema.otherRoomCards.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-300 font-mono">
                  Note: Found {data.ema.otherRoomCards.length} cards in DB for other rooms: {data.ema.otherRoomCards.map((c: any) => c.roomId).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Section 5: Media & Transport Error Warnings */}
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
