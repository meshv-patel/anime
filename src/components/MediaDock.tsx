import { Mic, MicOff, MonitorOff, MonitorUp, Sparkles, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MediaManager, describeMediaError, type MediaKind } from '../media/mediaManager';
import type { Peer } from '../lib/types';

function Tile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <figure className="relative w-28 shrink-0 overflow-hidden rounded-xl bg-black"><video ref={ref} autoPlay playsInline muted className="aspect-video w-full object-cover" /><figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-bold">{label}</figcaption></figure>;
}
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay />;
}

export function MediaDock({ media, peers, myId, isHost }: { media: MediaManager; peers: Peer[]; myId: string; isHost?: boolean }) {
  useSyncExternalStore((cb) => media.subscribe(cb), () => media.version);
  const [err, setErr] = useState('');
  const sup = MediaManager.support();
  const remoteSharer = media.remoteSharer();
  const nameOf = (id: string) => peers.find((p) => p.clientId === id)?.nickname ?? 'Someone';

  const toggle = async (kind: MediaKind) => {
    setErr('');
    try {
      if (media.isLocal(kind)) media.stop(kind);
      else {
        if (kind === 'screen' && !isHost) {
          setErr('Only the room host can share screen.');
          return;
        }
        if (kind === 'screen' && remoteSharer) { setErr(`${nameOf(remoteSharer)} is already sharing. Only one screen can be shared at a time.`); return; }
        await media.start(kind);
      }
    } catch (e) { setErr(describeMediaError(e, kind).message); }
  };

  const isScreenLocal = media.isLocal('screen');
  const hasLocalScreenAudio = media.hasScreenAudio();
  const hasRemoteScreenAudio = remoteSharer ? media.hasScreenAudio(remoteSharer) : false;
  const remotes = [...media.remote.entries()];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary Screen Share button (Host Only) */}
        {isHost && (
          <button
            className={`btn ${isScreenLocal ? 'bg-sakura-500 text-white hover:bg-sakura-600' : 'btn-lantern'}`}
            aria-pressed={isScreenLocal}
            onClick={() => void toggle('screen')}
            disabled={!sup.webrtc}
          >
            {isScreenLocal ? <MonitorOff size={16} /> : <MonitorUp size={16} />}
            <span>{isScreenLocal ? 'Stop sharing screen' : 'Share screen & audio'}</span>
          </button>
        )}

        {/* Voice and Webcam toggles */}
        <button
          className={`btn ${media.isLocal('mic') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'btn-ghost'}`}
          aria-pressed={media.isLocal('mic')}
          onClick={() => void toggle('mic')}
          disabled={!sup.webrtc}
        >
          {media.isLocal('mic') ? <Mic size={16} /> : <MicOff size={16} />}
          <span>{media.isLocal('mic') ? 'Mic on' : 'Mic off'}</span>
        </button>

        <button
          className={`btn ${media.isLocal('cam') ? 'bg-sakura-400 text-ink-950' : 'btn-ghost'}`}
          aria-pressed={media.isLocal('cam')}
          onClick={() => void toggle('cam')}
          disabled={!sup.webrtc}
        >
          {media.isLocal('cam') ? <Video size={16} /> : <VideoOff size={16} />}
          <span>{media.isLocal('cam') ? 'Camera on' : 'Camera off'}</span>
        </button>
      </div>

      {/* Screen Sharing Status & Audio Warnings */}
      {isScreenLocal && (
        <div className="rounded-xl bg-sakura-500/20 p-3 text-sm text-sakura-200 space-y-2">
          <div className="font-bold flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sakura-400 animate-pulse" />
              You are sharing your screen
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${hasLocalScreenAudio ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
              {hasLocalScreenAudio ? <Volume2 size={12} /> : <VolumeX size={12} />}
              {hasLocalScreenAudio ? 'Audio active' : 'No audio track'}
            </span>
          </div>
          {media.screenAudioWarning && (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 space-y-1.5">
              <p className="flex items-start gap-1.5 font-medium">
                <span className="shrink-0 text-sm">💡</span>
                <span>{media.screenAudioWarning}</span>
              </p>
              {!hasLocalScreenAudio && (
                <p className="text-[11px] text-paper/70 border-t border-amber-500/20 pt-1.5">
                  <strong>Voice chat note:</strong> You can use the separate <strong>Mic on</strong> button below to speak with everyone in the room while sharing, but microphone voice chat will not broadcast the show's internal tab or system audio.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {remoteSharer && (
        <div className="rounded-xl bg-sakura-500/20 px-3 py-2 text-sm font-bold text-sakura-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sakura-400 animate-pulse" />
            {nameOf(remoteSharer)} is sharing their screen
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${hasRemoteScreenAudio ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-paper/70'}`}>
            {hasRemoteScreenAudio ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {hasRemoteScreenAudio ? 'Stereo audio' : 'No audio'}
          </span>
        </div>
      )}

      {err && <p role="alert" className="text-sm text-sakura-300">{err}</p>}
      {!sup.secure && <p className="text-xs text-lantern-300">Screen, voice and camera need HTTPS or localhost.</p>}

      {/* Webcams */}
      {(media.local.cam || remotes.some(([, r]) => r.cam)) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.local.cam && <Tile stream={media.local.cam} label="You" />}
          {remotes.map(([id, r]) => r.cam && <Tile key={id} stream={r.cam} label={nameOf(id)} />)}
        </div>
      )}

      {/* Voice chat audio receivers */}
      {remotes.map(([id, r]) => r.mic && <RemoteAudio key={id + 'a'} stream={r.mic} />)}

      <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-xs text-paper/60 space-y-1">
        <p className="font-semibold text-paper/80 flex items-center gap-1.5">
          <Sparkles size={12} className="text-lantern-400" />
          Tab Audio Sharing Tip:
        </p>
        <p>
          For stereo audio with sound effects &amp; music, select <strong>Browser Tab</strong> (or Chrome Tab) when prompted, and ensure <strong>&quot;Also share tab audio&quot;</strong> is enabled.
        </p>
      </div>
    </div>
  );
}
