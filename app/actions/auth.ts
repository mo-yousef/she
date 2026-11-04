'use server';

/**
 * Sign-in / sign-out server actions for the account page (task 6.1). Inputs are validated
 * with Zod; `callbackUrl` is reduced to a same-origin relative path (open-redirect safe).
 */
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth';
import { routing } from '@/i18n/routing';
import { safeCallbackPath } from '@/lib/callback-url';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { headers } from 'next/headers';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

function parse(fd: FormData) {
  const rawLocale = String(fd.get('locale') ?? '');
  const locale = (routing.locales as readonly string[]).includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const callback = safeCallbackPath(fd.get('callbackUrl'), `/${locale}/account`);
  return { locale, callback };
}

const accountUrl = (locale: string, callback: string, extra: Record<string, string>) =>
  `/${locale}/account?${new URLSearchParams({ callbackUrl: callback, ...extra })}`;

export async function signInWithEmailAction(fd: FormData): Promise<void> {
  const { locale, callback } = parse(fd);
  const email = emailSchema.safeParse(fd.get('email'));
  if (!email.success) redirect(accountUrl(locale, callback, { error: 'EmailInvalid' }));

  const ip = clientIp(await headers());
  if (ip && !rateLimit(`signin:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
    redirect(accountUrl(locale, callback, { error: 'RateLimited' }));
  }
  if (!rateLimit(`signin:email:${email.data}`, { limit: 3, windowMs: 10 * 60_000 })) {
    redirect(accountUrl(locale, callback, { error: 'RateLimited' }));
  }

  try {
    // With redirect:false Auth.js v5 returns the target URL; a failed send comes back as an
    // error URL (…?error=…) instead of throwing, so it must be checked explicitly.
    const result = await signIn('nodemailer', { email: email.data, redirect: false, redirectTo: callback });
    if (typeof result === 'string' && /[?&]error=/.test(result)) {
      redirect(accountUrl(locale, callback, { error: 'EmailSignin' }));
    }
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    redirect(accountUrl(locale, callback, { error: 'EmailSignin' }));
  }
  redirect(accountUrl(locale, callback, { sent: '1' }));
}

export async function signInWithGoogleAction(fd: FormData): Promise<void> {
  const { callback } = parse(fd);
  // Throws NEXT_REDIRECT to Google; any real failure surfaces on the Auth.js error page path.
  await signIn('google', { redirectTo: callback });
}

export async function signOutAction(fd: FormData): Promise<void> {
  const { locale } = parse(fd);
  await signOut({ redirectTo: `/${locale}/account` });
}
