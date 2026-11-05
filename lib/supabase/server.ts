import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads/writes the session from the Next.js cookie store via @supabase/ssr.
 *
 * In a Server Component the cookie store is read-only, so `setAll` can throw;
 * that is swallowed here because the middleware refreshes the session cookie on
 * every request (see middleware.ts). In Server Actions / Route Handlers the
 * write succeeds and the session is persisted.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component; the middleware handles the refresh.
          }
        },
      },
    },
  );
}
