/**
 * Review OTP: pure code generation / hashing / verification helpers (task 5.5,
 * requirement 7). No DB access here — `lib/review-verification.ts` wires this to the
 * `PhoneVerification` table (own model: Auth.js `VerificationToken` has no attempts
 * column, and an in-memory counter would not hold across serverless instances; see
 * docs/decisions.md). Only the HMAC of a code is ever stored.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_CODE_LENGTH = 6;
export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_SEND_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 } as const;

function secret(): string {
  const s = process.env.OTP_SECRET || process.env.MANAGE_TOKEN_SECRET;
  if (!s) throw new Error('OTP_SECRET (or MANAGE_TOKEN_SECRET) is not set');
  return s;
}

/** 6-digit numeric code, cryptographically random. Never logged. */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, '0');
}

/** HMAC of the code, bound to the booking so a code can't be replayed on another booking. */
export function hashOtpCode(bookingId: string, code: string): string {
  return createHmac('sha256', secret()).update(`${bookingId}:${code}`).digest('base64url');
}

/** Constant-time compare of two hashes (equal length required). */
export function verifyOtpHash(expectedHash: string, candidateHash: string): boolean {
  const a = Buffer.from(expectedHash);
  const b = Buffer.from(candidateHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Short-lived receipt proving OTP verification for one booking, without needing
 * DB state afterwards (guests have no User row to mark verified). HMAC-signed
 * `{bookingId, exp}`; the review form carries it as a hidden field and the submit
 * action re-checks it as its own trust boundary.
 */
export interface OtpReceipt {
  token: string;
  expiresAt: number;
}
export const OTP_RECEIPT_TTL_MS = 15 * 60 * 1000;

export function createOtpReceipt(bookingId: string, now = Date.now()): OtpReceipt {
  const expiresAt = now + OTP_RECEIPT_TTL_MS;
  const sig = createHmac('sha256', secret()).update(`receipt:${bookingId}:${expiresAt}`).digest('base64url');
  return { token: `${expiresAt}.${sig}`, expiresAt };
}

/** Verifies a receipt was issued for this exact booking and has not expired. */
export function verifyOtpReceipt(bookingId: string, receipt: string | undefined | null, now = Date.now()): boolean {
  if (!receipt) return false;
  const [expiryRaw, sig] = receipt.split('.');
  const expiresAt = Number(expiryRaw);
  if (!Number.isFinite(expiresAt) || !sig) return false;
  const expected = createHmac('sha256', secret()).update(`receipt:${bookingId}:${expiresAt}`).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return now < expiresAt;
}

/** `+357 ••••• 56` style masking: country code + last 2 digits visible, rest dotted. */
export function maskPhone(e164: string): string {
  const m = /^(\+\d{1,3})\d+(\d{2})$/.exec(e164.replace(/\s+/g, ''));
  if (!m) return '•••••';
  return `${m[1]} ••••• ${m[2]}`; // fixed dot count: does not reveal the number's length
}

export type CodeState = 'OPEN' | 'EXPIRED' | 'USED' | 'LOCKED';

/** Pure state of a stored code before a guess is compared. */
export function codeState(
  rec: { expiresAt: Date; attempts: number; consumedAt: Date | null },
  now: Date,
): CodeState {
  if (rec.consumedAt) return 'USED';
  if (rec.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (rec.attempts >= OTP_MAX_ATTEMPTS) return 'LOCKED';
  return 'OPEN';
}

/**
 * Send throttle from the createdAt times of this booking's codes: a resend cooldown
 * and a per-hour cap. Persisted rows, so it holds across instances and restarts.
 */
export function sendThrottle(
  createdAts: Date[],
  now: Date,
): { ok: true } | { ok: false; reason: 'COOLDOWN' | 'CAP'; retryAfterSec: number } {
  const t = now.getTime();
  const times = createdAts.map((d) => d.getTime()).sort((a, b) => b - a);
  const last = times[0];
  if (last !== undefined && t - last < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'COOLDOWN', retryAfterSec: Math.ceil((last + OTP_RESEND_COOLDOWN_MS - t) / 1000) };
  }
  const recent = times.filter((x) => x > t - OTP_SEND_LIMIT.windowMs);
  if (recent.length >= OTP_SEND_LIMIT.limit) {
    const oldest = recent[recent.length - 1]!;
    return { ok: false, reason: 'CAP', retryAfterSec: Math.ceil((oldest + OTP_SEND_LIMIT.windowMs - t) / 1000) };
  }
  return { ok: true };
}

/** Dev-only escape hatch: print the code when nothing can deliver it. Never in production. */
export function shouldLogDevOtp(env: { NODE_ENV?: string; TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string }): boolean {
  return env.NODE_ENV === 'development' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}
