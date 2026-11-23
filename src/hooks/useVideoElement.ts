import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerAdapter } from '../services/syncService';
import type { SourceKind } from '../lib/types';

export interface VideoState { time: number; duration: number; paused: boolean; muted: boolean; volume: number; buffering: boolean; ready: boolean; error: string | null }
const INIT: VideoState = { time: 0, duration: 0, paused: true, muted: false, volume: 1, buffering: false, ready: false, error: null };

/** Owns the <video> element: source attachment (native MP4 / hls.js), UI state, and the PlayerAdapter used by SyncService. */
export function useVideoElement(src: string | null, kind: SourceKind | null, onReady: () => void) {
  const ref = useRef<HTMLVideoElement>(null);
  const [st, setSt] = useState<VideoState>(INIT);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const patch = (p: Partial<VideoState>) => setSt((s) => ({ ...s, ...p }));
    const on: Array<[string, () => void]> = [
      ['timeupdate', () => patch({ time: v.currentTime })],
      ['durationchange', () => patch({ duration: Number.isFinite(v.duration) ? v.duration : 0 })],
      ['play', () => patch({ paused: false })], ['pause', () => patch({ paused: true })],
      ['volumechange', () => patch({ muted: v.muted, volume: v.volume })],
      ['waiting', () => patch({ buffering: true })], ['playing', () => patch({ buffering: false })], ['canplay', () => patch({ buffering: false })],
      ['loadedmetadata', () => { patch({ ready: true, duration: v.duration || 0 }); readyCb.current(); }],
      ['error', () => patch({ error: 'This video could not be loaded. Check the URL, CORS headers and that the format is browser-compatible.' })]
    ];
    on.forEach(([e, h]) => v.addEventListener(e, h));
    return () => on.forEach(([e, h]) => v.removeEventListener(e, h));
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setSt((s) => ({ ...s, ready: false, error: null, time: 0, duration: 0, paused: true }));
    if (!src) { v.removeAttribute('src'); v.load(); return; }
    let hls: { destroy(): void } | undefined;
    let cancelled = false;
    const isHls = kind === 'hls' || /\.m3u8(\?|$)/i.test(src);
    if (isHls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setSt((s) => ({ ...s, error: 'HLS is not supported in this browser.' })); return; }
        const h = new Hls();
        hls = h;
        h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setSt((s) => ({ ...s, error: `HLS error: ${d.details}` })); });
        h.loadSource(src);
        h.attachMedia(v);
      });
    } else v.src = src;
    return () => { cancelled = true; hls?.destroy(); v.removeAttribute('src'); v.load(); };
  }, [src, kind]);

  const adapter = useMemo<PlayerAdapter>(() => ({
    play: async () => { await ref.current?.play(); },
    pause: () => ref.current?.pause(),
    seek: (t) => { if (ref.current) ref.current.currentTime = t; },
    getTime: () => ref.current?.currentTime ?? 0,
    isPlaying: () => !!ref.current && !ref.current.paused,
    isReady: () => !!ref.current && ref.current.readyState >= 1
  }), []);

  return { ref, st, adapter };
}
