/**
 * Pure layout for the dashboard calendar grid (task 6.2). No DB, no clock.
 *
 * Positions are WALL-CLOCK minutes in Europe/Nicosia (the same unit opening hours use),
 * derived from the UTC instants with date-fns-tz, never from fixed 24h arithmetic. So an
 * appointment at 10:00 sits at minute 600 on every day, including the DST days
 * (2026-03-29 has 23 hours, 2026-10-25 has 25). The hour that does not exist (spring) or
 * repeats (autumn) is at 03:00-04:00, outside any realistic opening hours.
 */
import type { OpeningHour } from './availability';
import {
  BUSINESS_TZ,
  addDaysToKey,
  localDateKey,
  minutesOfDayInZone,
  weekdayInZone,
  zonedWallTimeToUtc,
} from './time';
import type { CalendarView } from './calendar-params';
import { visibleDateKeys } from './calendar-params';

/** One grid row is this many minutes. */
export const ROW_MIN = 15;

export interface Axis {
  /** Wall-clock minute at the top of the grid (multiple of 60). */
  startMin: number;
  /** Wall-clock minute at the bottom of the grid (multiple of 60). */
  endMin: number;
}

export interface Interval {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

export interface Placed<T> {
  item: T;
  /** Wall-clock minutes from local midnight, clipped to the axis. */
  startMin: number;
  endMin: number;
  /** Side-by-side lane for overlapping events (0-based) and the lane count of its cluster. */
  lane: number;
  lanes: number;
}

/**
 * Minutes from LOCAL midnight of `dateKey` for a UTC instant (wall-clock). Instants on an
 * earlier local day give 0 and on a later day give 1440, so multi-day events clip cleanly.
 */
export function minutesFromLocalMidnight(
  utc: Date,
  dateKey: string,
  tz: string = BUSINESS_TZ,
): number {
  const k = localDateKey(utc, tz);
  if (k < dateKey) return 0;
  if (k > dateKey) return 1440;
  return minutesOfDayInZone(utc, tz);
}

/** Start/end wall-clock minutes of an interval on `dateKey`; end is never before start. */
function spanOnDay(i: Interval, dateKey: string): { startMin: number; endMin: number } {
  const startMin = minutesFromLocalMidnight(i.startsAt, dateKey);
  let endMin = minutesFromLocalMidnight(i.endsAt, dateKey);
  if (endMin < startMin) {
    // Crosses the autumn repeated hour: wall-clock went backwards, so use the real duration.
    endMin = Math.min(
      1440,
      startMin + Math.round((i.endsAt.getTime() - i.startsAt.getTime()) / 60_000),
    );
  }
  return { startMin, endMin };
}

/**
 * Place one day's events: clip to the axis, drop what falls outside, and assign lanes so
 * overlapping events sit side by side (cancelled bookings can overlap live ones).
 */
export function layoutDayEvents<T extends Interval>(
  items: T[],
  dateKey: string,
  axis: Axis,
): Placed<T>[] {
  const spans = items
    .map((item) => ({ item, ...spanOnDay(item, dateKey) }))
    .filter(
      (s) =>
        s.endMin > axis.startMin && s.startMin < axis.endMin && s.endMin > s.startMin,
    )
    .map((s) => ({
      item: s.item,
      startMin: Math.max(s.startMin, axis.startMin),
      endMin: Math.min(s.endMin, axis.endMin),
    }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const s of spans) {
    if (cluster.length > 0 && s.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.endMin);
    } else {
      laneEnds[lane] = s.endMin;
    }
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.endMin);
  }
  if (cluster.length > 0) flush();
  return out;
}

export interface Window {
  opensMin: number;
  closesMin: number;
}

/**
 * Axis from the earliest opening to the latest closing across the week, widened to whole
 * hours, extended to include any event outside those hours (nothing is ever hidden), and at
 * least 4 hours tall. With no open hours at all it falls back to 08:00-20:00.
 */
export function computeAxis(
  windows: Window[],
  eventSpans: Array<{ startMin: number; endMin: number }> = [],
): Axis {
  let lo = windows.length ? Math.min(...windows.map((w) => w.opensMin)) : 8 * 60;
  let hi = windows.length ? Math.max(...windows.map((w) => w.closesMin)) : 20 * 60;
  for (const s of eventSpans) {
    lo = Math.min(lo, s.startMin);
    hi = Math.max(hi, s.endMin);
  }
  let startMin = Math.max(0, Math.floor(lo / 60) * 60);
  let endMin = Math.min(1440, Math.ceil(hi / 60) * 60);
  if (endMin - startMin < 240) endMin = Math.min(1440, startMin + 240);
  if (endMin - startMin < 240) startMin = Math.max(0, endMin - 240);
  return { startMin, endMin };
}

/**
 * The open window for one local date, or null when closed (closure, closed weekday or no
 * row). Staff hours replace business hours entirely when the staff member has any, exactly
 * like the availability engine.
 */
