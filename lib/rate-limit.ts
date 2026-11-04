/**
 * Sliding-window rate limiter (requirement 9).
 *
 * shortcut: the store is a per-process in-memory Map. Chosen over a Postgres counter
 * table / Redis because the MVP runs as one instance and this adds no dependency or
 * migration. It resets on redeploy or cold start and is NOT shared across serverless
 * instances, so the effective limit is "per instance". Revisit (DB table or Upstash)
 * before scaling out. Logged in docs/shortcuts.md.
 */

export const BOOKING_IP_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;
export const BOOKING_PHONE_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 } as const;

export interface WindowResult {
  allowed: boolean;
  /** Timestamps still inside the window, including this attempt when allowed. */
  hits: number[];
  /** When blocked: ms until the oldest hit leaves the window. */
  retryAfterMs: number;
}

/** Pure sliding-window math: drop expired hits, then admit if under the limit. */
export function slidingWindow(hits: number[], now: number, limit: number, windowMs: number): WindowResult {
  const live = hits.filter((t) => t > now - windowMs);
  if (live.length >= limit) {
    return { allowed: false, hits: live, retryAfterMs: (live[0] ?? now) + windowMs - now };
  }
  return { allowed: true, hits: [...live, now], retryAfterMs: 0 };
}

const store = new Map<string, number[]>();
const MAX_KEYS = 10_000;

/** Records an attempt for `key` and reports whether it is within the limit. */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now(),
): boolean {
  const r = slidingWindow(store.get(key) ?? [], now, limit, windowMs);
  if (r.hits.length === 0) store.delete(key);
  else {
    // Re-insert so Map order approximates least-recently-used.
    store.delete(key);
    store.set(key, r.hits);
  }
  // Bound memory: evict the oldest-touched keys.
  while (store.size > MAX_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return r.allowed;
}

/** Test helper. */
export function resetRateLimits(): void {
  store.clear();
}

/** Caller IP from the proxy headers, or null when unknown. First hop of x-forwarded-for. */
export function clientIp(h: { get(name: string): string | null }): string | null {
  const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || h.get('x-real-ip')?.trim() || null;
}
