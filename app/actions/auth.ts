'use server';

/**
 * Email + password auth server actions (Fresha-style), backed by Supabase Auth.
 *
 * The form actions follow the `useActionState` signature
 * `(prevState, formData) => Promise<AuthFormState>` so the UI can show errors
 * next to the field that caused them. Validation failures RETURN state (field
 * errors keyed by input name, plus repopulated non-secret values); only a
 * successful auth redirects. Error values are i18n keys the client translates
 * via `account.error.*`.
 *
 * Roles live in the Prisma `User` table (see lib/current-user.ts); signup
 * carries an `intended_role` in Supabase user metadata, applied on first
 * creation only.
 */
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';
import { safeCallbackPath } from '@/lib/callback-url';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
// At least 8 chars, with at least one letter and one number.
const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v));
const nameSchema = z.string().trim().min(1).max(100);

type Role = 'CUSTOMER' | 'OWNER';

/** Field names that can carry an inline error. */
export type AuthField = 'name' | 'email' | 'password' | 'confirmPassword';

export interface AuthFormState {
  /** Inline errors, keyed by field name; value is an `account.error.*` key. */
  fieldErrors?: Partial<Record<AuthField, string>>;
  /** A form-level error (banner); value is an `account.error.*` key. */
  formError?: string;
  /** A form-level status/notice (banner); value is an `account.*` key. */
  formNotice?: string;
  /** Non-secret values to repopulate the form after a failed submit. */
  values?: { name?: string; email?: string };
}

function parse(fd: FormData) {
  const rawLocale = String(fd.get('locale') ?? '');
  const locale = (routing.locales as readonly string[]).includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const callback = safeCallbackPath(fd.get('callbackUrl'), `/${locale}/account`);
  return { locale, callback };
}

/** Absolute origin for building Supabase redirect URLs (server-side). */
async function siteOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

// ---- Sign in ----
export async function signInWithPasswordAction(
  _prev: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const { locale, callback } = parse(fd);
  const rawEmail = String(fd.get('email') ?? '');
  const email = emailSchema.safeParse(fd.get('email'));
  const password = String(fd.get('password') ?? '');

  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if (!email.success) fieldErrors.email = 'EmailInvalid';
  if (!password) fieldErrors.password = 'PasswordRequired';
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: { email: rawEmail } };

  const ip = clientIp(await headers());
  if (ip && !rateLimit(`signin:ip:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) {
    return { formError: 'RateLimited', values: { email: rawEmail } };
  }
  if (!rateLimit(`signin:email:${email.data}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return { formError: 'RateLimited', values: { email: rawEmail } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data!, password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('email not confirmed')) {
      return { formError: 'EmailNotConfirmed', values: { email: rawEmail } };
    }
    // Wrong email/password: show under the password field (don't reveal which was wrong).
    return { fieldErrors: { password: 'InvalidCredentials' }, values: { email: rawEmail } };
  }
  redirect(callback);
}

// ---- Sign up (customer or business) ----
async function signUp(fd: FormData, role: Role): Promise<AuthFormState> {
  const { locale, callback } = parse(fd);
  const rawName = String(fd.get('name') ?? '');
  const rawEmail = String(fd.get('email') ?? '');
  const name = nameSchema.safeParse(fd.get('name'));
  const email = emailSchema.safeParse(fd.get('email'));
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirmPassword') ?? '');
  const values = { name: rawName, email: rawEmail };

  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if (!name.success) fieldErrors.name = 'NameRequired';
  if (!email.success) fieldErrors.email = 'EmailInvalid';
  if (!passwordSchema.safeParse(password).success) fieldErrors.password = 'PasswordTooShort';
  else if (password !== confirm) fieldErrors.confirmPassword = 'PasswordMismatch';
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const ip = clientIp(await headers());
  if (ip && !rateLimit(`signup:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return { formError: 'RateLimited', values };
  }

  const origin = await siteOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.data!,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(callback)}`,
      data: { full_name: name.data, intended_role: role },
    },
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('already registered') || m.includes('already exists') || error.status === 422) {
      return { fieldErrors: { email: 'EmailTaken' }, values };
    }
    return { formError: 'SignUpFailed', values };
  }

  // Confirmation OFF -> active session -> straight in. Confirmation ON -> no
  // session yet; send the user to sign-in with a "confirm your email" notice.
  if (!data.session) {
    redirect(`/${locale}/signin?${new URLSearchParams({ callbackUrl: callback, pending: '1' })}`);
  }
  redirect(callback);
}

export async function signUpCustomerAction(
  _prev: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  return signUp(fd, 'CUSTOMER');
}

export async function signUpBusinessAction(
  _prev: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  return signUp(fd, 'OWNER');
}

// ---- Forgot / reset password ----
export async function requestPasswordResetAction(
  _prev: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const { locale } = parse(fd);
  const rawEmail = String(fd.get('email') ?? '');
  const email = emailSchema.safeParse(fd.get('email'));
  if (!email.success) return { fieldErrors: { email: 'EmailInvalid' }, values: { email: rawEmail } };

  const ip = clientIp(await headers());
  if (ip && !rateLimit(`reset:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return { formError: 'RateLimited', values: { email: rawEmail } };
  }
  if (!rateLimit(`reset:email:${email.data}`, { limit: 3, windowMs: 10 * 60_000 })) {
    return { formError: 'RateLimited', values: { email: rawEmail } };
  }

  const origin = await siteOrigin();
  const supabase = await createClient();
  // Success is not conditioned on whether the email exists (no account enumeration).
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?type=recovery&next=${encodeURIComponent(`/${locale}/reset-password`)}`,
  });
  // Signal "sent" via a page redirect so a refresh doesn't resubmit.
  redirect(`/${locale}/forgot-password?sent=1`);
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  fd: FormData,
): Promise<AuthFormState> {
  const { locale } = parse(fd);
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirmPassword') ?? '');

  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if (!passwordSchema.safeParse(password).success) fieldErrors.password = 'PasswordTooShort';
  else if (password !== confirm) fieldErrors.confirmPassword = 'PasswordMismatch';
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The recovery session is established by /auth/callback; without it we can't update.
  if (!user) return { formError: 'ResetSessionExpired' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { formError: 'ResetSessionExpired' };
  redirect(`/${locale}/reset-password?done=1`);
}

// ---- OAuth (scaffolded; enabled per provider via dashboard + flag) ----
export async function signInWithGoogleAction(fd: FormData): Promise<void> {
  const { locale, callback } = parse(fd);
  const origin = await siteOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(callback)}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error || !data?.url) {
    redirect(`/${locale}/signin?${new URLSearchParams({ callbackUrl: callback, error: 'OAuthSignin' })}`);
  }
  redirect(data.url);
}

// ---- Sign out ----
export async function signOutAction(fd: FormData): Promise<void> {
  const { locale } = parse(fd);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/account`);
}
