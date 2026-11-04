/**
 * Staff days off (task 6.5, req 5.1). Pure: no DB, no clock. Ranges are inclusive local
 * 'YYYY-MM-DD' keys (same modelling as business closures), so there is no timezone maths.
 */
import { addDaysToKey } from './time';

export interface DayOffRange {
  from: string;
  to: string;
}

/**
 * Expands ranges into the sorted, de-duplicated date keys the availability engine's `daysOff`
 * wants, limited to the window [fromKey, fromKey + days - 1]. A year-long range therefore
 * costs at most `days` keys, not 365.
 */
export function expandDaysOff(ranges: ReadonlyArray<DayOffRange>, fromKey: string, days: number): string[] {
  if (days <= 0) return [];
  const lastKey = addDaysToKey(fromKey, days - 1);
  const out = new Set<string>();
  for (const r of ranges) {
    const start = r.from > fromKey ? r.from : fromKey;
    const end = r.to < lastKey ? r.to : lastKey;
    for (let k = start; k <= end; k = addDaysToKey(k, 1)) out.add(k);
  }
  return [...out].sort();
}
