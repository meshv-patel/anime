import type { Profile } from './types';
import { makeAvatar } from './avatar';

export const readJson = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
export const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };

export const loadProfile = (): Profile | null => {
  const p = readJson<Profile | null>('at_profile', null);
  return p && typeof p.nickname === 'string' && p.nickname ? p : null;
};
export const saveProfile = (p: Profile) => writeJson('at_profile', p);
export const defaultAvatar = makeAvatar('🌸', '#f4a6c0');

export interface Prefs { toasts: boolean; toastMs: number; sound: boolean }
export const loadPrefs = (): Prefs => ({ toasts: true, toastMs: 5000, sound: false, ...readJson<Partial<Prefs>>('at_prefs', {}) });
export const savePrefs = (p: Prefs) => writeJson('at_prefs', p);

export interface HistoryItem { title: string; url?: string; at: number }
export const loadHistory = () => readJson<HistoryItem[]>('at_history', []);
export function addHistory(item: HistoryItem) {
  const list = loadHistory().filter((h) => h.title !== item.title);
  writeJson('at_history', [item, ...list].slice(0, 8));
}
