import { describe, expect, it } from 'vitest';
import { createBlockInputSchema, manualBookingInputSchema } from './calendar-schema';

const valid = {
  serviceId: 'svc1',
  staffId: 'st1',
  date: '2026-07-15',
  time: '10:30',
  name: 'Maria Ioannou',
  phone: '99 123456',
  email: 'Maria@Example.test',
};

const codes = (input: unknown) => {
  const r = manualBookingInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path[0]}:${i.message}`);
};

describe('manualBookingInputSchema', () => {
  it('accepts a minimal walk-in (name only) and applies defaults', () => {
    const r = manualBookingInputSchema.parse({ ...valid, phone: '', email: '' });
    expect(r.phone).toBeUndefined();
    expect(r.email).toBeUndefined();
    expect(r.status).toBe('CONFIRMED');
    expect(r.sendConfirmation).toBe(true);
    expect(r.locale).toBe('en');
  });

  it('normalises the phone and lower-cases the email', () => {
    const r = manualBookingInputSchema.parse(valid);
    expect(r.phone).toBe('+35799123456');
    expect(r.email).toBe('maria@example.test');
  });

  it('reports field-level i18n codes', () => {
    expect(codes({ ...valid, name: 'A' })).toContain('name:nameRequired');
    expect(codes({ ...valid, email: 'not-an-email' })).toContain('email:emailInvalid');
    expect(codes({ ...valid, phone: 'abc' })).toContain('phone:phoneInvalid');
    expect(codes({ ...valid, date: '2026-02-30' })).toContain('date:invalidDate');
    expect(codes({ ...valid, time: '25:00' })).toContain('time:invalidTime');
    expect(codes({ ...valid, note: 'x'.repeat(501) })).toContain('note:noteTooLong');
    expect(codes({ ...valid, priceCents: 12.5 })).toContain('priceCents:priceInvalid');
    expect(codes({ ...valid, priceCents: -1 })).toContain('priceCents:priceInvalid');
  });

  it('only allows PENDING or CONFIRMED as the initial status', () => {
    expect(
      manualBookingInputSchema.safeParse({ ...valid, status: 'COMPLETED' }).success,
    ).toBe(false);
    expect(manualBookingInputSchema.parse({ ...valid, status: 'PENDING' }).status).toBe(
      'PENDING',
    );
  });
});

describe('createBlockInputSchema', () => {
  const block = { staffId: 'all', dateKey: '2026-07-15', startMin: 780, endMin: 840 };
  it('accepts a single block and defaults to no recurrence', () => {
    const r = createBlockInputSchema.parse(block);
    expect(r.recurrence).toBe('none');
    expect(r.reason).toBeUndefined();
  });
  it('rejects bad dates, long reasons and unknown recurrence', () => {
    expect(
      createBlockInputSchema.safeParse({ ...block, dateKey: '2026-99-99' }).success,
    ).toBe(false);
    expect(
      createBlockInputSchema.safeParse({ ...block, reason: 'x'.repeat(121) }).success,
    ).toBe(false);
    expect(
      createBlockInputSchema.safeParse({ ...block, recurrence: 'monthly' }).success,
    ).toBe(false);
  });
});
