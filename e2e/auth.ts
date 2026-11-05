/**
 * TEST-ONLY sign-in for browser tests (task 6.10), Supabase Auth edition.
 *
 * Real email / Google sign-in cannot run offline, so this helper reproduces the
 * end state of a successful Supabase login: a valid session whose tokens live in
 * the `@supabase/ssr` auth cookie on the browser context. It does this through
 * Supabase's admin + password APIs (no product backdoor, no special route):
 *
 *   1. Look up the Prisma user's email (the link key between Supabase Auth and
 *      the app's User table — see lib/current-user.ts).
 *   2. Ensure a Supabase auth user exists for that email with a known test
 *      password and a confirmed email (admin API; idempotent).
 *   3. Sign in with that password using a throwaway supabase-js client to obtain
 *      a real access/refresh token pair.
 *   4. Write the tokens into the `sb-<ref>-auth-token` cookie in the base64 JSON
 *      format @supabase/ssr expects, so the app's server client reads the session.
 *
 * Requirements (set in playwright.config.ts env): NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY must point at
 * a Supabase project you are willing to create throwaway auth users in.
 */
import type { BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { db } from '../lib/db';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TEST_PASSWORD = 'e2e-Test-Password-123!';

/** Project ref from the Supabase URL, used to name the auth cookie (sb-<ref>-auth-token). */
function projectRef(): string {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'localhost';
  } catch {
    return 'localhost';
  }
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Ensures a confirmed Supabase auth user with the given email + test password. */
async function ensureAuthUser(email: string): Promise<void> {
  const a = admin();
  const { error } = await a.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  // 422 = already registered; make sure the password matches what we sign in with.
  if (error && !/already/i.test(error.message)) throw error;
  if (error) {
    const { data } = await a.auth.admin.listUsers();
    const existing = data.users.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      await a.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD, email_confirm: true });
    }
  }
}

/** Signs in `userId`'s email on the Playwright context; returns the access token. */
export async function signInAs(context: BrowserContext, userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  if (!user.email) throw new Error(`signInAs: user ${userId} has no email`);
  const email = user.email.toLowerCase();

  await ensureAuthUser(email);

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw error ?? new Error('signInAs: no session returned');

  const cookieName = `sb-${projectRef()}-auth-token`;
  // @supabase/ssr stores the session as base64("base64-" + JSON) in one or more chunks.
  const payload = JSON.stringify(data.session);
  const value = `base64-${Buffer.from(payload).toString('base64')}`;

  await context.addCookies([
    { name: cookieName, value, domain: 'localhost', path: '/', httpOnly: false, sameSite: 'Lax' },
  ]);
  return data.session.access_token;
}
