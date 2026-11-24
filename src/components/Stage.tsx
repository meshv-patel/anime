import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Maximize,
  Minimize,
  MonitorOff,
  MonitorUp,
  RefreshCw,
  Sparkles,
  Tv,
  Upload,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { MediaSource } from '../lib/types';
import type { SyncService, SyncStatus } from '../services/syncService';
import { useVideoElement } from '../hooks/useVideoElement';
import { ControlBar } from './ControlBar';
import { CountdownOverlay, FloatLayer, FxLayer, ToastLayer } from './Overlays';
import type { FloatReaction, Fx } from '../hooks/useReactions';
import type { Toast } from '../hooks/useChat';

export interface LocalFile { url: string; name: string; size: number }

function StreamVideo({
  stream,
  muted,
  volume = 1,
  className
}: {
  stream: MediaStream | null;
  muted?: boolean;
  volume?: number;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.volume = volume;
    el.muted = muted ?? false;
    const play = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch((err) => {
          if (err.name === 'NotAllowedError') {
            setAutoplayBlocked(true);
          }
        });
      }
    };
    play();

    const handleTrackChange = () => {
      if (el.srcObject !== stream) el.srcObject = stream;
      play();
    };
    stream.addEventListener('addtrack', handleTrackChange);
    stream.addEventListener('removetrack', handleTrackChange);
    return () => {
      stream.removeEventListener('addtrack', handleTrackChange);
      stream.removeEventListener('removetrack', handleTrackChange);
    };
  }, [stream]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = volume;
      ref.current.muted = muted ?? false;
    }
  }, [volume, muted]);

  const handleUnblock = () => {
    if (ref.current) {
      ref.current.play().then(() => setAutoplayBlocked(false)).catch(() => {});
    }
  };

  return (
    <div className="relative h-full w-full">
      <video ref={ref} autoPlay playsInline muted={muted} className={className} />
      {autoplayBlocked && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm p-4 text-center">
          <button
            onClick={handleUnblock}
            className="btn-lantern flex items-center gap-2 px-6 py-3 text-sm font-extrabold shadow-2xl"
          >
            <Volume2 size={20} />
            <span>Click to enable stream audio</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  stageRef: RefObject<HTMLDivElement>;
  sync: SyncService | null;
  source: MediaSource | null;
  localFile: LocalFile | null;
  canControl: boolean;
  syncStatus: SyncStatus;
  isFs: boolean;
  fsSupported: boolean;
  onFs(): void;
  viewMode: 'video' | 'screen';
  onViewMode(m: 'video' | 'screen'): void;
  screenStream: MediaStream | null;
  screenOwner: 'me' | string | null;
  sharerName: string;
  isHost: boolean;
  hostName: string;
  screenStatus: 'idle' | 'sharing' | 'connecting' | 'ended' | 'failed';
  hasScreenAudio: boolean;
  screenAudioWarning: string | null;
  onStartScreen(): void;
  onStopScreen(): void;
  floats: FloatReaction[];
  fx: Fx[];
  toasts: Toast[];
  unread: number;
  countdown: number | null;
  theater: boolean;
  onPickLocal(f: File): void;
}

export function Stage(p: Props) {
  const [screenVolume, setScreenVolume] = useState(1);
  const [screenMuted, setScreenMuted] = useState(false);

  const url = p.source ? (p.source.kind === 'local' ? p.localFile?.url ?? null : p.source.url) : null;
  const { ref, st, adapter } = useVideoElement(url, p.source?.kind ?? null, () => p.sync?.onReady());
  const { sync } = p;
  useEffect(() => { sync?.attach(adapter); return () => sync?.attach(null); }, [sync, adapter]);

  const showScreen = p.viewMode === 'screen' && !!p.screenStream;
  const hasContent = showScreen || !!p.source;

  // Silence the background direct video player while shared screen is in front
  useEffect(() => {
    const v = ref.current;
    if (!v || !showScreen) return;
    const prev = v.muted;
    v.muted = true;
    return () => { v.muted = prev; };
  }, [showScreen, ref]);

  return (
    <div
      ref={p.stageRef}
      className={`group isolate overflow-hidden bg-black ${
        p.isFs
          ? 'fixed inset-0 z-50 h-[100dvh] w-screen max-w-[100vw] rounded-none'
          : `relative rounded-3xl shadow-[0_30px_80px_-30px_rgba(255,184,107,.35)] ring-1 ring-white/10 ${p.theater ? 'aspect-video max-h-[78vh] w-full' : 'aspect-video w-full'}`
      }`}
    >
      {/* Background Direct Video Player (Secondary) */}
      <video
        ref={ref}
        playsInline
        className={`h-full w-full bg-black object-contain ${showScreen ? 'invisible' : ''}`}
        onClick={() => (st.paused ? sync?.play() : sync?.pause())}
      />

      {/* 1. Active Screen Share (Primary Watch Experience) */}
      {showScreen && (
        <div className="absolute inset-0 bg-black">
          <StreamVideo
            stream={p.screenStream}
            volume={p.screenOwner === 'me' ? 0 : screenVolume}
            muted={p.screenOwner === 'me' ? true : screenMuted}
            className="h-full w-full object-contain"
          />

          {/* Screen Status Badges & Host Controls */}
          <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)]">
            <span className="flex items-center gap-1.5 rounded-full bg-sakura-500 px-3 py-1 text-xs font-extrabold text-white shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              {p.screenOwner === 'me' ? 'You are sharing' : `LIVE • ${p.sharerName}'s Screen`}
            </span>
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-md shadow ${p.hasScreenAudio ? 'bg-black/70 text-emerald-300 border border-emerald-500/30' : 'bg-black/70 text-amber-300 border border-amber-500/30'}`}>
              {p.hasScreenAudio ? <Volume2 size={12} /> : <VolumeX size={12} />}
              {p.hasScreenAudio ? 'Stereo Audio' : 'No Audio'}
            </span>
            {p.screenOwner === 'me' && (
              <button
                onClick={p.onStopScreen}
                className="flex items-center gap-1.5 rounded-full bg-black/75 hover:bg-sakura-600 text-white border border-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md shadow transition active:scale-95"
                title="Stop sharing your screen"
              >
                <MonitorOff size={12} />
                <span>Stop Sharing</span>
              </button>
            )}
          </div>

          {/* Host Audio Warning Notice (if no audio captured) */}
          {p.screenOwner === 'me' && p.screenAudioWarning && (
            <div className="absolute top-12 left-3 right-3 z-20 max-w-md pointer-events-none pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)]">
              <div className="text-xs text-amber-200/95 bg-black/85 backdrop-blur-md border border-amber-500/40 rounded-xl p-2.5 shadow-xl pointer-events-auto flex items-start gap-2">
                <span className="shrink-0 text-sm">💡</span>
                <p className="flex-1">{p.screenAudioWarning}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Right Controls: Accessible Fullscreen Button (Mobile & Desktop) */}
      {(hasContent || p.isFs) && (
        <div className="absolute right-3 top-3 z-30 flex items-center gap-2 pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)]">
          <button
            onClick={p.onFs}
            className="flex items-center gap-1.5 rounded-full bg-black/75 hover:bg-black text-white border border-white/25 px-3 py-1.5 text-xs font-bold backdrop-blur-md shadow-lg transition active:scale-95"
            aria-label={p.isFs ? 'Exit fullscreen' : 'Fullscreen'}
            title={p.isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {p.isFs ? <Minimize size={15} /> : <Maximize size={15} />}
            <span className="text-[11px] font-bold">{p.isFs ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      )}

      {/* 2. Screen Share Connecting State */}
      {!showScreen && p.screenStatus === 'connecting' && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950 p-6 text-center">
          <div className="max-w-md space-y-3">
            <span className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-lantern-400 mx-auto block" />
            <h3 className="font-display text-lg font-bold text-white">Connecting to {p.sharerName}'s screen share…</h3>
            <p className="text-sm text-paper/60">Establishing peer-to-peer WebRTC stream.</p>
          </div>
        </div>
      )}

      {/* 3. Screen Share Ended State */}
      {!showScreen && p.screenStatus === 'ended' && !p.source && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/95 p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-4xl" aria-hidden>🎬</p>
            <h3 className="font-display text-lg font-bold text-white">Screen share has ended</h3>
            <p className="text-sm text-paper/60">{p.sharerName || 'The host'} stopped sharing their screen.</p>
            {p.isHost && (
              <button onClick={p.onStartScreen} className="btn-lantern text-xs font-bold mt-2 inline-flex items-center gap-1.5 px-4 py-2">
                <MonitorUp size={14} /> Share Screen Again
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Screen Share Disconnected / Failed State */}
      {!showScreen && p.screenStatus === 'failed' && !p.source && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/95 p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-4xl" aria-hidden>⚠️</p>
            <h3 className="font-display text-lg font-bold text-rose-300">Screen share disconnected</h3>
            <p className="text-sm text-paper/70">The peer connection failed or was interrupted.</p>
            {p.isHost && (
              <button onClick={p.onStartScreen} className="btn-ghost text-xs font-bold mt-2 inline-flex items-center gap-1.5 px-4 py-2">
                <RefreshCw size={14} /> Retry Screen Share
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. Primary Idle Experience: Screen Sharing Call to Action */}
      {!showScreen && !p.source && p.screenStatus === 'idle' && (
        p.isHost ? (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink-950 via-ink-900 to-black p-6 text-center">
            <div className="max-w-lg space-y-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-lantern-400/10 text-lantern-400 ring-1 ring-lantern-400/30 shadow-[0_0_50px_rgba(255,184,107,0.15)]">
                <MonitorUp size={40} />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Start Watching Anime Together</h2>
                <p className="mt-1 text-sm text-paper/70">
                  Open your video in any player or browser tab, then stream it live to everyone in this room.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={p.onStartScreen}
                  className="btn-lantern flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold shadow-xl w-full sm:w-auto"
                >
                  <MonitorUp size={18} />
                  <span>Share Screen &amp; Audio</span>
                </button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-paper/70 text-left space-y-1">
                <p className="font-bold text-paper/90 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-lantern-300" />
                  How to get high-quality sound:
                </p>
                <p>
                  Choose <strong>Browser Tab</strong> (or Chrome Tab) and check <strong>&quot;Also share tab audio&quot;</strong>. Everyone will hear high-fidelity stereo audio with no speech filters!
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink-950 via-ink-900 to-black p-6 text-center">
            <div className="max-w-md space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sakura-500/10 text-sakura-400 ring-1 ring-sakura-500/20">
                <Tv size={32} className="animate-pulse" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 mb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Room Connected &amp; Ready
                </span>
                <h2 className="font-display text-xl font-bold text-white">Waiting for Host&apos;s Screen Stream</h2>
                <p className="mt-1 text-sm text-paper/70">
                  Grab your snacks! When <strong className="text-lantern-300">{p.hostName || 'the host'}</strong> shares their screen or anime tab, it will stream here live.
                </p>
              </div>
              <p className="text-xs text-paper/50 pt-2">
                🎙️ Voice chat and webcam are active while you wait — say hello below!
              </p>
            </div>
          </div>
        )
      )}

      {/* Optional fallback message if host selected a local file without screen sharing */}
      {!showScreen && p.source?.kind === 'local' && !p.localFile && p.viewMode === 'video' && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/90 p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="font-bold text-white">Host loaded local file: <span className="text-lantern-300">{p.source?.fileName}</span></p>
            <p className="text-xs text-paper/70">
              {p.isHost
                ? 'For the smoothest experience without asking guests to have the same file, share your screen instead!'
                : 'The host loaded a local video file. You can ask them to share their screen to watch together directly, or select a matching copy if you have one.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {p.isHost ? (
                <button onClick={p.onStartScreen} className="btn-lantern text-xs font-bold">
                  <MonitorUp size={14} /> Stream via Screen Share
                </button>
              ) : (
                <label className="btn-ghost text-xs cursor-pointer">
                  <Upload size={14} /> Pick local copy (optional)
                  <input type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && p.onPickLocal(e.target.files[0])} />
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video playback error & buffering (direct MP4/HLS mode) */}
      {st.error && p.viewMode === 'video' && (
        <p role="alert" className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl bg-ink-950/90 p-4 text-center text-sm">{st.error}</p>
      )}
      {st.buffering && p.viewMode === 'video' && !st.error && (
        <div className="absolute inset-0 grid place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-lantern-400" aria-label="Buffering" /></div>
      )}

      {/* Overlays */}
      <FloatLayer items={p.floats} />
      <FxLayer fx={p.fx} />
      <ToastLayer toasts={p.toasts} unread={p.unread} />
      <CountdownOverlay n={p.countdown} />

      {/* Control Bar */}
      <ControlBar
        st={st}
        canControl={p.canControl}
        syncStatus={p.syncStatus}
        isFs={p.isFs}
        fsSupported={p.fsSupported}
        viewMode={p.viewMode}
        screenAvailable={!!p.screenStream}
        screenVolume={screenVolume}
        screenMuted={screenMuted}
        hasScreenAudio={p.hasScreenAudio}
        onScreenVolume={(v) => { setScreenVolume(v); if (v > 0) setScreenMuted(false); }}
        onScreenMute={() => setScreenMuted(!screenMuted)}
        onPlayPause={() => (st.paused ? sync?.play() : sync?.pause())}
        onSeek={(t) => sync?.seek(t)}
        onVolume={(v) => { if (ref.current) { ref.current.volume = v; ref.current.muted = v === 0; } }}
        onMute={() => { if (ref.current) ref.current.muted = !ref.current.muted; }}
        onFs={p.onFs}
        onViewMode={p.onViewMode}
        onResume={() => sync?.resume()}
      />
    </div>
  );
}
