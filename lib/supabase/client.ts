import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components (browser). Reads the public URL and
 * publishable key. Safe to call repeatedly; createBrowserClient memoises.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
