import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from './cron-auth';

describe('isCronAuthorized', () => {
  it('accepts the exact bearer secret', () => {
    expect(isCronAuthorized('Bearer s3cret', 's3cret')).toBe(true);
  });
  it('rejects a missing header, a wrong secret, and a wrong scheme', () => {
    expect(isCronAuthorized(null, 's3cret')).toBe(false);
    expect(isCronAuthorized('Bearer nope', 's3cret')).toBe(false);
    expect(isCronAuthorized('Bearer s3cret2', 's3cret')).toBe(false);
    expect(isCronAuthorized('s3cret', 's3cret')).toBe(false);
  });
  it('fails closed when CRON_SECRET is unset or empty', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false);
  });
});
