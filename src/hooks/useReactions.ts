import { useCallback, useEffect, useRef, useState } from 'react';
import { REACTIONS, type Peer } from '../lib/types';
import { uid } from '../lib/ids';
import type { Session } from './useRoomSession';

export interface FloatReaction { id: string; emoji: string; nickname: string; x: number }
export interface Fx { id: string; emoji: string; nickname: string }
export const SPECIAL = new Set(['😭', '👑', '🔥', '🎉', '💀', '❤️']);
const valid = (e: unknown): e is string => typeof e === 'string' && (REACTIONS as readonly string[]).includes(e);

export function useReactions(session: Session | null, peers: Peer[], myNick: string) {
  const [floats, setFloats] = useState<FloatReaction[]>([]);
  const [fx, setFx] = useState<Fx[]>([]);
  const sent = useRef<number[]>([]);
  const recv = useRef(new Map<string, number[]>());
  const peersRef = useRef(peers); peersRef.current = peers;
  const fxRef = useRef(fx); fxRef.current = fx;

  const show = useCallback((emoji: string, nickname: string) => {
    const id = uid();
    setFloats((l) => [...l, { id, emoji, nickname, x: 8 + Math.random() * 78 }].slice(-24));
    setTimeout(() => setFloats((l) => l.filter((r) => r.id !== id)), 3600);
    // Special treatments: at most 2 at once, and never the same one twice at once (keeps playback smooth).
    if (SPECIAL.has(emoji) && fxRef.current.length < 2 && !fxRef.current.some((f) => f.emoji === emoji)) {
      setFx((l) => [...l, { id, emoji, nickname }]);
      setTimeout(() => setFx((l) => l.filter((f) => f.id !== id)), 2800);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    return session.transport.on('rx', (d, from) => {
      if (!d || !valid(d.emoji)) return;
      const now = Date.now();
      const h = (recv.current.get(from) ?? []).filter((x) => now - x < 3000);
      if (h.length >= 12) return;
      recv.current.set(from, [...h, now]);
      show(d.emoji, peersRef.current.find((p) => p.clientId === from)?.nickname ?? 'Someone');
    });
  }, [session, show]);

  const send = useCallback((emoji: string) => {
    if (!session || !valid(emoji)) return;
    const now = Date.now();
    sent.current = sent.current.filter((x) => now - x < 3000);
    if (sent.current.length >= 6) return; // client-side spam guard: 6 per 3s
    sent.current.push(now);
    show(emoji, myNick);
    session.transport.send('rx', { emoji });
  }, [session, show, myNick]);

  return { floats, fx, send };
}
