import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import type { Fx, FloatReaction } from '../hooks/useReactions';
import type { Toast } from '../hooks/useChat';
import { Avatar } from './Avatar';

const LABEL: Record<string, string> = { '😭': 'Emotional Damage', '👑': 'Legendary Moment', '🔥': 'Hype Mode', '🎉': 'Celebration!', '💀': "I'm Dead", '❤️': 'Wholesome Moment' };
const CONF = ['#f4a6c0', '#ffd793', '#cbb8ff', '#8fd3c8', '#9cc4ff', '#ee80a6'];

function FxScene({ fx }: { fx: Fx }) {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${(i % 8) * 0.12}s`, dx: `${((i * 53) % 120) - 60}px`, c: CONF[i % CONF.length] })), []);
  const hearts = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ left: `${10 + ((i * 41) % 80)}%`, delay: `${(i % 5) * 0.2}s`, size: 22 + ((i * 7) % 18) })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {fx.emoji === '😭' && <div className="fx-pink absolute inset-0" />}
      {fx.emoji === '👑' && <div className="fx-gold absolute inset-0" />}
      {fx.emoji === '🔥' && <div className="fx-fire absolute inset-0" />}
      {fx.emoji === '🎉' && bits.map((b, i) => <i key={i} className="fx-conf" style={{ left: b.left, animationDelay: b.delay, background: b.c, ['--dx' as string]: b.dx }} />)}
      {fx.emoji === '❤️' && hearts.map((h, i) => <span key={i} className="fx-heart" style={{ left: h.left, animationDelay: h.delay, fontSize: h.size }}>{i % 2 ? '💗' : '❤️'}</span>)}
      {fx.emoji === '💀' && <><div className="fx-dim absolute inset-0" /><div className="absolute inset-0 grid place-items-center"><span className="fx-skull text-8xl">💀</span></div></>}
      <motion.div initial={{ opacity: 0, y: -12, scale: .9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
        className="absolute left-1/2 top-[14%] -translate-x-1/2 rounded-full bg-black/55 px-5 py-2 text-center font-display text-lg font-extrabold backdrop-blur sm:text-2xl">
        {LABEL[fx.emoji]} <span className="block text-xs font-sans font-medium text-paper/70">{fx.nickname}</span>
      </motion.div>
    </div>
  );
}

export function FxLayer({ fx }: { fx: Fx[] }) { return <AnimatePresence>{fx.map((f) => <FxScene key={f.id} fx={f} />)}</AnimatePresence>; }

export function FloatLayer({ items }: { items: FloatReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((r) => (
        <motion.div key={r.id} className="absolute bottom-16 flex flex-col items-center" style={{ left: `${r.x}%` }}
          initial={{ y: 0, opacity: 0, scale: .5 }} animate={{ y: -260, opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 1], x: [0, 14, -14, 8] }} transition={{ duration: 3.4, ease: 'easeOut' }}>
          <span className="text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,.6)]">{r.emoji}</span>
          <span className="mt-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold">{r.nickname}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** Rendered INSIDE the fullscreen stage element so it is visible in browser fullscreen. Top-right, clear of the bottom control bar. */
export function ToastLayer({ toasts, unread }: { toasts: Toast[]; unread: number }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex w-[min(20rem,70%)] flex-col items-end gap-2" aria-live="polite">
      {unread > 0 && <span className="rounded-full bg-lantern-400 px-3 py-1 text-xs font-extrabold text-ink-950">{unread} unread</span>}
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            className="flex w-full items-start gap-2 rounded-2xl border border-white/10 bg-black/70 p-2.5 backdrop-blur">
            <Avatar value={t.avatar} size={28} />
            <div className="min-w-0 text-sm"><p className="truncate text-xs font-bold text-lantern-300">{t.nickname}</p><p className="line-clamp-2 break-words">{t.spoiler ? 'Spoiler message (hidden)' : t.text}</p></div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function CountdownOverlay({ n }: { n: number | null }) {
  return (
    <AnimatePresence>
      {n !== null && (
        <motion.div key={n} initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }} transition={{ duration: .45 }}
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/40"><span className="font-display text-[10rem] font-extrabold text-lantern-300">{n}</span></motion.div>
      )}
    </AnimatePresence>
  );
}
