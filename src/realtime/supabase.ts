import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../lib/env';

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseKey) throw new Error('Supabase is not configured');
    client = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    client.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        try {
          await client?.realtime.setAuth(session.access_token);
        } catch (e) {
          console.warn('[supabase] failed to sync realtime auth token on auth change', e);
        }
      }
    });
  }
  return client;
}
