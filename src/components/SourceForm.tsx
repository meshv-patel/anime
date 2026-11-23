import { Link2, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import type { MediaSource } from '../lib/types';

export function SourceForm({ canControl, onLoad, onLocal }: { canControl: boolean; onLoad(s: MediaSource): void; onLocal(f: File): void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    let u: URL;
    try { u = new URL(url.trim()); } catch { setErr('Enter a full video URL starting with https://'); return; }
    if (!/^https?:$/.test(u.protocol)) { setErr('Only http(s) links are supported.'); return; }
    if (/(youtube\.com|youtu\.be|netflix\.com|crunchyroll\.com|disneyplus\.com|primevideo\.com|hulu\.com)/i.test(u.hostname)) {
      setErr('Streaming-service sites cannot be embedded directly. Play it in your browser and use Screen Sharing above instead!');
      return;
    }
    setErr('');
    const kind = /\.m3u8(\?|$)/i.test(u.pathname + u.search) ? 'hls' : 'mp4';
    onLoad({ kind, url: u.toString(), title: title.trim().slice(0, 120) || decodeURIComponent(u.pathname.split('/').pop() || 'Video') });
    setUrl(''); setTitle('');
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
        <input
          className="field py-2.5"
          placeholder="Direct MP4 or HLS (.m3u8) URL"
          aria-label="Video URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!canControl}
        />
        <input
          className="field py-2.5"
          placeholder="Title / episode (optional)"
          aria-label="Title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canControl}
        />
        <button className="btn-lantern" onClick={submit} disabled={!canControl || !url.trim()}>
          <Link2 size={16} /> Load URL
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className={`btn-ghost text-xs cursor-pointer ${canControl ? '' : 'pointer-events-none opacity-40'}`}>
          <Upload size={14} /> Open local file in web player
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onLocal(f); e.target.value = ''; }}
          />
        </label>
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-xs text-paper/60 space-y-1">
        <p className="font-semibold text-paper/80 flex items-center gap-1.5">
          <Sparkles size={12} className="text-lantern-400" />
          Primary watch experience:
        </p>
        <p>
          Screen sharing is the recommended way to watch together. The host simply plays any video file or stream on their computer and clicks <strong>Share Screen</strong> — guests watch along instantly without uploading anything!
        </p>
      </div>

      {err && <p role="alert" className="text-sm text-sakura-300">{err}</p>}
      {!canControl && <p className="text-xs text-lantern-300">Host-only control is on. Ask the host to load a video.</p>}
    </div>
  );
}
