import { z } from 'zod';
import { isStep, type Step } from './booking-steps';

/**
 * URL state of the booking stepper (requirement 3.1): service, staff, date,
 * slot, step, days. Same pattern as search-params.ts: each field is validated
 * alone and an invalid value is dropped, never thrown.
 */
export const STRIP_DAYS_DEFAULT = 14;
export const STRIP_DAYS_MAX = 60;

type RawParams = Record<string, string | string[] | undefined>;

export interface BookingUrlState {
  serviceId?: string;
  /** 'any' or a staff id */
  staffId?: string;
  /** local 'YYYY-MM-DD' */
  date?: string;
  /** ISO UTC start */
  slot?: string;
  step?: Step;
  days: number;
}

function str(v: string | string[] | undefined): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return x && x.length ? x : undefined;
}

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export function isValidDateKey(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function parseBookingParams(raw: RawParams): BookingUrlState {
  const serviceId = id.safeParse(str(raw.service));
  const staff = str(raw.staff);
  const staffId = staff === 'any' ? 'any' : id.safeParse(staff).data;
  const date = str(raw.date);
  const slot = z.string().datetime({ offset: true }).safeParse(str(raw.slot));
  const step = str(raw.step);
  const days = z.coerce.number().int().safeParse(str(raw.days));
  return {
    serviceId: serviceId.success ? serviceId.data : undefined,
    staffId,
    date: date && isValidDateKey(date) ? date : undefined,
    slot: slot.success ? new Date(slot.data).toISOString() : undefined,
    step: isStep(step) ? step : undefined,
    days: days.success
      ? Math.min(STRIP_DAYS_MAX, Math.max(STRIP_DAYS_DEFAULT, days.data))
      : STRIP_DAYS_DEFAULT,
  };
}

/** Query string for the stepper URL; omits empty values and the default `days`. */
export function buildBookingQuery(state: BookingUrlState): string {
  const q = new URLSearchParams();
  if (state.serviceId) q.set('service', state.serviceId);
  if (state.staffId) q.set('staff', state.staffId);
  if (state.date) q.set('date', state.date);
  if (state.slot) q.set('slot', state.slot);
  if (state.step) q.set('step', state.step);
  if (state.days !== STRIP_DAYS_DEFAULT) q.set('days', String(state.days));
  return q.toString();
}
