/**
 * TEST-ONLY sign-in for browser tests (task 6.10). Real email / Google sign-in cannot run
 * offline, so we do what Auth.js itself does after a successful login: lib/auth.ts uses the
 * Prisma adapter with `session.strategy: 'database'`, so a session is a `Session` row whose
 * `sessionToken` is the value of the `authjs.session-token` cookie (plain, not a JWT).
 * We insert that row directly and put the cookie on the browser context. Nothing in
 * product code knows about this: there is no backdoor route, env flag or special token.
 * (Under https the cookie would be `__Secure-authjs.session-token`; e2e runs on http.)
 */
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import { db } from '../lib/db';

export const SESSION_COOKIE = 'authjs.session-token';

/** Creates a 1-day session for `userId` and returns the token (for cleanup/inspection). */
export async function signInAs(context: BrowserContext, userId: string): Promise<string> {
  const sessionToken = randomUUID();
  await db.session.create({
    data: { sessionToken, userId, expires: new Date(Date.now() + 24 * 3600_000) },
  });
  await context.addCookies([
    { name: SESSION_COOKIE, value: sessionToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  return sessionToken;
}
