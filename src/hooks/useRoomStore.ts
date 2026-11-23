import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Moment, WatchItem, EmaPlaque, EmaTheme, EmaCategory, EmaDiagnostics } from '../lib/types';
import { createStore } from '../services/roomStore';
import type { Session } from './useRoomSession';

export function useRoomStore(roomId: string, session: Session | null) {
  const store = useMemo(() => createStore(roomId), [roomId]);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [emaList, setEmaList] = useState<EmaPlaque[]>([]);
  const [emaDiagnostics, setEmaDiagnostics] = useState<EmaDiagnostics | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [wRes, mRes, eRes] = await Promise.allSettled([
      store.watchlist(),
      store.moments(),
      store.emaList()
    ]);

    const errors: string[] = [];

    if (wRes.status === 'fulfilled') {
      setWatch(wRes.value);
    } else {
      errors.push(`Watchlist: ${(wRes.reason as Error)?.message || 'Failed to load'}`);
    }

    if (mRes.status === 'fulfilled') {
      setMoments(mRes.value);
    } else {
      errors.push(`Moments: ${(mRes.reason as Error)?.message || 'Failed to load'}`);
    }

    if (eRes.status === 'fulfilled') {
      setEmaList(eRes.value);
    } else {
      errors.push(`Wishes: ${(eRes.reason as Error)?.message || 'Failed to load'}`);
    }

    setEmaDiagnostics(store.getEmaDiagnostics?.() ?? null);

    if (errors.length > 0) {
      setError(errors.join(' | '));
    } else {
      setError('');
    }
  }, [store]);

  useEffect(() => {
    if (!session) return;
    void load();
    const offs = [
      session.transport.on('wl', () => void load()),
      session.transport.on('mom', () => void load()),
      session.transport.on('ema', () => void load())
    ];
    return () => offs.forEach((o) => o());
  }, [session, load]);

  const run = (ping: 'wl' | 'mom' | 'ema', fn: () => Promise<void>) => async () => {
    try {
      await fn();
      await load();
      session?.transport.send(ping, {});
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      throw e;
    }
  };
  return {
    watch, moments, emaList, emaDiagnostics, error,
    addWatch: (t: string) => run('wl', () => store.addWatch(t.trim().slice(0, 120)))(),
    updateWatch: (id: string, p: Partial<Pick<WatchItem, 'status' | 'progress'>>) => run('wl', () => store.updateWatch(id, p))(),
    removeWatch: (id: string) => run('wl', () => store.removeWatch(id))(),
    addMoment: (m: Omit<Moment, 'id' | 'createdAt'>) => run('mom', () => store.addMoment(m))(),
    removeMoment: (id: string) => run('mom', () => store.removeMoment(id))(),
    addEma: (ema: { message: string; authorNickname: string; theme: EmaTheme; category: EmaCategory; authorId?: string }) =>
      run('ema', () => store.addEma({ ...ema, authorId: ema.authorId ?? session?.userId }))(),
    removeEma: (id: string) => run('ema', () => store.removeEma(id))(),
    reload: load
  };
}
