/**
 * Japanese Seasonal Atmosphere (四時の気配 — Shiji no Kehai)
 *
 * Provides:
 * - 4 distinct Japanese seasonal themes:
 *   - Haru (春) — Spring: Sakura pink, warm ivory, falling cherry blossoms.
 *   - Natsu (夏) — Summer: Soft sky blue, warm cream, festival twilight glow.
 *   - Aki (秋) — Autumn: Warm amber, momiji maple leaves, cozy evening glow.
 *   - Fuyu (冬) — Winter: Soft snowy white, muted blue, gentle falling snow.
 * - Automatic mode following Japan's seasonal calendar in Asia/Tokyo timezone.
 * - LocalStorage persistence with safe fallback.
 * - Reactive subscription pattern for instant room theme updates without reload.
 */

export type SeasonalTheme = 'spring' | 'summer' | 'autumn' | 'winter';
export type SeasonPreference = 'auto' | SeasonalTheme;

export const SEASON_STORAGE_KEY = 'at_season';

export interface SeasonMeta {
  id: SeasonalTheme;
  kanji: string;
  romaji: string;
  english: string;
  motif: string;
  accent: string;
  subAccent: string;
  bgGlow: string;
  description: string;
}

export const SEASONS: Record<SeasonalTheme, SeasonMeta> = {
  spring: {
    id: 'spring',
    kanji: '春',
    romaji: 'Haru',
    english: 'Spring',
    motif: '🌸',
    accent: '#f4a6c0',
    subAccent: '#f9cfdc',
    bgGlow: 'rgba(244, 166, 192, 0.12)',
    description: 'Soft sakura petals and warm spring ivory'
  },
  summer: {
    id: 'summer',
    kanji: '夏',
    romaji: 'Natsu',
    english: 'Summer',
    motif: '🎐',
    accent: '#7ec8e3',
    subAccent: '#ffd793',
    bgGlow: 'rgba(126, 200, 227, 0.10)',
    description: 'Twilight sky blue, festival lantern glow, and fūrin breeze'
  },
  autumn: {
    id: 'autumn',
    kanji: '秋',
    romaji: 'Aki',
    english: 'Autumn',
    motif: '🍁',
    accent: '#e07a5f',
    subAccent: '#ffb86b',
    bgGlow: 'rgba(224, 122, 95, 0.12)',
    description: 'Warm amber, falling momiji leaves, and evening twilight'
  },
  winter: {
    id: 'winter',
    kanji: '冬',
    romaji: 'Fuyu',
    english: 'Winter',
    motif: '❄️',
    accent: '#b0c4de',
    subAccent: '#e8f0fe',
    bgGlow: 'rgba(176, 196, 222, 0.10)',
    description: 'Quiet drifting snow and warm candlelight contrast'
  }
};

/**
 * Get the current month (1-12) in the Asia/Tokyo timezone.
 */
export function getTokyoMonth(date: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric'
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    // Safe fallback if Intl timezone is unavailable
    const utcHours = date.getUTCHours();
    const tokyoOffsetHours = 9;
    const tokyoDate = new Date(date.getTime() + (tokyoOffsetHours * 60 - date.getTimezoneOffset()) * 60000);
    return tokyoDate.getMonth() + 1;
  }
}

/**
 * Resolves the seasonal theme based on Japan's calendar:
 * - Spring (Haru): March–May (3, 4, 5)
 * - Summer (Natsu): June–August (6, 7, 8)
 * - Autumn (Aki): September–November (9, 10, 11)
 * - Winter (Fuyu): December–February (12, 1, 2)
 */
export function resolveAutoSeason(date: Date = new Date()): SeasonalTheme {
  const month = getTokyoMonth(date);
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * Validates whether a value is a valid SeasonPreference.
 */
export function isValidSeasonPreference(val: unknown): val is SeasonPreference {
  return val === 'auto' || val === 'spring' || val === 'summer' || val === 'autumn' || val === 'winter';
}

/**
 * Load the user's seasonal preference from localStorage.
 * Safely defaults to 'auto' if missing or corrupted.
 */
export function loadSeasonPreference(): SeasonPreference {
  try {
    if (typeof localStorage === 'undefined') return 'auto';
    const stored = localStorage.getItem(SEASON_STORAGE_KEY);
    if (stored && isValidSeasonPreference(stored)) {
      return stored;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Save seasonal preference to localStorage and notify active listeners.
 */
export function saveSeasonPreference(pref: SeasonPreference): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SEASON_STORAGE_KEY, pref);
    }
  } catch {
    /* storage may be blocked */
  }
  notifySeasonListeners(pref);
}

/**
 * Resolve the effective active season given a preference and optional reference date.
 */
export function resolveActiveSeason(pref: SeasonPreference, date: Date = new Date()): SeasonalTheme {
  if (pref === 'auto') {
    return resolveAutoSeason(date);
  }
  return pref;
}

// Lightweight listener subscription system for instant reactive changes
type SeasonListener = (pref: SeasonPreference, active: SeasonalTheme) => void;
const listeners = new Set<SeasonListener>();

export function subscribeSeason(listener: SeasonListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySeasonListeners(pref: SeasonPreference): void {
  const active = resolveActiveSeason(pref);
  listeners.forEach((fn) => {
    try {
      fn(pref, active);
    } catch (err) {
      console.warn('[season] listener error', err);
    }
  });
}
