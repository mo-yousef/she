import { describe, expect, it } from 'vitest';
import { centsToInputValue, parseEuroToCents } from './money';

describe('parseEuroToCents', () => {
  it.each([
    ['25', 2500],
    ['25.5', 2550],
    ['25,50', 2550],
    ['0.99', 99],
    [' 10.05 ', 1005],
    ['10000', 1_000_000],
  ])('%j -> %i', (raw, cents) => expect(parseEuroToCents(raw)).toBe(cents));

  it.each(['', 'abc', '-5', '0', '0.00', '1.234', '10000.01', '1e3', '12,', '.5', '€5'])('rejects %j', (raw) =>
    expect(parseEuroToCents(raw)).toBeNull(),
  );

  it('round-trips through the input value', () => {
    expect(parseEuroToCents(centsToInputValue(2550))).toBe(2550);
    expect(centsToInputValue(2500)).toBe('25');
  });
});
