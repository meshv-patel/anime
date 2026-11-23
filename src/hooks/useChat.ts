import { useCallback, useEffect, useRef, useState } from 'react';
import { uid } from '../lib/ids';
import type { ChatMessage, Peer, Profile } from '../lib/types';
import type { Session } from './useRoomSession';
import type { Prefs } from '../lib/storage';

export interface Toast { id: string; nickname: string; avatar: string; text: string; spoiler: boolean }
const MAX_LEN = 500;

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.04;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.12);
  } catch { /* audio unavailable */ }
}

export function useChat(session: Session | null, me: Profile, peers: Peer[], chatVisible: boolean, showToasts: boolean, prefs: Prefs) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const peersRef = useRef(peers); peersRef.current = peers;
  const vis = useRef({ chatVisible, showToasts, prefs }); vis.current = { chatVisible, showToasts, prefs };
  const lastSent = useRef(0);
  const lastTyping = useRef(0);
  const rate = useRef(new Map<string, number[]>());
  const prevIds = useRef<Map<string, string> | null>(null);

  const push = useCallback((m: ChatMessage) => setMessages((l) => [...l, m].slice(-300)), []);

  useEffect(() => { if (chatVisible) setUnread(0); }, [chatVisible]);

  // join / leave system messages
  useEffect(() => {
    const cur = new Map(peers.map((p) => [p.clientId, p.nickname]));
    const prev = prevIds.current;
    prevIds.current = cur;
    if (!prev || !session) return;
    for (const [id, n] of cur) if (!prev.has(id) && id !== session.transport.clientId) push({ id: uid(), kind: 'system', clientId: id, nickname: n, avatar: '', text: `${n} joined the room`, ts: Date.now() });
    for (const [id, n] of prev) if (!cur.has(id)) push({ id: uid(), kind: 'system', clientId: id, nickname: n, avatar: '', text: `${n} left the room`, ts: Date.now() });
  }, [peers, session, push]);

  useEffect(() => {
    if (!session) return;
    const t = session.transport;
    const offChat = t.on('chat', (d, from) => {
      if (!d || typeof d.text !== 'string') return;
      const text = d.text.trim().slice(0, MAX_LEN);
      if (!text) return;
      const now = Date.now();
      const hist = (rate.current.get(from) ?? []).filter((x) => now - x < 5000);
      if (hist.length >= 8) return; // drop flooders
      rate.current.set(from, [...hist, now]);
      const kind = d.kind === 'prompt' ? 'prompt' : 'chat';
      const p = peersRef.current.find((x) => x.clientId === from); // identity comes from presence, not from the payload
      const msg: ChatMessage = { id: typeof d.id === 'string' ? d.id.slice(0, 40) : uid(), kind, clientId: from, nickname: p?.nickname ?? 'Someone', avatar: p?.avatar ?? '', text, spoiler: d.spoiler === true, ts: now };
      push(msg);
      setTyping((x) => { const { [from]: _, ...rest } = x; return rest; });
      const v = vis.current;
      if (!v.chatVisible) setUnread((n) => n + 1);
      if (v.prefs.sound) beep();
      if (v.showToasts && v.prefs.toasts) {
        const toast: Toast = { id: msg.id, nickname: msg.nickname, avatar: msg.avatar, text: msg.text, spoiler: !!msg.spoiler };
        setToasts((l) => [...l, toast].slice(-3));
        setTimeout(() => setToasts((l) => l.filter((x) => x.id !== toast.id)), v.prefs.toastMs);
      }
    });
    const offTyping = t.on('typing', (_d, from) => setTyping((x) => ({ ...x, [from]: Date.now() + 3000 })));
    const sweep = setInterval(() => setTyping((x) => {
      const now = Date.now(); const keep = Object.fromEntries(Object.entries(x).filter(([, until]) => until > now));
      return Object.keys(keep).length === Object.keys(x).length ? x : keep;
    }), 1000);
    return () => { offChat(); offTyping(); clearInterval(sweep); };
  }, [session, push]);

  const send = useCallback((text: string, spoiler = false, kind: 'chat' | 'prompt' = 'chat') => {
    const clean = text.trim().slice(0, MAX_LEN);
    if (!session || !clean) return false;
    const now = Date.now();
    if (now - lastSent.current < 600) return false; // basic spam protection
    lastSent.current = now;
    const id = uid();
    push({ id, kind, clientId: session.transport.clientId, nickname: me.nickname, avatar: me.avatar, text: clean, spoiler, ts: now });
    session.transport.send('chat', { id, text: clean, spoiler, kind });
    return true;
  }, [session, me, push]);

  const notifyTyping = useCallback(() => {
    if (!session || Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    session.transport.send('typing', {});
  }, [session]);

  const typingNames = peers.filter((p) => typing[p.clientId] > Date.now()).map((p) => p.nickname);
  return { messages, unread, toasts, typingNames, send, notifyTyping };
}
