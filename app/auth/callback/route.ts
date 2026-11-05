import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { safeCallbackPath } from '@/lib/callback-url';
import { routing } from '@/i18n/routing';

/**
 * Supabase auth return URL. Handles every email/OAuth return:
 *  - OAuth (Google) / PKCE:        `?code=...`               -> exchangeCodeForSession
 *  - Email confirm / recovery link: `?token_hash=...&type=`  -> verifyOtp
 *  - Password recovery:             `?type=recovery`          -> land on /reset-password
 *
 * On success it syncs the Prisma `User` row (via getCurrentUser) and redirects
 * to the sanitised `next` path. On failure it bounces to sign-in with an error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const isRecovery = searchParams.get('type') === 'recovery';
  const next = safeCallbackPath(searchParams.get('next'), `/${routing.defaultLocale}/account`);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  const localeOf = (path: string) => {
    const seg = path.split('/')[1] ?? '';
    return (routing.locales as readonly string[]).includes(seg) ? seg : routing.defaultLocale;
  };

  if (!ok) {
    if (isRecovery) {
      return NextResponse.redirect(`${origin}/${localeOf(next)}/reset-password?error=ResetSessionExpired`);
    }
    return NextResponse.redirect(`${origin}/${localeOf(next)}/signin?error=EmailSignin`);
  }

  // Password recovery: the session is a short-lived recovery session. Send the
  // user to set a new password; don't sync/alter the Prisma row here.
  if (isRecovery) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Normal sign-in / OAuth / email confirmation: link or create the Prisma User.
  await getCurrentUser();
  return NextResponse.redirect(`${origin}${next}`);
}
