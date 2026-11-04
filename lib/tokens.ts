import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed manage-booking tokens (requirements §3.2, §9). A guest manages a
 * booking via a link carrying a token that we can verify without a session.
 * The token is HMAC(secret, bookingId:expiry); we store only its hash on the
 * booking and embed the raw token in the link.
 */
function secret(): string {
  const s = process.env.MANAGE_TOKEN_SECRET;
  if (!s) throw new Error('MANAGE_TOKEN_SECRET is not set');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export interface ManageToken {
  token: string; // goes in the link
  hash: string; // stored on the booking
}

/** Create a manage token for a booking, valid until `expiresAt` (ms epoch). */
export function createManageToken(bookingId: string, expiresAt: number): ManageToken {
  const payload = `${bookingId}:${expiresAt}`;
  const sig = sign(payload);
  const token = `${expiresAt}.${sig}`;
  const hash = sign(token); // store a second-order hash, never the raw token
  return { token, hash };
}

/** Verify a token against a stored hash and check expiry. */
export function verifyManageToken(token: string, storedHash: string): boolean {
  const expected = sign(token);
  const a = Buffer.from(expected);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  const expiry = Number(token.split('.')[0]);
  if (!Number.isFinite(expiry)) return false;
  return Date.now() < expiry;
}
