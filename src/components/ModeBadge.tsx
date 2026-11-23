import { liveConfigured } from '../lib/env';

export function ModeBadge() {
  return liveConfigured
    ? <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">Live mode · Supabase</span>
    : <span title="Rooms work between tabs of this browser only. Add Supabase keys for real cross-device realtime." className="rounded-full bg-lantern-400/15 px-3 py-1 text-xs font-bold text-lantern-300">Local demo · this browser only</span>;
}
