import { describe, it, expect } from 'vitest';
import { parseSearchFilters, filtersToQuery, resolveCity } from './search-params';

describe('parseSearchFilters', () => {
  it('parses a full query string', () => {
    const f = parseSearchFilters({
      q: 'lash',
      cat: 'lashes',
      city: 'Limassol',
      open: '1',
      minPrice: '1000',
      maxPrice: '8000',
      rating: '4',
      sort: 'price',
    });
    expect(f).toEqual({
      q: 'lash',
      cat: 'lashes',
      city: 'Limassol',
      open: true,
      minPrice: 1000,
      maxPrice: 8000,
      lang: undefined,
      minRating: 4,
      sort: 'price',
    });
  });

  it('ignores an invalid sort and empty values', () => {
    const f = parseSearchFilters({ sort: 'nonsense', q: '' });
    expect(f.sort).toBeUndefined();
    expect(f.q).toBeUndefined();
  });

  it('drops out-of-range or unknown values', () => {
    const f = parseSearchFilters({ cat: 'x', city: 'Mars', rating: '9', minPrice: '-5', q: 'a'.repeat(81) });
    expect(f).toMatchObject({ cat: undefined, city: undefined, minRating: undefined, minPrice: undefined, q: undefined });
  });

  it('round-trips through filtersToQuery dropping empties', () => {
    const f = parseSearchFilters({ cat: 'nails', open: '1' });
    expect(filtersToQuery(f)).toEqual({ cat: 'nails', open: '1' });
  });
});

describe('resolveCity', () => {
  it('tolerates typos and case', () => {
    expect(resolveCity('limasol')).toBe('Limassol');
    expect(resolveCity('PAFOS')).toBe('Paphos');
    expect(resolveCity('Larnaca')).toBe('Larnaca');
  });
  it('rejects unrelated text', () => {
    expect(resolveCity('Mars')).toBeUndefined();
  });
});
