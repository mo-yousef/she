import { describe, expect, it, vi } from 'vitest';
import { captureError, safeContext, scrubEvent, sentryOptions } from './monitoring';

describe('scrubEvent', () => {
  it('removes cookies, headers, body, query, user, breadcrumb data and messages', () => {
    const out = scrubEvent({
      request: {
        url: 'https://she.cy/en/b/x?token=secret#frag',
        data: { email: 'a@b.cy' },
        cookies: { s: '1' },
        headers: { cookie: 'x' },
        query_string: 'token=secret',
      },
      user: { email: 'a@b.cy', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'a@b.cy', data: { phone: '+357' }, category: 'fetch' } as never],
      message: 'Failed for a@b.cy',
      exception: { values: [{ value: 'bad input a@b.cy' }] },
    });
    expect(out.request).toEqual({ url: 'https://she.cy/en/b/x' });
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs).toEqual([{ category: 'fetch' }]);
    expect(out.message).toBeUndefined();
    expect(out.exception?.values?.[0]).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(/a@b\.cy|secret|1\.2\.3\.4/);
  });
  it('configures no default PII', () => {
    expect(sentryOptions(undefined)).toMatchObject({ enabled: false, sendDefaultPii: false });
  });
});

describe('captureError', () => {
  it('is a no-op without a DSN', () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    expect(() => captureError(new Error('x'), { area: 'test' })).not.toThrow();
    vi.unstubAllEnvs();
  });
  it('allowlists context to ids and codes', () => {
    expect(safeContext({ bookingId: 'b1', email: 'a@b.cy', area: 'x'.repeat(100) } as never)).toEqual({
      bookingId: 'b1',
      area: 'x'.repeat(64),
    });
  });
});
