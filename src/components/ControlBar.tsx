import { Maximize, Minimize, Pause, Play, Volume2, VolumeX, MonitorUp, Film } from 'lucide-react';
import { useState } from 'react';
import type { SyncStatus } from '../services/syncService';
import type { VideoState } from '../hooks/useVideoElement';

const fmt = (s: number) => { const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`; };
const STATUS: Record<SyncStatus, { t: string; c: string }> = {
  idle: { t: 'No video yet', c: 'bg-white/10 text-paper/70' }, synced: { t: 'In sync', c: 'bg-emerald-400/20 text-emerald-300' },
  correcting: { t: 'Catching up…', c: 'bg-lantern-400/20 text-lantern-300' }, 'waiting-source': { t: 'Waiting for video', c: 'bg-lantern-400/20 text-lantern-300' },
  'needs-interaction': { t: 'Tap to join playback', c: 'bg-sakura-400/30 text-sakura-200' }
};

interface Props {
  st: VideoState; canControl: boolean; syncStatus: SyncStatus; isFs: boolean; fsSupported: boolean;
  viewMode: 'video' | 'screen'; screenAvailable: boolean;
  screenVolume?: number; screenMuted?: boolean; hasScreenAudio?: boolean;
  onPlayPause(): void; onSeek(t: number): void; onVolume(v: number): void; onMute(): void;
  onScreenVolume?(v: number): void; onScreenMute?(): void;
  onFs(): void; onViewMode(m: 'video' | 'screen'): void; onResume(): void;
}

export function ControlBar(p: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const { st } = p;
  const s = STATUS[p.syncStatus];
  const disabledMsg = p.canControl ? undefined : 'Only the host can control playback in this room';
  const playable = p.viewMode === 'video' && st.ready;

  const isMuted = p.viewMode === 'screen' ? (p.screenMuted ?? false) : st.muted;
  const currentVolume = p.viewMode === 'screen' ? (p.screenVolume ?? 1) : st.volume;
  const handleMute = p.viewMode === 'screen' ? (p.onScreenMute ?? p.onMute) : p.onMute;
  const handleVolume = p.viewMode === 'screen' ? (p.onScreenVolume ?? p.onVolume) : p.onVolume;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-10 opacity-100 transition-opacity pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
      {p.viewMode === 'video' && (
        <input type="range" aria-label="Seek" className="mb-1 w-full" min={0} max={st.duration || 0} step={0.5} disabled={!p.canControl || !playable}
          value={drag ?? st.time} title={disabledMsg}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => { if (drag !== null) p.onSeek(drag); setDrag(null); }}
          onKeyUp={() => { if (drag !== null) p.onSeek(drag); setDrag(null); }} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {p.viewMode === 'video' && (
          <button className="icon-btn" onClick={p.onPlayPause} disabled={!p.canControl || !playable} title={disabledMsg} aria-label={st.paused ? 'Play' : 'Pause'}>{st.paused ? <Play size={18} /> : <Pause size={18} />}</button>
        )}
        {p.viewMode === 'video' && <span className="text-xs tabular-nums text-paper/80">{fmt(drag ?? st.time)} / {fmt(st.duration)}</span>}
        <button className="icon-btn" onClick={handleMute} aria-label={isMuted || currentVolume === 0 ? 'Unmute' : 'Mute'}>{isMuted || currentVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <input type="range" aria-label="Volume" className="hidden w-20 sm:block" min={0} max={1} step={0.05} value={isMuted ? 0 : currentVolume} onChange={(e) => handleVolume(Number(e.target.value))} />
        <div className="ml-auto flex items-center gap-2">
          {p.viewMode === 'screen' ? (
            <span className="flex items-center gap-1.5 rounded-full bg-sakura-500/20 px-3 py-1 text-xs font-bold text-sakura-200" role="status">
              <span className="h-2 w-2 rounded-full bg-sakura-400 animate-pulse" />
              LIVE Screen
            </span>
          ) : (
            p.syncStatus === 'needs-interaction'
              ? <button className={`rounded-full px-3 py-1 text-xs font-bold ${s.c}`} onClick={p.onResume}>{s.t}</button>
              : <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.c}`} role="status">{s.t}</span>
          )}
          {p.screenAvailable && (
            <button className="icon-btn" aria-label={p.viewMode === 'video' ? 'Show shared screen' : 'Show video player'} title={p.viewMode === 'video' ? 'Show shared screen' : 'Show video player'} onClick={() => p.onViewMode(p.viewMode === 'video' ? 'screen' : 'video')}>
              {p.viewMode === 'video' ? <MonitorUp size={18} /> : <Film size={18} />}
            </button>
          )}
          {p.fsSupported && <button className="icon-btn" onClick={p.onFs} aria-label={p.isFs ? 'Exit fullscreen' : 'Fullscreen'}>{p.isFs ? <Minimize size={18} /> : <Maximize size={18} />}</button>}
        </div>
      </div>
    </div>
  );
}
