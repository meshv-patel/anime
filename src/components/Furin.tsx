import { useState, useRef, useEffect, type MouseEvent, type KeyboardEvent } from 'react';
import { ringFurin, isFurinMuted, toggleFurinMuted } from '../lib/furinAudio';
import { VolumeX } from 'lucide-react';

interface FurinProps {
  className?: string;
}

/**
 * Fūrin (風鈴) — Japanese Glass Wind Chime Component.
 *
 * An ambient personal touch for Anime Together.
 * Plays an organic glass chime locally via Web Audio API.
 * Never broadcasts sound or events to peers.
 */
export function Furin({ className = '' }: FurinProps) {
  const [ringing, setRinging] = useState(false);
  const [muted, setMuted] = useState(isFurinMuted);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [ringCounter, setRingCounter] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync mute state on mount
  useEffect(() => {
    setMuted(isFurinMuted());
  }, []);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // If currently muted, unmute on direct click so user isn't confused by silence
    let currentMuted = muted;
    if (muted) {
      currentMuted = false;
      setMuted(false);
      toggleFurinMuted();
    }

    // Play local audio chime
    ringFurin({ force: !currentMuted });

    // Trigger sway animation (restart CSS animation cleanly)
    setRinging(false);
    requestAnimationFrame(() => {
      setRinging(true);
      setRingCounter((c) => c + 1);
    });

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setRinging(false);
    }, 2200);
  };

  const handleContextMenu = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const next = toggleFurinMuted();
    setMuted(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      const next = toggleFurinMuted();
      setMuted(next);
    }
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <button
        data-furin-control="true"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${
          ringing
            ? 'bg-sakura-500/20 ring-1 ring-sakura-400/40 shadow-[0_0_15px_rgba(244,166,192,0.3)]'
            : 'bg-white/10 hover:bg-white/15 hover:ring-1 hover:ring-lantern-400/30'
        } active:scale-95`}
        title={muted ? 'Wind Chime (Fūrin) — Muted (click to unmute and ring)' : 'Wind Chime (Fūrin) — Click to ring (right-click to mute)'}
        aria-label={muted ? 'Ring wind chime (currently muted)' : 'Ring the Japanese wind chime'}
      >
        {/* SVG Illustration of Traditional Japanese Edo Fūrin */}
        <svg
          viewBox="0 0 32 36"
          className={`h-7 w-7 transition-transform duration-300 group-hover:scale-105 ${
            ringing ? 'furin-ringing' : ''
          }`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Top Hanging Cord */}
          <line x1="16" y1="1" x2="16" y2="7" stroke="#ffb86b" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="16" cy="7" r="1.2" fill="#df5a8b" />

          {/* Glass Bell Dome (Fūrin Bowl) */}
          <g className="furin-bell">
            {/* Soft inner glow */}
            <path
              d="M10 16 C10 10, 12 7.5, 16 7.5 C20 7.5, 22 10, 22 16 Z"
              fill="url(#furinGlassGrad)"
              opacity="0.85"
            />
            {/* Glass Rim */}
            <path
              d="M9.5 16 C9.5 16.6, 11.5 17, 16 17 C20.5 17, 22.5 16.6, 22.5 16 C22.5 15.4, 20.5 15, 16 15 C11.5 15, 9.5 15.4, 9.5 16 Z"
              fill="#f4a6c0"
              fillOpacity="0.4"
            />
            {/* Bell Outline */}
            <path
              d="M9.5 16 C9.5 10, 11.8 7.5, 16 7.5 C20.2 7.5, 22.5 10, 22.5 16"
              stroke="#f9cfdc"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {/* Delicate Cherry Blossom Petal Accent on Glass */}
            <path
              d="M14.5 11.5 C14.5 10.2, 16.5 10.2, 16.5 11.5 C17.8 11.5, 17.8 13.5, 16.5 13.5 C16.5 14.8, 14.5 14.8, 14.5 13.5 C13.2 13.5, 13.2 11.5, 14.5 11.5 Z"
              fill="#df5a8b"
              fillOpacity="0.7"
            />
            <circle cx="15.5" cy="12.5" r="0.75" fill="#ffd793" />

            {/* Inner Cord & Clapper Bead (Zetsu) */}
            <line x1="16" y1="7.5" x2="16" y2="18.5" stroke="#f7ecdf" strokeWidth="0.8" strokeDasharray="1 0.8" />
            <circle cx="16" cy="16" r="1.4" fill="#ffd793" stroke="#f59e3f" strokeWidth="0.6" />
          </g>

          {/* Hanging Tanzaku Paper Strip (Flutters in breeze) */}
          <g className="furin-tanzaku">
            {/* Tanzaku string */}
            <line x1="16" y1="16.5" x2="16" y2="20.5" stroke="#f7ecdf" strokeWidth="0.8" />
            {/* Tanzaku Paper Strip */}
            <rect
              x="14"
              y="20.5"
              width="4"
              height="13.5"
              rx="0.8"
              fill="url(#furinPaperGrad)"
              stroke="#f4a6c0"
              strokeWidth="0.6"
            />
            {/* Delicate Kanji '風' (Wind) suggestion mark */}
            <line x1="15.2" y1="23.5" x2="16.8" y2="23.5" stroke="#df5a8b" strokeWidth="0.6" strokeLinecap="round" />
            <line x1="16" y1="24.5" x2="16" y2="29" stroke="#df5a8b" strokeWidth="0.6" strokeLinecap="round" />
            <circle cx="16" cy="31" r="0.6" fill="#df5a8b" />
          </g>

          {/* Gradient Definitions */}
          <defs>
            <linearGradient id="furinGlassGrad" x1="10" y1="7.5" x2="22" y2="17" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f4a6c0" stopOpacity="0.7" />
              <stop offset="0.6" stopColor="#cbb8ff" stopOpacity="0.4" />
              <stop offset="1" stopColor="#f7ecdf" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="furinPaperGrad" x1="14" y1="20.5" x2="18" y2="34" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f7ecdf" />
              <stop offset="1" stopColor="#f9cfdc" />
            </linearGradient>
          </defs>
        </svg>

        {/* Small Mute Indicator Badge */}
        {muted && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink-950/90 text-paper/70 ring-1 ring-white/20"
            title="Wind chime sound muted"
          >
            <VolumeX size={10} className="text-sakura-300" />
          </span>
        )}
      </button>

      {/* Elegant Japanese Hover Tooltip */}
      {tooltipVisible && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-2xl border border-white/10 bg-ink-900/95 px-3 py-1.5 text-center shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-paper">
            <span>🎐 Wind Chime (Fūrin)</span>
            {muted && <span className="rounded bg-sakura-500/20 px-1.5 py-0.2 text-[10px] text-sakura-300">Muted</span>}
          </div>
          <p className="mt-0.5 text-[10px] text-paper/60">
            {muted ? 'Click to ring & unmute' : 'Click to ring · Right-click to mute'}
          </p>
        </div>
      )}
    </div>
  );
}
