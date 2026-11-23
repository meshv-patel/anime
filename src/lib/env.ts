const get = (val: string | undefined, key: string): string => {
  if (typeof val === 'string' && val.trim() !== '') return val.trim();
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (proc?.env && typeof proc.env[key] === 'string') return (proc.env[key] ?? '').trim();
  return '';
};

// Strict isolation guard: Staging mode must never connect to production or run with incomplete config
const PROTECTED_PROD_REF = 'kpokzlxacmjtjmlzhgqi';

if (import.meta.env?.MODE === 'staging') {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  if (url.includes(PROTECTED_PROD_REF)) {
    throw new Error(
      `[SECURITY FATAL] Staging mode cannot connect to production project (${PROTECTED_PROD_REF}). Check your .env.staging.local.`
    );
  }
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error(
      '[SECURITY FATAL] Staging mode requires both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be explicitly defined.'
    );
  }
}

export const env = {
  supabaseUrl: get(import.meta.env?.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  supabaseKey: get(import.meta.env?.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY'),
  privateChannels: get(import.meta.env?.VITE_REALTIME_PRIVATE, 'VITE_REALTIME_PRIVATE') !== 'false',
  stunUrls: (get(import.meta.env?.VITE_STUN_URLS, 'VITE_STUN_URLS') || 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean),
  turnUrl: get(import.meta.env?.VITE_TURN_URL, 'VITE_TURN_URL'),
  turnUser: get(import.meta.env?.VITE_TURN_USERNAME, 'VITE_TURN_USERNAME'),
  // Security note: VITE_TURN_CREDENTIAL is browser-visible and must only be used for local disposable testing.
  // Staging and production deployments should generate short-lived ephemeral tokens (RFC 5766).
  turnCred: get(import.meta.env?.VITE_TURN_CREDENTIAL, 'VITE_TURN_CREDENTIAL')
};

/** True only when both Supabase values are present. Otherwise the app runs in Local Demo Mode. */
export const liveConfigured = Boolean(env.supabaseUrl && env.supabaseKey);

export function iceConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls: env.stunUrls }];
  if (env.turnUrl) iceServers.push({ urls: env.turnUrl.split(',').map((s) => s.trim()), username: env.turnUser, credential: env.turnCred });
  return { iceServers };
}
