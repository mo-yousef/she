import { describe, expect, it } from 'vitest';
import { ANONYMISED_BOOKING, buildExport, retentionCutoffs } from './gdpr';

describe('retentionCutoffs', () => {
  it('computes 7 days and 24 calendar months, clamping the day', () => {
    const c = retentionCutoffs(new Date('2028-03-31T12:00:00Z'));
    expect(c.phoneVerificationBefore.toISOString()).toBe('2028-03-24T12:00:00.000Z');
    expect(c.notificationLogBefore.toISOString()).toBe('2026-03-31T12:00:00.000Z');
    expect(retentionCutoffs(new Date('2026-02-28T00:00:00Z')).bookingEndedBefore.toISOString()).toBe(
      '2024-02-28T00:00:00.000Z',
    );
    expect(retentionCutoffs(new Date('2028-02-29T00:00:00Z')).bookingEndedBefore.toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });
});

describe('anonymisation mapping', () => {
  it('clears every customer PII column', () => {
    expect(ANONYMISED_BOOKING).toEqual({
      guestName: 'Deleted user',
      guestEmail: null,
      guestPhone: null,
      note: null,
      customerId: null,
    });
  });
});

describe('buildExport', () => {
  const d = new Date('2026-11-01T10:00:00Z');
  const out = buildExport(
    {
      user: { name: 'A', email: 'a@x.test', phone: null, locale: 'en', role: 'CUSTOMER', createdAt: d },
      bookings: [
        {
          reference: 'SC-AAAAA',
          status: 'CONFIRMED',
          startsAt: d,
          endsAt: d,
          priceCents: 3000,
          note: 'hi',
          guestName: 'A',
          guestEmail: 'a@x.test',
          guestPhone: '+35799000000',
          consentTermsAt: d,
          consentMessagesAt: null,
          consentVersion: '2026-11',
          business: { name: 'Studio', slug: 'studio' },
          service: { name: 'Manicure' },
          staff: { name: 'Eli' },
          review: { rating: 5, body: 'great', authorName: 'A', createdAt: d, ownerReply: null },
          // extra fields a careless query might return must not leak
          ...({ manageTokenHash: 'SECRET', id: 'internal' } as object),
        },
      ],
      favourites: [{ business: { name: 'Studio', slug: 'studio' } }],
    },
    d,
  );
  it('maps fields and ISO times', () => {
    expect(out.bookings[0]).toMatchObject({ reference: 'SC-AAAAA', startsAt: d.toISOString(), priceCents: 3000 });
    expect(out.bookings[0]!.consents).toEqual({ terms: d.toISOString(), messages: null, policyVersion: '2026-11' });
    expect(out.reviews).toHaveLength(1);
    expect(out.favourites).toEqual([{ business: 'Studio', slug: 'studio' }]);
  });
  it('never includes hashes, tokens or ids', () => {
    const json = JSON.stringify(out);
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('internal');
    expect(json).not.toMatch(/Hash|token/i);
  });
});
