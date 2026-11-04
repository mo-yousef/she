import { describe, expect, it } from 'vitest';
import {
  decideDelete,
  moveWithinCategory,
  parseServicePrice,
  serviceFieldErrors,
  serviceInputSchema,
} from './services-schema';

const valid = {
  name: 'Gel manicure',
  category: 'nails',
  description: '',
  durationMin: '45',
  bufferMin: '5',
  price: '25,50',
  active: true,
  staffIds: ['s1', 's1', 's2'],
};
const errorsOf = (over: Record<string, unknown>) => {
  const r = serviceInputSchema.safeParse({ ...valid, ...over });
  return r.success ? {} : serviceFieldErrors(r.error);
};

describe('serviceInputSchema', () => {
  it('parses, converts price to cents and dedupes staff', () => {
    const r = serviceInputSchema.parse(valid);
    expect(r).toMatchObject({ durationMin: 45, bufferMin: 5, price: 2550, description: undefined, staffIds: ['s1', 's2'] });
  });
  it('allows a free service and a hidden service without staff', () => {
    expect(serviceInputSchema.safeParse({ ...valid, price: '0' }).success).toBe(true);
    expect(serviceInputSchema.safeParse({ ...valid, active: false, staffIds: [] }).success).toBe(true);
  });
  it('requires staff for a visible service', () => {
    expect(errorsOf({ staffIds: [] })).toEqual({ staffIds: 'staffRequired' });
  });
  it('enforces duration, buffer and price bounds', () => {
    expect(errorsOf({ durationMin: '4' }).durationMin).toBe('durationInvalid');
    expect(errorsOf({ durationMin: '481' }).durationMin).toBe('durationInvalid');
    expect(errorsOf({ durationMin: '47' }).durationMin).toBe('durationInvalid');
    expect(errorsOf({ bufferMin: '121' }).bufferMin).toBe('bufferInvalid');
    expect(errorsOf({ bufferMin: '-1' }).bufferMin).toBe('bufferInvalid');
    expect(errorsOf({ price: '5000.01' }).price).toBe('priceInvalid');
    expect(errorsOf({ price: 'abc' }).price).toBe('priceInvalid');
    expect(errorsOf({ price: '5000' }).price).toBeUndefined();
  });
  it('validates name, category, description and translation lengths', () => {
    expect(errorsOf({ name: ' ' }).name).toBe('nameRequired');
    expect(errorsOf({ name: 'x'.repeat(81) }).name).toBe('nameRequired');
    expect(errorsOf({ category: 'spa' }).category).toBe('categoryRequired');
    expect(errorsOf({ description: 'x'.repeat(501) }).description).toBe('descriptionTooLong');
    expect(errorsOf({ translations: { el: { name: 'x'.repeat(81) } } })['translations.el.name']).toBe('translationNameTooLong');
  });
});

describe('parseServicePrice', () => {
  it('handles zero, decimals and the cap', () => {
    expect([parseServicePrice('0'), parseServicePrice('0.00'), parseServicePrice('12.5'), parseServicePrice('')]).toEqual([0, 0, 1250, null]);
  });
});

describe('decideDelete', () => {
  it('refuses with future bookings, archives history, deletes when clean', () => {
    expect(decideDelete({ activeFutureCount: 1, anyBookingCount: 5 })).toBe('REFUSE');
    expect(decideDelete({ activeFutureCount: 0, anyBookingCount: 2 })).toBe('ARCHIVE');
    expect(decideDelete({ activeFutureCount: 0, anyBookingCount: 0 })).toBe('DELETE');
  });
});

describe('moveWithinCategory', () => {
  const items = [
    { id: 'a', category: 'nails' },
    { id: 'h', category: 'hair' },
    { id: 'b', category: 'nails' },
    { id: 'c', category: 'nails' },
  ];
  it('swaps with the nearest same-category neighbour', () => {
    expect(moveWithinCategory(items, 'b', 'up')).toEqual(['b', 'h', 'a', 'c']);
    expect(moveWithinCategory(items, 'b', 'down')).toEqual(['a', 'h', 'c', 'b']);
  });
  it('is a no-op at the first/last of its category or for unknown ids', () => {
    expect(moveWithinCategory(items, 'a', 'up')).toBeNull();
    expect(moveWithinCategory(items, 'c', 'down')).toBeNull();
    expect(moveWithinCategory(items, 'h', 'down')).toBeNull();
    expect(moveWithinCategory(items, 'zzz', 'up')).toBeNull();
  });
});
