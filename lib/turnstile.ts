/**
 * Cloudflare Turnstile server-side verification (requirement 9), guest bookings only.
 * Signed-in customers skip it: they already passed Auth.js sign-in, and the per-IP /
 * per-phone limits still apply to them.
 *
 * Config (server): TURNSTILE_SECRET_KEY. The widget's site key is TURNSTILE_SITE_KEY,
 * read in the book page and passed to the stepper as a prop.
 * Mode:
 *  - production: always enforced. A missing secret is a misconfiguration and FAILS CLOSED.
 *  - development/test: enforced when the secret is set, otherwise skipped so local work
 *    does not need real keys.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: 'MISSING_TOKEN' | 'REJECTED' | 'MISCONFIGURED' | 'UNREACHABLE' };

export type TurnstileMode = 'enforce' | 'skip';

export function turnstileMode(env: { NODE_ENV?: string; TURNSTILE_SECRET_KEY?: string }): TurnstileMode {
  if (env.NODE_ENV === 'production') return 'enforce';
  return env.TURNSTILE_SECRET_KEY ? 'enforce' : 'skip';
}

/** Maps Cloudflare's siteverify JSON to a result. Anything unexpected is a rejection. */
export function parseSiteverify(body: unknown): TurnstileResult {
  if (typeof body !== 'object' || body === null) return { ok: false, reason: 'REJECTED' };
  const b = body as { success?: unknown; 'error-codes'?: unknown };
  if (b.success === true) return { ok: true };
  const codes = Array.isArray(b['error-codes']) ? b['error-codes'] : [];
  // These mean our config is wrong, not that the visitor failed the challenge.
  if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret')) {
    return { ok: false, reason: 'MISCONFIGURED' };
  }
  return { ok: false, reason: 'REJECTED' };
}

export async function verifyTurnstile(opts: {
  token: string | undefined;
  secret: string | undefined;
  ip: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  if (!opts.secret) return { ok: false, reason: 'MISCONFIGURED' };
  if (!opts.token) return { ok: false, reason: 'MISSING_TOKEN' };
  const form = new URLSearchParams({ secret: opts.secret, response: opts.token });
  if (opts.ip) form.set('remoteip', opts.ip);
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: 'UNREACHABLE' };
    return parseSiteverify(await res.json());
  } catch {
    return { ok: false, reason: 'UNREACHABLE' };
  }
}
