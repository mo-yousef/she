import { describe, it, expect } from 'vitest';
import {
  bookingInputSchema,
  normalisePhone,
  validateDetails,
  validateDetailsField,
  type DetailsDraft,
} from './booking-schema';

const ok: DetailsDraft = {
  name: ' Maria Georgiou ',
  email: ' Maria@Example.com ',
  phone: '+357 99 123456',
  note: '',
  consentTerms: true,
  consentMessages: true,
};

describe('normalisePhone', () => {
  it.each([
    ['+357 99 123456', '+35799123456'],
    ['99123456', '+35799123456'],
    ['99-12 34 56', '+35799123456'],
    ['0035799123456', '+35799123456'],
    ['35799123456', '+35799123456'],
    ['+44 (20) 7946 0958', '+442079460958'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalisePhone(raw)).toBe(expected);
  });
});

describe('detailsSchema', () => {
  it('accepts valid details and normalises them', () => {
    const r = validateDetails(ok);
    expect(r.ok && r.data).toMatchObject({
      name: 'Maria Georgiou',
      email: 'maria@example.com',
      phone: '+35799123456',
      note: undefined,
    });
  });

  it('rejects bad phone, email and name with i18n codes', () => {
    const r = validateDetails({ ...ok, name: 'M', email: 'nope', phone: '+357' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({ name: 'nameRequired', email: 'emailInvalid', phone: 'phoneInvalid' });
    }
  });

  it('requires both consents separately', () => {
    const r = validateDetails({ ...ok, consentTerms: false });
    expect(!r.ok && r.errors).toEqual({ consentTerms: 'consentTerms' });
    const r2 = validateDetails({ ...ok, consentMessages: false });
    expect(!r2.ok && r2.errors).toEqual({ consentMessages: 'consentMessages' });
  });

  it('limits the note to 500 characters', () => {
    expect(validateDetailsField('note', { ...ok, note: 'x'.repeat(501) })).toBe('noteTooLong');
    expect(validateDetailsField('note', { ...ok, note: 'x'.repeat(500) })).toBeUndefined();
  });
});

describe('bookingInputSchema', () => {
  const input = {
    businessSlug: 'glow',
    serviceId: 'svc1',
    staffId: 'any',
    startsAt: '2026-06-10T07:00:00.000Z',
    locale: 'en',
    idempotencyKey: '123e4567-e89b-12d3-a456-426614174000',
    details: ok,
  };
  it('parses a full input and outputs E.164', () => {
    const r = bookingInputSchema.safeParse(input);
    expect(r.success && r.data.details.phone).toBe('+35799123456');
  });
  it('rejects a bad slot or locale', () => {
    expect(bookingInputSchema.safeParse({ ...input, startsAt: 'soon' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, locale: 'fr' }).success).toBe(false);
  });

  it('rejects an empty or over-short idempotency key', () => {
    expect(bookingInputSchema.safeParse({ ...input, idempotencyKey: '' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, idempotencyKey: 'short' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, idempotencyKey: 'x'.repeat(65) }).success).toBe(false);
  });

  it('accepts "any" or a plain id for staffId, rejects an empty or malformed one', () => {
    expect(bookingInputSchema.safeParse({ ...input, staffId: 'any' }).success).toBe(true);
    expect(bookingInputSchema.safeParse({ ...input, staffId: 'staff_1' }).success).toBe(true);
    expect(bookingInputSchema.safeParse({ ...input, staffId: '' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, staffId: 'x'.repeat(41) }).success).toBe(false);
  });

  it('rejects a missing consent and an over-long note', () => {
    const noConsent = { ...input, details: { ...ok, consentMessages: false } };
    expect(bookingInputSchema.safeParse(noConsent).success).toBe(false);
    const longNote = { ...input, details: { ...ok, note: 'x'.repeat(501) } };
    expect(bookingInputSchema.safeParse(longNote).success).toBe(false);
  });

  it('rejects a malformed phone that normalisation cannot fix', () => {
    const badPhone = { ...input, details: { ...ok, phone: '123' } };
    expect(bookingInputSchema.safeParse(badPhone).success).toBe(false);
  });

  it('rejects an empty or over-long businessSlug / serviceId', () => {
    expect(bookingInputSchema.safeParse({ ...input, businessSlug: '' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, serviceId: '' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, businessSlug: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('normalisePhone edge cases', () => {
  it.each([
    ['+357-99-123-456', '+35799123456'],
    ['  0035799123456  ', '+35799123456'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalisePhone(raw)).toBe(expected);
  });
});
