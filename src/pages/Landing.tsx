import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Film, MessagesSquare, MonitorUp, Sparkles, Users } from 'lucide-react';
import { ModeBadge } from '../components/ModeBadge';
import { loadHistory } from '../lib/storage';

function Hero() {
  return (
    <svg viewBox="0 0 560 440" className="w-full drop-shadow-[0_30px_60px_rgba(255,184,107,.18)]" role="img" aria-label="A torii gate under a large moon with falling cherry blossoms">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1c3f" /><stop offset=".7" stopColor="#5b2f58" /><stop offset="1" stopColor="#d9758c" /></linearGradient>
        <radialGradient id="moon" cx=".4" cy=".4"><stop offset="0" stopColor="#fff3dc" /><stop offset="1" stopColor="#ffc47a" /></radialGradient>
        <radialGradient id="glow"><stop offset="0" stopColor="#ffb86b" stopOpacity=".9" /><stop offset="1" stopColor="#ffb86b" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="560" height="440" rx="36" fill="url(#sky)" />
      <circle cx="300" cy="170" r="150" fill="url(#glow)" opacity=".35" />
      <circle cx="300" cy="170" r="92" fill="url(#moon)" />
      {[[70, 60], [150, 30], [450, 70], [510, 140], [90, 140], [410, 30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill="#fff3dc" opacity=".8" />)}
      <path d="M0 330 Q90 270 190 320 T380 310 T560 300 V440 H0Z" fill="#241634" />
      <path d="M0 370 Q140 330 280 365 T560 350 V440 H0Z" fill="#1a1024" />
      {/* torii */}
      <g fill="#c8344b">
        <rect x="230" y="215" width="14" height="140" /><rect x="356" y="215" width="14" height="140" />
        <path d="M196 214 Q300 236 404 214 L412 196 Q300 218 188 196Z" />
        <rect x="222" y="244" width="156" height="11" />
      </g>
      <rect x="292" y="218" width="16" height="26" fill="#c8344b" />
      {/* lanterns */}
      {[130, 470].map((x) => (
        <g key={x} className="lantern-glow">
          <circle cx={x} cy="300" r="46" fill="url(#glow)" opacity=".55" />
          <rect x={x - 9} y="284" width="18" height="26" rx="6" fill="#ffb86b" />
          <rect x={x - 1} y="310" width="2" height="48" fill="#241634" />
        </g>
      ))}
      {/* sakura branch */}
      <path d="M560 40 Q470 60 420 120" stroke="#3b2431" strokeWidth="5" fill="none" />
      {[[500, 52], [470, 74], [440, 96], [430, 120], [520, 36], [488, 98]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`} fill="#f4a6c0">{[0, 72, 144, 216, 288].map((r) => <ellipse key={r} rx="5" ry="9" cy="-8" transform={`rotate(${r})`} />)}<circle r="3" fill="#ffd793" /></g>
      ))}
    </svg>
  );
}

const STEPS = [
  { t: 'Create a room', d: 'Pick a nickname and an avatar. You get a private link with a long, unguessable ID.' },
  { t: 'Send the link', d: 'Friends open it, choose a nickname and join. Rooms hold up to six people and expire after 24 hours.' },
  { t: 'Press play together', d: 'Paste an MP4 or HLS link, or each pick the same local file. Play, pause and seeking stay in step.' }
];
const FEATURES = [
  { i: Film, t: 'Synced playback', d: 'Play, pause, seek and late-join catch-up, with gentle drift correction.' },
  { i: MessagesSquare, t: 'Chat that follows you into fullscreen', d: 'Messages pop up over the video so you never miss a reply.' },
  { i: Sparkles, t: 'Reactions with feeling', d: 'Floating emoji, plus special scenes for 😭 👑 🔥 🎉 💀 ❤️.' },
  { i: MonitorUp, t: 'Screen, voice and webcam', d: 'Optional peer-to-peer modules that never touch the synced player.' },
  { i: Users, t: 'Shared watchlist & moments', d: 'Track what you plan to watch and bookmark timestamps worth rewatching.' }
];

export default function Landing() {
  const history = loadHistory();
  const petals = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ left: `${(i * 73) % 100}%`, d: `${9 + (i % 5) * 2}s`, delay: `${-(i * 1.7)}s` })), []);
  return (
    <div className="relative overflow-hidden">
      {petals.map((p, i) => <span key={i} className="petal" style={{ left: p.left, animationDuration: p.d, animationDelay: p.delay }} aria-hidden />)}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold"><span aria-hidden>🌸</span> Anime Together</Link>
        <div className="flex items-center gap-3"><ModeBadge /><Link to="/start?mode=join" className="btn-ghost hidden sm:inline-flex">Join</Link></div>
      </nav>

      <header className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pt-14">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.1] sm:text-6xl">Watch anime with the people you miss, under the same lantern light.</h1>
          <p className="mt-5 max-w-lg text-lg text-paper/75">A cozy private room for two or a few friends. Press play at the same moment, chat, react, and keep a list of what to watch next.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/start?mode=create" className="btn-lantern px-7 py-3 text-base">Create watch party</Link>
            <Link to="/start?mode=join" className="btn-ghost px-7 py-3 text-base">Join watch party</Link>
          </div>
        </div>
        <Hero />
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-12">
        <h2 className="font-display text-3xl font-bold">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="panel p-6"><span className="font-display text-2xl text-lantern-400">{i + 1}</span><h3 className="mt-2 text-lg font-bold">{s.t}</h3><p className="mt-1 text-sm text-paper/70">{s.d}</p></li>
          ))}
        </ol>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-12">
        <h2 className="font-display text-3xl font-bold">Made for movie nights, not meetings</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ i: Icon, t, d }) => (
            <div key={t} className="flex gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sakura-400/20 text-sakura-300"><Icon size={22} /></span>
              <div><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm text-paper/70">{d}</p></div>
            </div>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section className="relative z-10 mx-auto max-w-6xl px-5 py-12">
          <h2 className="font-display text-3xl font-bold">Recently watched</h2>
          <ul className="mt-5 flex flex-wrap gap-3">
            {history.map((h) => <li key={h.title} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm">{h.title}<span className="ml-2 text-paper/40">{new Date(h.at).toLocaleDateString()}</span></li>)}
          </ul>
        </section>
      )}
      <footer className="relative z-10 px-5 py-10 text-center text-sm text-paper/50">Anime Together plays video you supply. It does not bypass DRM or streaming-service restrictions.</footer>
    </div>
  );
}
