import { describe, expect, it } from 'vitest';
import {
  audienceTemplate,
  overwritableBy,
  resendStatus,
  resultToRow,
  statusRank,
  twilioStatus,
} from './status';
import { twilioStatusCallback } from './twilio';

describe('resultToRow', () => {
  it('maps success to SENT with the provider id', () => {
    expect(resultToRow({ ok: true, channel: 'SMS', providerId: 'SM1' })).toEqual({
      channel: 'SMS',
      status: 'SENT',
      providerId: 'SM1',
    });
  });
  it('maps failure to its code, no provider id, and carries nothing else', () => {
    const row = resultToRow({ ok: false, channel: 'EMAIL', code: 'RATE_LIMITED' });
    expect(row).toEqual({ channel: 'EMAIL', status: 'RATE_LIMITED', providerId: null });
    expect(Object.keys(row).sort()).toEqual(['channel', 'providerId', 'status']);
  });
});

describe('audienceTemplate', () => {
  it('suffixes business rows unless the kind is already business-specific', () => {
    expect(audienceTemplate('booking-cancelled', 'business')).toBe('booking-cancelled:business');
    expect(audienceTemplate('booking-new-business', 'business')).toBe('booking-new-business');
    expect(audienceTemplate('booking-cancelled', 'customer')).toBe('booking-cancelled');
  });
});

describe('provider status mapping', () => {
  it('maps Twilio statuses', () => {
    expect(twilioStatus('sent')).toBe('SENT');
    expect(twilioStatus('delivered')).toBe('DELIVERED');
    expect(twilioStatus('read')).toBe('READ');
    expect(twilioStatus('undelivered')).toBe('UNDELIVERED');
    expect(twilioStatus('failed')).toBe('FAILED');
    expect(twilioStatus('queued')).toBe('QUEUED');
    expect(twilioStatus('sending')).toBeNull();
  });
  it('maps Resend events and ignores tracking / delays', () => {
    expect(resendStatus('email.delivered')).toBe('DELIVERED');
    expect(resendStatus('email.bounced')).toBe('BOUNCED');
    expect(resendStatus('email.complained')).toBe('COMPLAINED');
    expect(resendStatus('email.delivery_delayed')).toBeNull();
    expect(resendStatus('email.opened')).toBeNull();
    expect(resendStatus('email.clicked')).toBeNull();
  });
});

describe('monotonic rank', () => {
  it('a late sent/queued never overwrites delivered', () => {
    expect(overwritableBy('SENT')).not.toContain('DELIVERED');
    expect(overwritableBy('QUEUED')).not.toContain('SENT');
  });
  it('delivered advances SENT, and read advances delivered but not the reverse', () => {
    expect(overwritableBy('DELIVERED')).toContain('SENT');
    expect(overwritableBy('READ')).toContain('DELIVERED');
    expect(overwritableBy('DELIVERED')).not.toContain('READ');
  });
  it('failures and complaints outrank delivery; a late delivered does not clear a failure', () => {
    expect(statusRank('BOUNCED')).toBeGreaterThan(statusRank('DELIVERED'));
    expect(overwritableBy('COMPLAINED')).toContain('DELIVERED');
    expect(overwritableBy('DELIVERED')).not.toContain('BOUNCED');
    expect(overwritableBy('FAILED')).not.toContain('FAILED');
  });
});

describe('twilioStatusCallback', () => {
  it('is only set for a public https origin', () => {
    expect(twilioStatusCallback('https://she.cy/')).toBe('https://she.cy/api/webhooks/twilio');
    expect(twilioStatusCallback('http://localhost:3000')).toBeUndefined();
    expect(twilioStatusCallback('https://localhost')).toBeUndefined();
    expect(twilioStatusCallback('http://she.cy')).toBeUndefined();
    expect(twilioStatusCallback(undefined)).toBeUndefined();
  });
});
