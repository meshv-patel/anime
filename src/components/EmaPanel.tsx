import { useState } from 'react';
import { Plus, Trash2, X, Sparkles, Heart, Compass, MessageCircle, AlertCircle, Check, RotateCw } from 'lucide-react';
import type { EmaPlaque, EmaTheme, EmaCategory, EmaDiagnostics } from '../lib/types';

interface EmaPanelProps {
  items: EmaPlaque[];
  currentUserId: string;
  authorNickname: string;
  isDemo: boolean;
  error?: string;
  roomId?: string;
  diagnostics?: EmaDiagnostics | null;
  onReload?: () => Promise<void> | void;
  onAdd(ema: { message: string; authorNickname: string; theme: EmaTheme; category: EmaCategory }): Promise<void>;
  onRemove(id: string): Promise<void>;
}

const THEMES: Record<
  EmaTheme,
  { label: string; kanji: string; bg: string; border: string; cord: string; text: string; sub: string }
> = {
  hinoki: {
    label: 'Hinoki (Cypress)',
    kanji: '檜',
    bg: 'linear-gradient(135deg, #3d2a1c 0%, #291b12 100%)',
    border: '#d4a373',
    cord: '#ff5c5c',
    text: '#f7ecdf',
    sub: '#ffd793'
  },
  sakura: {
    label: 'Sakura (Rosewood)',
    kanji: '桜',
    bg: 'linear-gradient(135deg, #3d1c28 0%, #26111a 100%)',
    border: '#ee80a6',
    cord: '#ffb86b',
    text: '#fff1f5',
    sub: '#f4a6c0'
  },
  matsu: {
    label: 'Matsu (Pine)',
    kanji: '松',
    bg: 'linear-gradient(135deg, #1b2e23 0%, #111e17 100%)',
    border: '#52b788',
    cord: '#ffd793',
    text: '#e8f5e9',
    sub: '#95d5b2'
  },
  kuro: {
    label: 'Kuro (Lacquered)',
    kanji: '黒',
    bg: 'linear-gradient(135deg, #1a1523 0%, #0d0a12 100%)',
    border: '#ffb86b',
    cord: '#df5a8b',
    text: '#f7ecdf',
    sub: '#ffb86b'
  }
};

const CATEGORIES: Record<EmaCategory, { label: string; icon: typeof Sparkles }> = {
  wish: { label: 'Wish', icon: Sparkles },
  dream: { label: 'Dream & Goal', icon: Compass },
  gratitude: { label: 'Gratitude', icon: Heart },
  message: { label: 'Message', icon: MessageCircle }
};

