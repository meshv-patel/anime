import { useState } from 'react';
import { Award, Check, Dices, RefreshCw, Sparkles, Users } from 'lucide-react';
import type { BingoCategory, BingoMode } from '../lib/types';
import { useBingo } from '../hooks/useBingo';
import type { Session } from '../hooks/useRoomSession';

interface BingoPanelProps {
  session: Session | null;
  roomId: string;
  userId: string;
  nickname: string;
  isHost: boolean;
}

export function BingoPanel({ session, roomId, userId, nickname, isHost }: BingoPanelProps) {
  const {
    game,
    board,
    marks,
    linesCount,
    hasBingo,
    celebrating,
    error,
    startNewGame,
    toggleSquare,
    resetGame
  } = useBingo(session, roomId, userId, nickname, isHost);

  const [mode, setMode] = useState<BingoMode>('cooperative');
  const [category, setCategory] = useState<BingoCategory>('all');
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    await startNewGame(mode, category);
    setBusy(false);
  };

  return (
    <div className="space-y-4 p-4 text-sm">
      {/* Game Header / Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h3 className="font-display text-base font-bold text-lantern-300 flex items-center gap-2">
            <Sparkles size={18} className="text-sakura-400" /> Anime Bingo
          </h3>
          <p className="text-xs text-paper/60">
            {game
              ? `${game.mode === 'cooperative' ? '🤝 Co-op Mode' : '⚔️ Competitive Mode'} · ${game.category.toUpperCase()}`
              : 'Spot anime tropes as they happen on screen!'}
          </p>
        </div>

        {game && isHost && (
          <button
            onClick={() => void resetGame()}
            className="icon-btn !h-8 !w-8 text-paper/50 hover:text-sakura-300"
            title="Reset Bingo Game"
            aria-label="Reset Bingo Game"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-sakura-500/20 px-3 py-2 text-xs text-sakura-200">{error}</p>}

      {/* No Active Game State */}
      {!game && (
        <div className="space-y-4 py-4 text-center">
          <p className="text-4xl" aria-hidden>🌸</p>
          <div>
            <p className="font-bold">No active Bingo game</p>
            <p className="mt-1 text-xs text-paper/60">Choose a game mode and start a new 5x5 anime bingo card.</p>
          </div>

          <div className="space-y-3 rounded-2xl bg-white/5 p-4 text-left">
            <div>
              <label className="text-xs font-bold text-paper/70">Game Mode</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('cooperative')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    mode === 'cooperative' ? 'bg-lantern-400 text-ink-950' : 'bg-white/10 hover:bg-white/15'
                  }`}
                >
                  <Users size={14} /> Cooperative
                </button>
                <button
                  type="button"
                  onClick={() => setMode('competitive')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    mode === 'competitive' ? 'bg-sakura-400 text-ink-950' : 'bg-white/10 hover:bg-white/15'
                  }`}
                >
                  <Award size={14} /> Competitive
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-paper/70">Trope Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BingoCategory)}
                className="field mt-1.5 w-full py-2 text-xs"
              >
                <option value="all">✨ All Genres Mixed</option>
                <option value="shonen">⚡ Shonen Battles</option>
                <option value="romance">🌸 Romance & Confessions</option>
                <option value="slice-of-life">🏖️ Slice of Life</option>
                <option value="isekai">🚚 Isekai Adventure</option>
                <option value="fantasy">🧙 Fantasy & Magic</option>
                <option value="mystery">🔍 Mystery & Suspense</option>
                <option value="comedy">👃 Slapstick Comedy</option>
              </select>
            </div>

            <button
              onClick={() => void handleStart()}
              disabled={busy}
              className="btn-lantern w-full py-2.5 text-xs font-bold"
            >
              <Dices size={15} /> {busy ? 'Generating Card…' : 'Generate 5x5 Bingo Board'}
            </button>
          </div>
        </div>
      )}

      {/* Active Game State */}
      {game && board && (
        <div className="space-y-3">
          {/* Progress Banner */}
          <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span className="text-xs font-bold">
              Lines Completed: <span className="text-lantern-300 text-sm font-extrabold">{linesCount}</span> / 12
            </span>
            {hasBingo && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-xs font-extrabold text-emerald-300">
                <Award size={13} /> BINGO!
              </span>
            )}
            {game.status === 'completed' && (
              <span className="text-xs text-sakura-300 font-bold">
                Winner: {game.winnerNickname ?? 'Player'} 🎉
              </span>
            )}
          </div>

          {/* Celebration Animation Banner */}
          {celebrating && (
            <div className="animate-bounce rounded-2xl bg-gradient-to-r from-sakura-500/80 via-lantern-400/80 to-wisteria-500/80 p-3 text-center font-display font-extrabold text-ink-950 shadow-lg">
              🎉 BINGO ACHIVED! YOU COMPLETED A LINE! 🎉
            </div>
          )}

          {/* 5x5 Interactive Board Grid */}
          <div className="grid grid-cols-5 gap-1.5 select-none" role="grid" aria-label="5x5 Anime Bingo Board">
            {board.tropes.map((trope, idx) => {
              const isMarked = marks.includes(idx);
              const isFree = idx === 12;

              return (
                <button
                  key={trope.id}
                  type="button"
                  onClick={() => void toggleSquare(idx)}
                  disabled={isFree || game.status !== 'active'}
                  aria-pressed={isMarked}
                  aria-label={`${trope.text}${isMarked ? ' (marked)' : ''}`}
                  className={`group relative flex aspect-square flex-col items-center justify-center rounded-xl p-1 text-center transition-all duration-150 ${
                    isFree
                      ? 'bg-lantern-400/30 text-lantern-200 ring-2 ring-lantern-400/50'
                      : isMarked
                      ? 'bg-sakura-500/80 text-white shadow-[0_0_12px_rgba(244,166,192,0.4)] ring-1 ring-sakura-300 scale-[0.98]'
                      : 'bg-white/5 hover:bg-white/10 text-paper/80 hover:text-paper hover:scale-[1.02]'
                  }`}
                >
                  {isMarked && (
                    <span className="absolute right-1 top-1 text-lantern-300">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                  <span className="line-clamp-3 text-[10px] leading-tight font-medium sm:text-[11px]">
                    {trope.text}
                  </span>
                  {isFree && (
                    <span className="mt-0.5 rounded bg-black/40 px-1 text-[8px] font-bold text-lantern-300 uppercase">
                      Free
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-paper/50">
            Click squares as tropes occur in the anime. Form any row, column, or diagonal to score Bingo!
          </p>
        </div>
      )}
    </div>
  );
}
