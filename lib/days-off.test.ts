import { describe, expect, it } from 'vitest';
import { expandDaysOff } from './days-off';

describe('expandDaysOff', () => {
  it('expands inclusive ranges and de-duplicates overlaps', () => {
    const keys = expandDaysOff(
      [
        { from: '2026-05-01', to: '2026-05-03' },
        { from: '2026-05-03', to: '2026-05-04' },
      ],
      '2026-05-01',
      30,
    );
    expect(keys).toEqual(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']);
  });

  it('clips to the horizon on both sides', () => {
    const keys = expandDaysOff([{ from: '2026-04-20', to: '2027-04-20' }], '2026-05-01', 3);
    expect(keys).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });

  it('ignores ranges outside the window and handles month/year ends', () => {
    expect(expandDaysOff([{ from: '2026-01-01', to: '2026-01-10' }], '2026-05-01', 10)).toEqual([]);
    expect(expandDaysOff([{ from: '2026-12-31', to: '2027-01-01' }], '2026-12-30', 5)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('returns nothing for a zero-length horizon', () => {
    expect(expandDaysOff([{ from: '2026-05-01', to: '2026-05-01' }], '2026-05-01', 0)).toEqual([]);
  });
});
