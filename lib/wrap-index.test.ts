import { describe, expect, it } from 'vitest';
import { wrapIndex } from './wrap-index';

describe('wrapIndex', () => {
  it('steps forward and back', () => {
    expect(wrapIndex(1, 1, 5)).toBe(2);
    expect(wrapIndex(1, -1, 5)).toBe(0);
  });
  it('wraps at both ends', () => {
    expect(wrapIndex(4, 1, 5)).toBe(0);
    expect(wrapIndex(0, -1, 5)).toBe(4);
  });
  it('handles empty and single lists', () => {
    expect(wrapIndex(0, 1, 0)).toBe(0);
    expect(wrapIndex(0, 1, 1)).toBe(0);
  });
});
