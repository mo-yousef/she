import { beforeAll, describe, expect, it } from 'vitest';
import {
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RECEIPT_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_SEND_LIMIT,
  codeState,
  createOtpReceipt,
  generateOtpCode,
  hashOtpCode,
  maskPhone,
  sendThrottle,
  shouldLogDevOtp,
  verifyOtpHash,
  verifyOtpReceipt,
} from './review-otp';

beforeAll(() => {
  process.env.MANAGE_TOKEN_SECRET = 'unit-test-secret';
});

const now = new Date('2026-11-10T10:00:00Z');

describe('OTP code + hash', () => {
  it('generates 6 digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
  it('hash is deterministic, booking-bound and never contains the code', () => {
    const h = hashOtpCode('b1', '123456');
    expect(hashOtpCode('b1', '123456')).toBe(h);
    expect(hashOtpCode('b2', '123456')).not.toBe(h);
    expect(hashOtpCode('b1', '123457')).not.toBe(h);
    expect(h).not.toContain('123456');
  });
  it('verifyOtpHash accepts equal and rejects different / different length', () => {
    const h = hashOtpCode('b1', '123456');
    expect(verifyOtpHash(h, hashOtpCode('b1', '123456'))).toBe(true);
    expect(verifyOtpHash(h, hashOtpCode('b1', '000000'))).toBe(false);
    expect(verifyOtpHash(h, 'short')).toBe(false);
  });
});

describe('codeState', () => {
  const open = { expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS), attempts: 0, consumedAt: null };
  it('open code', () => expect(codeState(open, now)).toBe('OPEN'));
  it('expired at the boundary', () =>
    expect(codeState({ ...open, expiresAt: now }, now)).toBe('EXPIRED'));
  it('locked after the attempt cap', () =>
    expect(codeState({ ...open, attempts: OTP_MAX_ATTEMPTS }, now)).toBe('LOCKED'));
  it('still open one attempt below the cap', () =>
    expect(codeState({ ...open, attempts: OTP_MAX_ATTEMPTS - 1 }, now)).toBe('OPEN'));
  it('consumed beats everything (single use)', () =>
    expect(codeState({ ...open, consumedAt: now }, now)).toBe('USED'));
});

describe('sendThrottle', () => {
  it('allows the first send', () => expect(sendThrottle([], now)).toEqual({ ok: true }));
  it('enforces the resend cooldown with a retry hint', () => {
    const r = sendThrottle([new Date(now.getTime() - 20_000)], now);
    expect(r).toEqual({ ok: false, reason: 'COOLDOWN', retryAfterSec: 40 });
  });
  it('allows after the cooldown', () => {
    expect(sendThrottle([new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS)], now).ok).toBe(true);
  });
  it('caps sends per hour', () => {
    const times = Array.from({ length: OTP_SEND_LIMIT.limit }, (_, i) => new Date(now.getTime() - (10 + i * 5) * 60_000));
    const r = sendThrottle(times, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CAP');
  });
  it('old sends fall out of the hour window', () => {
    const times = Array.from({ length: 5 }, (_, i) => new Date(now.getTime() - (61 + i) * 60_000));
    expect(sendThrottle(times, now).ok).toBe(true);
  });
});

describe('receipt', () => {
  it('verifies for the same booking before expiry', () => {
    const r = createOtpReceipt('b1', now.getTime());
    expect(verifyOtpReceipt('b1', r.token, now.getTime() + 1000)).toBe(true);
  });
  it('rejects another booking, expiry, tampering and empty values', () => {
    const r = createOtpReceipt('b1', now.getTime());
    expect(verifyOtpReceipt('b2', r.token, now.getTime())).toBe(false);
    expect(verifyOtpReceipt('b1', r.token, now.getTime() + OTP_RECEIPT_TTL_MS)).toBe(false);
    const [exp, sig] = r.token.split('.');
    expect(verifyOtpReceipt('b1', `${Number(exp) + 60_000}.${sig}`, now.getTime())).toBe(false);
    expect(verifyOtpReceipt('b1', `${exp}.x${sig}`, now.getTime())).toBe(false);
    expect(verifyOtpReceipt('b1', '', now.getTime())).toBe(false);
    expect(verifyOtpReceipt('b1', undefined, now.getTime())).toBe(false);
  });
});

describe('maskPhone', () => {
  it('keeps country code and last two digits', () => expect(maskPhone('+35799123456')).toBe('+357 ••••• 56'));
  it('does not leak anything for junk', () => expect(maskPhone('abc')).toBe('•••••'));
});

describe('shouldLogDevOtp', () => {
  it('only in development without Twilio keys', () => {
    expect(shouldLogDevOtp({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldLogDevOtp({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldLogDevOtp({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldLogDevOtp({ NODE_ENV: 'development', TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b' })).toBe(false);
  });
});

describe('otpMessageBody (localized)', () => {
  it('renders the code, business and expiry in en / el / ru without leftover placeholders', async () => {
    const { otpMessageBody } = await import('./review-otp-message');
    for (const locale of ['en', 'el', 'ru']) {
      const body = otpMessageBody(locale, 'Salon Test', '123456');
      expect(body).toContain('123456');
      expect(body).toContain('Salon Test');
      expect(body).toContain('10');
      expect(body).not.toMatch(/[{}]/);
    }
    expect(otpMessageBody('el', 'X', '123456')).not.toBe(otpMessageBody('en', 'X', '123456'));
  });
});
