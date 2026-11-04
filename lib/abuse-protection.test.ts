import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, rateLimit, resetRateLimits, slidingWindow } from './rate-limit';
import { parseSiteverify, turnstileMode, verifyTurnstile } from './turnstile';

describe('slidingWindow', () => {
  it('admits up to the limit then blocks with a retry delay', () => {
    let hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = slidingWindow(hits, 1000 + i, 3, 10_000);
      expect(r.allowed).toBe(true);
      hits = r.hits;
    }
    const blocked = slidingWindow(hits, 1003, 3, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000 + 10_000 - 1003);
    expect(blocked.hits).toHaveLength(3);
  });

  it('frees a slot once the oldest hit leaves the window', () => {
    const r = slidingWindow([1000, 2000, 3000], 11_000, 3, 10_000);
    expect(r.allowed).toBe(true);
    expect(r.hits).toEqual([2000, 3000, 11_000]);
  });
});

describe('rateLimit store', () => {
  beforeEach(resetRateLimits);
  it('tracks keys independently', () => {
    const cfg = { limit: 1, windowMs: 1000 };
    expect(rateLimit('a', cfg, 0)).toBe(true);
    expect(rateLimit('a', cfg, 1)).toBe(false);
    expect(rateLimit('b', cfg, 1)).toBe(true);
    expect(rateLimit('a', cfg, 1001)).toBe(true);
  });
});

describe('clientIp', () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
  it('uses the first x-forwarded-for hop, then x-real-ip, else null', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(clientIp(h({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
    expect(clientIp(h({}))).toBeNull();
  });
});

describe('parseSiteverify', () => {
  it('maps success, rejection and secret misconfiguration', () => {
    expect(parseSiteverify({ success: true })).toEqual({ ok: true });
    expect(parseSiteverify({ success: false, 'error-codes': ['invalid-input-response'] })).toEqual({
      ok: false,
      reason: 'REJECTED',
    });
    expect(parseSiteverify({ success: false, 'error-codes': ['invalid-input-secret'] })).toEqual({
      ok: false,
      reason: 'MISCONFIGURED',
    });
    expect(parseSiteverify(null)).toEqual({ ok: false, reason: 'REJECTED' });
  });
});

describe('turnstileMode', () => {
  it('fails closed in production, skips in dev without a secret', () => {
    expect(turnstileMode({ NODE_ENV: 'production' })).toBe('enforce');
    expect(turnstileMode({ NODE_ENV: 'development' })).toBe('skip');
    expect(turnstileMode({ NODE_ENV: 'development', TURNSTILE_SECRET_KEY: 's' })).toBe('enforce');
  });
});

describe('verifyTurnstile', () => {
  const json = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

  it('posts secret, token and ip and accepts success', async () => {
    const f = json({ success: true });
    const r = await verifyTurnstile({ token: 'tok', secret: 'sec', ip: '1.2.3.4', fetchImpl: f as never });
    expect(r).toEqual({ ok: true });
    const body = (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get('secret')).toBe('sec');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('rejects without calling Cloudflare when token or secret is missing', async () => {
    const f = json({ success: true });
    expect(await verifyTurnstile({ token: undefined, secret: 's', ip: null, fetchImpl: f as never })).toEqual({
      ok: false,
      reason: 'MISSING_TOKEN',
    });
    expect(await verifyTurnstile({ token: 't', secret: undefined, ip: null, fetchImpl: f as never })).toEqual({
      ok: false,
      reason: 'MISCONFIGURED',
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('fails closed on HTTP errors and network failures', async () => {
    const bad = await verifyTurnstile({ token: 't', secret: 's', ip: null, fetchImpl: json({}, false) as never });
    expect(bad).toEqual({ ok: false, reason: 'UNREACHABLE' });
    const boom = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await verifyTurnstile({ token: 't', secret: 's', ip: null, fetchImpl: boom as never })).toEqual({
      ok: false,
      reason: 'UNREACHABLE',
    });
  });
});