export function EmaPanel({
  items,
  currentUserId,
  authorNickname,
  isDemo,
  error: propError,
  roomId,
  diagnostics,
  onReload,
  onAdd,
  onRemove
}: EmaPanelProps) {
  const [isComposing, setIsComposing] = useState(false);
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<EmaTheme>('hinoki');
  const [category, setCategory] = useState<EmaCategory>('wish');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const trimmed = message.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= 280;
  const activeError = error || propError;

  const handleManualRefresh = async () => {
    if (!onReload || refreshing) return;
    setRefreshing(true);
    try {
      await onReload();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || busy) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await onAdd({
        message: trimmed,
        authorNickname: (authorNickname || '').trim().slice(0, 24) || 'Guest',
        theme,
        category
      });
      setMessage('');
      setIsComposing(false);
      setSuccess('Your wish plaque has been hung!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to hang wish plaque. Please check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    try {
      await onRemove(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove wish');
    }
  };

  return (
    <div className="flex h-full flex-col p-4 text-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-paper">
            <span className="text-lantern-300">Wishes (Ema)</span>
            <span className="text-xs font-normal text-paper/60">Shared Board</span>
          </h2>
          <p className="text-[11px] text-paper/50">Wooden plaques where everyone in the room leaves wishes and messages</p>
        </div>

        <div className="flex items-center gap-2">
          {onReload && (
            <button
              onClick={handleManualRefresh}
              className="icon-btn !p-1.5 text-paper/60 hover:text-paper"
              title="Refresh wish plaques from database"
              aria-label="Refresh wish plaques"
              disabled={refreshing}
            >
              <RotateCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          {!isComposing && (
            <button
              onClick={() => setIsComposing(true)}
              className="btn-lantern !px-3 !py-1.5 text-xs font-bold"
              aria-label="Write a new wish plaque"
            >
              <Plus size={14} />
              <span>Hang Wish Plaque</span>
            </button>
          )}
        </div>
      </div>

      {activeError && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-sakura-500/20 p-3 text-xs text-sakura-200" role="alert">
          <AlertCircle size={15} />
          <span>{activeError}</span>
        </div>
      )}

      {success && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-emerald-500/20 p-3 text-xs text-emerald-300" role="status">
          <Check size={15} />
          <span>{success}</span>
        </div>
      )}

      {/* Composer Drawer */}
      {isComposing && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 space-y-3 rounded-3xl border border-white/15 bg-white/5 p-4 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-bold text-lantern-300">
              Write a Wish Plaque
            </span>
            <button
              type="button"
              onClick={() => setIsComposing(false)}
              className="text-paper/40 hover:text-paper"
              aria-label="Close composer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Category selection */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wish category">
            {(Object.keys(CATEGORIES) as EmaCategory[]).map((cat) => {
              const c = CATEGORIES[cat];
              const Icon = c.icon;
              const isSelected = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-lantern-400 text-ink-950 shadow-sm'
                      : 'bg-white/5 text-paper/60 hover:bg-white/10 hover:text-paper'
                  }`}
                >
                  <Icon size={12} />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Message Textarea */}
          <div className="relative">
            <textarea
              className="field h-24 resize-none !py-2.5 text-xs leading-relaxed placeholder:text-paper/40"
              placeholder="Write your wish, dream, or message for everyone..."
              maxLength={280}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-label="Wish plaque message"
              required
            />
            <span
              className={`absolute bottom-2 right-3 text-[10px] tabular-nums ${
                message.length > 260 ? 'text-sakura-300' : 'text-paper/40'
              }`}
            >
              {message.length}/280
            </span>
          </div>

          {/* Wooden Plaque Finish (Theme) Selector */}
          <div>
            <span className="block text-[11px] font-bold text-paper/70 mb-1.5">Wood Finish</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Select wooden plaque theme">
              {(Object.keys(THEMES) as EmaTheme[]).map((tKey) => {
                const t = THEMES[tKey];
                const isSelected = theme === tKey;
                return (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setTheme(tKey)}
                    role="radio"
                    aria-checked={isSelected}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                      isSelected
                        ? 'border-lantern-400/80 bg-white/15 ring-1 ring-lantern-400/50'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-white/30"
                      style={{ background: t.bg }}
                    />
                    <span className="text-xs font-bold text-paper">
                      {t.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!isValid || busy}
              className="btn-lantern flex-1 !py-2.5 text-xs font-bold"
            >
              {busy ? 'Hanging...' : 'Hang Wish Plaque'}
            </button>
            <button
              type="button"
              onClick={() => setIsComposing(false)}
              className="btn-ghost !px-3 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Plaques List / Empty State */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            {/* Traditional Shrine Ema Illustration */}
            <div className="relative mb-3 flex h-20 w-24 items-center justify-center">
              <svg viewBox="0 0 96 80" className="h-full w-full drop-shadow-md" fill="none">
                {/* Red hanging cord */}
                <path d="M48 2 C44 8, 48 16, 48 20" stroke="#df5a8b" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="48" cy="20" r="3.5" fill="#ffd793" />
                {/* Pentagonal Ema plaque silhouette */}
                <path
                  d="M48 10 L88 28 L84 76 L12 76 L8 28 Z"
                  fill="#3d2a1c"
                  stroke="#d4a373"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="48" cy="22" r="3" fill="#140e1b" />
                {/* Kanji '願' on illustration */}
                <text x="48" y="52" fill="#ffd793" fontSize="16" fontFamily="Shippori Mincho, serif" textAnchor="middle" fontWeight="bold">
                  願
                </text>
              </svg>
            </div>
            <h3 className="font-display text-sm font-bold text-paper">
              No wishes on the board yet
            </h3>
            <p className="mt-1 max-w-xs text-xs text-paper/50">
              Hang the first wooden plaque with a wish, goal, or message for everyone watching together.
            </p>
            <div className="mt-4 flex items-center gap-2">
              {!isComposing && (
                <button
                  onClick={() => setIsComposing(true)}
                  className="btn-lantern !px-4 !py-2 text-xs font-bold"
                >
                  Write First Wish
                </button>
              )}
              {onReload && (
                <button
                  onClick={handleManualRefresh}
                  className="btn-ghost flex items-center gap-1.5 !px-3 !py-2 text-xs"
                  title="Check database for newly added wishes"
                  disabled={refreshing}
                >
                  <RotateCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  <span>Refresh Board</span>
                </button>
              )}
            </div>

            {/* In-depth Diagnostics Banner for the empty state */}
            {diagnostics && (
              <div className="mt-6 w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-3 text-left font-mono text-[11px] text-paper/70">
                <div className="mb-1 flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="font-bold text-lantern-300">Database Diagnostics</span>
                  <span className="text-[10px] text-paper/40">
                    {diagnostics.lastFetchedAt ? new Date(diagnostics.lastFetchedAt).toLocaleTimeString() : 'Not fetched'}
                  </span>
                </div>
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between">
                    <span className="text-paper/50">Room ID (Client):</span>
                    <span className="truncate max-w-[150px] text-paper font-semibold" title={roomId || diagnostics.currentRoomId}>
                      {roomId || diagnostics.currentRoomId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-paper/50">Queried Room ID:</span>
                    <span className="truncate max-w-[150px] text-paper font-semibold" title={diagnostics.storeRoomId}>
                      {diagnostics.storeRoomId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-paper/50">Rows Returned:</span>
                    <span className={`font-bold ${diagnostics.rowsReturned > 0 ? 'text-emerald-400' : 'text-paper'}`}>
                      {diagnostics.rowsReturned}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-paper/50">React State Count:</span>
                    <span className="text-paper font-semibold">{items.length}</span>
                  </div>
                  {diagnostics.queryError && (
                    <div className="mt-1 text-rose-300">
                      Query Error: {diagnostics.queryError}
                    </div>
                  )}
                  {diagnostics.otherRoomCards && diagnostics.otherRoomCards.length > 0 && (
                    <div className="mt-2 rounded bg-amber-500/10 border border-amber-500/20 p-2 text-amber-200">
                      <p className="font-sans font-bold text-[10px] text-amber-300">
                        Notice: Found {diagnostics.otherRoomCards.length} wish{diagnostics.otherRoomCards.length > 1 ? 'es' : ''} in database under other room IDs:
                      </p>
                      <ul className="mt-1 list-disc list-inside space-y-0.5 text-[10px]">
                        {diagnostics.otherRoomCards.map((c) => (
                          <li key={c.id} className="truncate" title={`Room: ${c.roomId}`}>
                            Room <span className="font-bold">{c.roomId}</span> ({c.nickname}: "{c.message}")
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 font-sans text-[10px] text-amber-300/80">
                        Wishes are private to the room they were created in.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          items.map((item) => {
            const t = THEMES[item.theme] || THEMES.hinoki;
            const c = CATEGORIES[item.category] || CATEGORIES.wish;
            const CategoryIcon = c.icon;
            const canDelete = isDemo || item.authorId === currentUserId;
            const safeTime = typeof item.createdAt === 'number' && !isNaN(item.createdAt) ? item.createdAt : Date.now();
            const dateFormatted = new Date(safeTime).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            });

            return (
              <div
                key={item.id}
                className="relative overflow-hidden rounded-2xl border p-4 shadow-lg transition-transform hover:-translate-y-0.5"
                style={{
                  background: t.bg,
                  borderColor: `${t.border}40`,
                  color: t.text
                }}
              >
                {/* Top Cord and Peg hole visual */}
                <div className="mb-2 flex items-center justify-between border-b pb-2" style={{ borderColor: `${t.border}25` }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: `${t.border}25`, color: t.sub }}
                    >
                      <CategoryIcon size={11} />
                      <span>{c.label}</span>
                    </span>
                  </div>

                  {/* Delete button (Author only) */}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-white/40 hover:text-sakura-300 transition-colors"
                      title="Remove this wish"
                      aria-label="Remove this wish"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Ema Wish Message */}
                <p className="font-sans text-xs leading-relaxed break-words whitespace-pre-wrap py-1">
                  {item.message}
                </p>

                {/* Footer Signature & Date */}
                <div className="mt-3 flex items-center justify-between text-[11px] opacity-75 border-t pt-2" style={{ borderColor: `${t.border}20` }}>
                  <span className="font-mono text-[10px]">{dateFormatted}</span>
                  <span className="font-display font-bold text-xs" style={{ color: t.sub }}>
                    — {item.authorNickname}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