export function openWindowFor(
  dateKey: string,
  openingHours: OpeningHour[],
  staffHours: OpeningHour[] | undefined,
  closures: Array<{ from: string; to: string }>,
  /** Staff days off as inclusive ranges (task 6.5). */
  daysOff: Array<{ from: string; to: string }> = [],
): Window | null {
  if (closures.some((c) => dateKey >= c.from && dateKey <= c.to)) return null;
  if (daysOff.some((c) => dateKey >= c.from && dateKey <= c.to)) return null;
  const weekday = weekdayInZone(zonedWallTimeToUtc(dateKey, 0));
  const h = (staffHours && staffHours.length ? staffHours : openingHours).find(
    (x) => x.weekday === weekday,
  );
  return !h || h.closed ? null : { opensMin: h.opensMin, closesMin: h.closesMin };
}

/** Closed stretches inside the axis: the whole column when closed, else before/after hours. */
export function closedSegments(
  window: Window | null,
  axis: Axis,
): Array<{ startMin: number; endMin: number }> {
  if (!window) return [{ startMin: axis.startMin, endMin: axis.endMin }];
  const segs: Array<{ startMin: number; endMin: number }> = [];
  if (window.opensMin > axis.startMin)
    segs.push({
      startMin: axis.startMin,
      endMin: Math.min(window.opensMin, axis.endMin),
    });
  if (window.closesMin < axis.endMin)
    segs.push({
      startMin: Math.max(window.closesMin, axis.startMin),
      endMin: axis.endMin,
    });
  return segs;
}

export interface CalendarStaff {
  id: string;
  name: string;
  /** Per-staff hours (replace business hours when non-empty). */
  hours?: OpeningHour[];
  /** Days off as inclusive local date-key ranges (task 6.5). */
  daysOff?: Array<{ from: string; to: string }>;
}

export interface GridColumn<E extends Interval & { staffId: string }> {
  key: string;
  staffId: string;
  dateKey: string;
  closed: Array<{ startMin: number; endMin: number }>;
  events: Placed<E>[];
}

export interface BuildColumnsInput<E extends Interval & { staffId: string }> {
  view: CalendarView;
  dateKey: string;
  /** Day view: staff shown as columns. Week view: exactly one staff member. */
  staff: CalendarStaff[];
  /** Used for the axis: all active staff (so the axis does not jump when filtering). */
  axisStaff: CalendarStaff[];
  openingHours: OpeningHour[];
  closures: Array<{ from: string; to: string }>;
  events: E[];
}

/** Everything the grid needs: the axis plus a positioned column per staff (day) or day (week). */
export function buildColumns<E extends Interval & { staffId: string }>(
  input: BuildColumnsInput<E>,
): { axis: Axis; columns: GridColumn<E>[] } {
  const { view, dateKey, openingHours, closures } = input;

  // Axis windows: every weekday of business hours and of each staff member's own hours.
  const windows: Window[] = [];
  const addHours = (hours: OpeningHour[]) => {
    for (const h of hours) if (!h.closed && h.closesMin > h.opensMin) windows.push(h);
  };
  addHours(openingHours);
  for (const s of input.axisStaff) if (s.hours?.length) addHours(s.hours);

  const keys = visibleDateKeys(view, dateKey);
  const dayBounds = (k: string) => ({
    from: zonedWallTimeToUtc(k, 0),
    to: zonedWallTimeToUtc(addDaysToKey(k, 1), 0),
  });
  const inDay = (e: E, k: string) => {
    const { from, to } = dayBounds(k);
    return e.startsAt < to && e.endsAt > from;
  };

  const specs =
    view === 'day'
      ? input.staff.map((s) => ({ key: s.id, staff: s, dateKey }))
      : keys.map((k) => ({ key: k, staff: input.staff[0]!, dateKey: k }));
  if (view === 'week' && input.staff.length === 0)
    return { axis: computeAxis(windows), columns: [] };

  // Widen the axis to cover events that fall outside opening hours.
  const eventSpans: Array<{ startMin: number; endMin: number }> = [];
  for (const sp of specs) {
    for (const e of input.events) {
      if (e.staffId === sp.staff.id && inDay(e, sp.dateKey))
        eventSpans.push(spanOnDay(e, sp.dateKey));
    }
  }
  const axis = computeAxis(windows, eventSpans);

  const columns = specs.map((sp) => ({
    key: sp.key,
    staffId: sp.staff.id,
    dateKey: sp.dateKey,
    closed: closedSegments(
      openWindowFor(sp.dateKey, openingHours, sp.staff.hours, closures, sp.staff.daysOff),
      axis,
    ),
    events: layoutDayEvents(
      input.events.filter((e) => e.staffId === sp.staff.id && inDay(e, sp.dateKey)),
      sp.dateKey,
      axis,
    ),
  }));
  return { axis, columns };
}

/** Wall-clock minute under a pointer at `fraction` (0..1) down a column, snapped to the grid. */
export function minuteAtFraction(
  fraction: number,
  axis: Axis,
  snap: number = ROW_MIN,
): number {
  const f = Math.min(0.999, Math.max(0, fraction));
  const raw = axis.startMin + f * (axis.endMin - axis.startMin);
  return Math.floor(raw / snap) * snap;
}
