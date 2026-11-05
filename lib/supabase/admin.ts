import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. SERVER-ONLY — the service_role key bypasses
 * RLS and can manage auth users. Never import this into client code.
 *
 * Used for privileged auth operations the anon key cannot do, e.g. deleting an
 * auth user during GDPR account erasure. Returns null when the key is unset so
 * callers can degrade gracefully in local/dev.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
