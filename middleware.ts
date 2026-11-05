import { type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

/**
 * Composes next-intl locale routing with Supabase session refresh.
 *
 * next-intl produces the response (locale cookie, rewrites). We then bind a
 * Supabase server client to the SAME request/response pair and call getUser(),
 * which rotates the auth token and writes the refreshed cookies onto that
 * response. Writing cookies to both the request and the response keeps the
 * session consistent for the rest of the pipeline (per @supabase/ssr guidance).
 */
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the session if it has expired; also keeps cookies in sync.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Match all paths except api, the auth callback, next internals, and files with an extension.
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
