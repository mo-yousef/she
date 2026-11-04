/**
 * Recurring time blocks (task 6.2). The schema has no recurrence columns, so a series is
 * expanded into individual Block rows when it is created. Pure: no DB, no clock.
 *
 * Wall-clock semantics: every occurrence keeps the same LOCAL start/end time in
 * Europe/Nicosia. Each occurrence's UTC instants are computed from its own local date with
 * zonedWallTimeToUtc, never by adding 24h/7*24h, so a series that crosses a DST change
 * keeps starting at e.g. 13:00 local (UTC shifts by an hour).
 */
import { addDaysToKey, zonedWallTimeToUtc } from './time';

export type Recurrence = 'none' | 'daily' | 'weekly';

/** Longest span a recurring block may cover, and the most occurrences one series may create. */
export const MAX_SERIES_DAYS = 90;
export const MAX_OCCURRENCES = 60;
/** Safety cap on rows written in one request (occurrences x staff). */
export const MAX_BLOCK_ROWS = 120;

export interface BlockOccurrence {
  /** Local date 'YYYY-MM-DD' of this occurrence. */
  dateKey: string;
  startsAt: Date;
  endsAt: Date;
}

export type ExpandResult =
  | { ok: true; occurrences: BlockOccurrence[] }
  | {
      ok: false;
      code:
        | 'untilRequired'
        | 'untilBeforeStart'
        | 'untilTooFar'
        | 'tooManyOccurrences'
        | 'invalidTimes';
    };

/** Whole days between two date keys (UTC arithmetic on keys). */
function daysBetween(from: string, to: string): number {
  const ms = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export function expandBlockOccurrences(p: {
  dateKey: string;
  startMin: number;
  endMin: number;
  recurrence: Recurrence;
  /** Inclusive last local date; required for daily/weekly. */
  untilKey?: string;
}): ExpandResult {
  if (!(p.endMin > p.startMin) || p.startMin < 0 || p.endMin > 1440)
    return { ok: false, code: 'invalidTimes' };

  const step = p.recurrence === 'daily' ? 1 : p.recurrence === 'weekly' ? 7 : 0;
  const keys: string[] = [p.dateKey];
  if (step > 0) {
    if (!p.untilKey) return { ok: false, code: 'untilRequired' };
    const span = daysBetween(p.dateKey, p.untilKey);
    if (span < 0) return { ok: false, code: 'untilBeforeStart' };
    if (span > MAX_SERIES_DAYS) return { ok: false, code: 'untilTooFar' };
    for (let off = step; off <= span; off += step)
      keys.push(addDaysToKey(p.dateKey, off));
    if (keys.length > MAX_OCCURRENCES) return { ok: false, code: 'tooManyOccurrences' };
  }

  const occurrences: BlockOccurrence[] = [];
  for (const dateKey of keys) {
    const startsAt = zonedWallTimeToUtc(dateKey, p.startMin);
    const endsAt = zonedWallTimeToUtc(dateKey, p.endMin);
    if (!(endsAt > startsAt)) return { ok: false, code: 'invalidTimes' };
    occurrences.push({ dateKey, startsAt, endsAt });
  }
  return { ok: true, occurrences };
}
