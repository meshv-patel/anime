import { Bookmark, Check, Copy, Crown, Plus, Timer, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Moment, Peer, WatchItem } from '../lib/types';
import type { Prefs } from '../lib/storage';
import { Avatar } from './Avatar';
import { getCompanion } from '../ai/companion';
import { isFurinMuted, setFurinMuted } from '../lib/furinAudio';
import {
  SEASONS,
  loadSeasonPreference,
  saveSeasonPreference,
  resolveActiveSeason,
  subscribeSeason,
  type SeasonPreference,
  type SeasonalTheme,
} from '../lib/season';

const fmt = (s: number) => { const t = Math.floor(s); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`; };

export function WatchlistPanel({ items, error, onAdd, onUpdate, onRemove }: { items: WatchItem[]; error: string; onAdd(t: string): void; onUpdate(id: string, p: Partial<Pick<WatchItem, 'status' | 'progress'>>): void; onRemove(id: string): void }) {
  const [t, setT] = useState('');
  const add = () => { if (t.trim()) { onAdd(t); setT(''); } };
  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-2"><input className="field py-2.5" placeholder="Add an anime" aria-label="Anime title" value={t} maxLength={120} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="icon-btn" onClick={add} aria-label="Add to watchlist"><Plus size={18} /></button></div>
      {error && <p role="alert" className="text-xs text-sakura-300">{error}</p>}
      {items.length === 0 && <p className="py-6 text-center text-sm text-paper/50">Nothing here yet. Add the first show you want to watch together.</p>}
      <ul className="space-y-2">
        {items.map((w) => (
          <li key={w.id} className="rounded-2xl bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2"><p className="break-words text-sm font-bold">{w.title}</p><button className="text-paper/40 hover:text-sakura-300" onClick={() => onRemove(w.id)} aria-label={`Remove ${w.title}`}><Trash2 size={15} /></button></div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <select className="rounded-lg bg-ink-900 px-2 py-1" value={w.status} aria-label="Status" onChange={(e) => onUpdate(w.id, { status: e.target.value as WatchItem['status'] })}><option value="planned">Planned</option><option value="watching">Watching</option><option value="done">Finished</option></select>
              <span className="ml-auto text-paper/60">Episode</span>
              <button className="icon-btn !h-7 !w-7" aria-label="Previous episode" onClick={() => onUpdate(w.id, { progress: Math.max(0, w.progress - 1) })}>−</button>
              <span className="w-6 text-center font-bold tabular-nums">{w.progress}</span>
              <button className="icon-btn !h-7 !w-7" aria-label="Next episode" onClick={() => onUpdate(w.id, { progress: w.progress + 1 })}>+</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MomentsPanel({ items, canSeek, hasVideo, onSave, onSeek, onRemove }: { items: Moment[]; canSeek: boolean; hasVideo: boolean; onSave(note: string): void; onSeek(t: number): void; onRemove(id: string): void }) {
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-2"><input className="field py-2.5" placeholder="Note for this moment (optional)" aria-label="Moment note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-lantern !px-4" disabled={!hasVideo} title={hasVideo ? undefined : 'Load a video first'} onClick={() => { onSave(note); setNote(''); }}><Bookmark size={16} /> Save</button></div>
      {items.length === 0 && <p className="py-6 text-center text-sm text-paper/50">Save a timestamp when something unforgettable happens.</p>}
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-2xl bg-white/5 p-3">
            <button className="rounded-full bg-lantern-400/20 px-3 py-1 text-xs font-bold tabular-nums text-lantern-300 disabled:opacity-40" disabled={!canSeek} title={canSeek ? 'Jump everyone to this moment' : 'Only the host can seek'} onClick={() => onSeek(m.position)}>{fmt(m.position)}</button>
            <div className="min-w-0 flex-1"><p className="truncate text-sm">{m.note || 'Memorable moment'}</p><p className="truncate text-xs text-paper/50">{m.sourceTitle}</p></div>
            <button className="text-paper/40 hover:text-sakura-300" onClick={() => onRemove(m.id)} aria-label="Delete moment"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RoomPanelProps {
  inviteUrl: string; peers: Peer[]; myClientId: string; hostId: string; isHost: boolean; hostOnly: boolean; prefs: Prefs; expiresAt: number; maxParticipants: number; demo: boolean;
  onHostOnly(v: boolean): void; onTransfer(p: Peer): void; onPrefs(p: Prefs): void; onCountdown(): void; canCountdown: boolean; onLeave(): void;
}
export function RoomPanel(p: RoomPanelProps) {
  const [copied, setCopied] = useState(false);
  const [furinMuted, setFurinMutedState] = useState(isFurinMuted);
  const [seasonPref, setSeasonPref] = useState<SeasonPreference>(loadSeasonPreference);
  const [activeSeason, setActiveSeason] = useState<SeasonalTheme>(() => resolveActiveSeason(seasonPref));

  useEffect(() => {
    setActiveSeason(resolveActiveSeason(seasonPref));
    return subscribeSeason((pref, active) => {
      setSeasonPref(pref);
      setActiveSeason(active);
    });
  }, [seasonPref]);

  const handleSeasonChange = (next: SeasonPreference) => {
    setSeasonPref(next);
    setActiveSeason(resolveActiveSeason(next));
    saveSeasonPreference(next);
  };

  const copy = async () => { try { await navigator.clipboard.writeText(p.inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Copy this invitation link', p.inviteUrl); } };
  const hoursLeft = Math.max(0, Math.round((p.expiresAt - Date.now()) / 3_600_000));
  return (
    <div className="space-y-5 p-4 text-sm">
      <section>
        <h3 className="font-bold">Invitation link</h3>
        <div className="mt-2 flex gap-2"><input readOnly className="field py-2 text-xs" value={p.inviteUrl} aria-label="Invitation link" onFocus={(e) => e.target.select()} /><button className="btn-lantern !px-4" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}</button></div>
        <p className="mt-1 text-xs text-paper/50">Up to {p.maxParticipants} people · expires in about {hoursLeft}h{p.demo ? ' · demo links only work in this browser' : ''}</p>
      </section>
      <section>
        <h3 className="font-bold">In the room ({p.peers.length})</h3>
        <ul className="mt-2 space-y-2">
          {p.peers.map((x) => (
            <li key={x.clientId} className="flex items-center gap-3"><Avatar value={x.avatar} size={32} /><span className="flex-1 truncate">{x.nickname}{x.clientId === p.myClientId && ' (you)'}</span>
              {x.userId === p.hostId && <span className="flex items-center gap-1 rounded-full bg-lantern-400/20 px-2 py-0.5 text-xs font-bold text-lantern-300"><Crown size={12} /> Host</span>}
              {p.isHost && x.userId !== p.hostId && <button className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold hover:bg-white/20" onClick={() => p.onTransfer(x)}>Make host</button>}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h3 className="font-bold">Room settings</h3>
        <label className="flex items-center justify-between gap-3"><span>Only the host controls playback{!p.isHost && <span className="block text-xs text-paper/50">Host can change this</span>}</span>
          <input type="checkbox" className="h-5 w-5" checked={p.hostOnly} disabled={!p.isHost} onChange={(e) => p.onHostOnly(e.target.checked)} /></label>
        <button className="btn-ghost w-full" onClick={p.onCountdown} disabled={!p.canCountdown}><Timer size={16} /> Start 3-2-1 countdown</button>
      </section>
      <section className="space-y-3">
        <h3 className="font-bold">My notifications</h3>
        <label className="flex items-center justify-between"><span>Message pop-ups over the video</span><input type="checkbox" className="h-5 w-5" checked={p.prefs.toasts} onChange={(e) => p.onPrefs({ ...p.prefs, toasts: e.target.checked })} /></label>
        <label className="flex items-center justify-between gap-3"><span>Pop-up duration</span><select className="rounded-lg bg-ink-900 px-2 py-1" value={p.prefs.toastMs} onChange={(e) => p.onPrefs({ ...p.prefs, toastMs: Number(e.target.value) })}>{[3000, 5000, 8000, 12000].map((v) => <option key={v} value={v}>{v / 1000}s</option>)}</select></label>
        <label className="flex items-center justify-between"><span>Sound for new messages</span><input type="checkbox" className="h-5 w-5" checked={p.prefs.sound} onChange={(e) => p.onPrefs({ ...p.prefs, sound: e.target.checked })} /></label>
        <label className="flex items-center justify-between">
          <span>Wind chime sound (Fūrin)</span>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={!furinMuted}
            onChange={(e) => {
              const nextMuted = !e.target.checked;
              setFurinMuted(nextMuted);
              setFurinMutedState(nextMuted);
            }}
          />
        </label>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Seasonal Atmosphere</h3>
          <span className="text-xs text-lantern-300 font-medium">
            {seasonPref === 'auto'
              ? `Auto · ${SEASONS[activeSeason].kanji} ${SEASONS[activeSeason].romaji}`
              : `${SEASONS[activeSeason].kanji} ${SEASONS[activeSeason].romaji}`}
          </span>
        </div>

        {/* Automatic Toggle Button */}
        <button
          type="button"
          onClick={() => handleSeasonChange('auto')}
          className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs transition ${
            seasonPref === 'auto'
              ? 'bg-lantern-400/20 text-lantern-300 ring-1 ring-lantern-400/50'
              : 'bg-white/5 text-paper/70 hover:bg-white/10'
          }`}
          role="radio"
          aria-checked={seasonPref === 'auto'}
        >
          <span className="flex items-center gap-2.5">
            <span className="text-sm">🗓️</span>
            <span className="font-bold">Automatic (Tokyo Calendar)</span>
          </span>
          <span className="text-[11px] opacity-80">
            {seasonPref === 'auto' ? `Active: ${SEASONS[activeSeason].english} (${SEASONS[activeSeason].kanji})` : 'Follow Japan seasons'}
          </span>
        </button>

        {/* 4 Seasonal Atmosphere Cards */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Select seasonal atmosphere">
          {(['spring', 'summer', 'autumn', 'winter'] as const).map((sKey) => {
            const s = SEASONS[sKey];
            const isSelected = seasonPref === sKey;
            const isCurrentlyActive = activeSeason === sKey;

            return (
              <button
                key={sKey}
                type="button"
                onClick={() => handleSeasonChange(sKey)}
                role="radio"
                aria-checked={isSelected}
                className={`group relative flex flex-col items-start rounded-2xl border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-lantern-400/60 bg-white/10 shadow-[0_0_12px_rgba(255,184,107,0.15)] ring-1 ring-lantern-400/50'
                    : isCurrentlyActive && seasonPref === 'auto'
                    ? 'border-white/20 bg-white/5 ring-1 ring-white/15'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-base">{s.motif}</span>
                  <span className="font-display text-sm font-bold opacity-90" style={{ color: s.accent }}>
                    {s.kanji}
                  </span>
                </div>
                <div className="mt-1">
                  <p className="text-xs font-bold leading-tight text-paper">{s.romaji}</p>
                  <p className="text-[10px] text-paper/50">{s.english}</p>
                </div>
                {/* Active indicator dot */}
                {isSelected && (
                  <span
                    className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.accent }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>
      <section className="rounded-2xl border border-dashed border-white/15 p-3">
        <h3 className="font-bold">AI companion</h3>
        <p className="mt-1 text-xs text-paper/60">{getCompanion() ? 'Connected.' : 'Not available yet. Only the integration boundary exists (src/ai/companion.ts); no AI model is connected.'}</p>
      </section>
      <button className="btn-ghost w-full text-sakura-300" onClick={p.onLeave}>Leave room · See you soon (またね)</button>
    </div>
  );
}
