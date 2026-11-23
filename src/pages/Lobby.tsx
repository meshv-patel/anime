import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ModeBadge } from '../components/ModeBadge';
import { AVATAR_COLORS, AVATAR_EMOJI, makeAvatar, parseAvatar } from '../lib/avatar';
import { parseRoomInput } from '../lib/ids';
import { loadProfile, saveProfile } from '../lib/storage';
import { createRoom } from '../realtime/roomApi';

export default function Lobby() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const saved = loadProfile();
  const prefill = params.get('join') ?? '';
  const [tab, setTab] = useState<'create' | 'join'>(prefill || params.get('mode') === 'join' ? 'join' : 'create');
  const [nick, setNick] = useState(saved?.nickname ?? '');
  const initial = parseAvatar(saved?.avatar ?? '');
  const [emoji, setEmoji] = useState(initial.emoji);
  const [color, setColor] = useState(initial.color);
  const [link, setLink] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const profile = () => { const p = { nickname: nick.trim().slice(0, 24), avatar: makeAvatar(emoji, color) }; saveProfile(p); return p; };
  const valid = nick.trim().length > 0;

  const create = async () => {
    setBusy(true); setErr('');
    try { const p = profile(); const r = await createRoom(p.nickname); nav(`/room/${r.id}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const join = () => {
    const id = parseRoomInput(link);
    if (!id) { setErr('That does not look like a room link or ID. Room IDs are 20 letters and digits.'); return; }
    profile(); nav(`/room/${id}`);
  };

  return (
    <div className="mx-auto grid min-h-screen max-w-3xl content-center gap-6 px-5 py-10">
      <div className="flex items-center justify-between"><Link to="/" className="font-display text-xl font-extrabold">🌸 Anime Together</Link><ModeBadge /></div>
      <div className="panel p-6 sm:p-8">
        {saved?.nickname && <p className="mb-4 text-xs font-medium text-lantern-300">Welcome back, {saved.nickname}! (おかえり · Okaeri)</p>}
        <div role="tablist" className="mb-6 inline-flex rounded-full bg-ink-900 p-1">
          {(['create', 'join'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setErr(''); }}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${tab === t ? 'bg-lantern-400 text-ink-950' : 'text-paper/70 hover:text-paper'}`}>
              {t === 'create' ? 'Create a room' : 'Join a room'}
            </button>
          ))}
        </div>

        <label className="block text-sm font-bold" htmlFor="nick">Nickname</label>
        <input id="nick" className="field mt-2" maxLength={24} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="What should friends call you?" />

        <fieldset className="mt-6">
          <legend className="text-sm font-bold">Avatar</legend>
          <div className="mt-3 flex items-center gap-4"><Avatar value={makeAvatar(emoji, color)} size={64} title="Your avatar" />
            <div className="flex flex-wrap gap-2">{AVATAR_EMOJI.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e} aria-label={`Avatar ${e}`} className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${emoji === e ? 'bg-white/25 ring-2 ring-lantern-400' : 'bg-white/5 hover:bg-white/10'}`}>{e}</button>
            ))}</div>
          </div>
          <div className="mt-3 flex gap-2" role="group" aria-label="Avatar colour">{AVATAR_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-pressed={color === c} aria-label={`Colour ${c}`} className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-paper ring-offset-2 ring-offset-ink-800' : ''}`} style={{ background: c }} />
          ))}</div>
        </fieldset>

        {tab === 'join' && (
          <div className="mt-6">
            <label className="block text-sm font-bold" htmlFor="link">Invitation link or room ID</label>
            <input id="link" className="field mt-2" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the link your friend sent" />
          </div>
        )}
        {err && <p role="alert" className="mt-4 rounded-2xl bg-sakura-500/15 p-3 text-sm text-sakura-200">{err}</p>}
        <div className="mt-7">
          {tab === 'create'
            ? <button className="btn-lantern w-full py-3" disabled={!valid || busy} onClick={create}>{busy ? 'Creating…' : 'Create private room'}</button>
            : <button className="btn-lantern w-full py-3" disabled={!valid || !link.trim()} onClick={join}>Join room</button>}
        </div>
      </div>
    </div>
  );
}
