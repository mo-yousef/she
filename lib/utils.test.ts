import { describe, it, expect, beforeAll } from 'vitest';
import { formatPrice } from './money';
import { slugify } from './slug';
import { generateReference } from './reference';
import { createManageToken, verifyManageToken } from './tokens';

describe('formatPrice', () => {
  it('formats whole euros without decimals and cents with them', () => {
    expect(formatPrice(2500, 'en')).toMatch(/€\s?25/);
    expect(formatPrice(2550, 'en')).toMatch(/25[.,]50/);
  });
  it('uses locale grouping for ru/el', () => {
    expect(formatPrice(123400, 'ru')).toContain('1');
    expect(formatPrice(2500, 'el')).toMatch(/25/);
  });
});

describe('slugify', () => {
  it('lowercases and dashes Latin names', () => {
    expect(slugify('Lumière Nail Studio!')).toBe('lumiere-nail-studio');
  });
  it('transliterates Greek', () => {
    expect(slugify('Ομορφιά')).toBe('omorfia');
  });
  it('transliterates Cyrillic', () => {
    expect(slugify('Красота')).toBe('krasota');
  });
});

describe('generateReference', () => {
  it('matches SC-XXXXX with an unambiguous alphabet', () => {
    const ref = generateReference();
    expect(ref).toMatch(/^SC-[A-HJ-NP-Z2-9]{5}$/);
  });
});

describe('manage tokens', () => {
  beforeAll(() => {
    process.env.MANAGE_TOKEN_SECRET = 'test-secret-xxxxxxxxxxxxxxxxxxxxxxxx';
  });
  it('verifies a fresh token and rejects an expired or tampered one', () => {
    const future = Date.now() + 60_000;
    const { token, hash } = createManageToken('booking_1', future);
    expect(verifyManageToken(token, hash)).toBe(true);
    expect(verifyManageToken(token + 'x', hash)).toBe(false);

    const past = createManageToken('booking_2', Date.now() - 1000);
    expect(verifyManageToken(past.token, past.hash)).toBe(false);
  });
});
