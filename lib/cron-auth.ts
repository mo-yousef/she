import { timingSafeEqual } from 'node:crypto';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed: an unset or
 * empty secret authorises nothing, in every environment.
 */
export function isCronAuthorized(header: string | null, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
