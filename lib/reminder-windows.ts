/**
 * Pure eligibility rules for the notification cron (task 5.3, requirement 6).
 * No DB, no clock: `now` is always passed in. All windows are absolute durations on
 * UTC instants, so Cyprus DST changes cannot shift them (a "24h before" reminder is
 * 24 real hours before, not "same wall-clock time yesterday").
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Don't send a 24h reminder when fewer than this remains: the 2h one is close behind. */
export const REMINDER_24H_MIN_LEAD_MS = 2 * HOUR + 30 * MIN;
/** Review requests go out this long after the appointment ends... */
export const REVIEW_DELAY_MS = 2 * HOUR;
/** ...but not for appointments older than this (no mass-send of history after a deploy). */
export const REVIEW_MAX_AGE_MS = 7 * DAY;

export type NotificationKind = 'reminder-24h' | 'reminder-2h' | 'review-request';

export interface CandidateBooking {
  status: string;
  createdAt: Date;
  startsAt: Date;
  endsAt: Date;
}

/** Only CONFIRMED bookings get reminders (not PENDING, cancelled, completed). */
export function isReminder24hDue(b: CandidateBooking, now: Date): boolean {
  if (b.status !== 'CONFIRMED') return false;
  const start = b.startsAt.getTime();
  const t = now.getTime();
  if (!(start > t + REMINDER_24H_MIN_LEAD_MS && start <= t + DAY)) return false;
  // Booked inside the final 24h: the confirmation already served as the heads-up.
  return b.createdAt.getTime() <= start - DAY;
}

export function isReminder2hDue(b: CandidateBooking, now: Date): boolean {
  if (b.status !== 'CONFIRMED') return false;
  const start = b.startsAt.getTime();
  const t = now.getTime();
  if (!(start > t && start <= t + 2 * HOUR)) return false;
  return b.createdAt.getTime() <= start - 2 * HOUR;
}

export function isReviewRequestDue(b: CandidateBooking, now: Date): boolean {
  if (b.status !== 'COMPLETED') return false;
  const end = b.endsAt.getTime();
  const t = now.getTime();
  return end <= t - REVIEW_DELAY_MS && end > t - REVIEW_MAX_AGE_MS;
}

/** Coarse DB bounds per kind (the pure predicates above do the exact filtering). */
export function queryWindow(kind: NotificationKind, now: Date): { field: 'startsAt' | 'endsAt'; gt: Date; lte: Date } {
  const t = now.getTime();
  switch (kind) {
    case 'reminder-24h':
      return { field: 'startsAt', gt: new Date(t + REMINDER_24H_MIN_LEAD_MS), lte: new Date(t + DAY) };
    case 'reminder-2h':
      return { field: 'startsAt', gt: now, lte: new Date(t + 2 * HOUR) };
    case 'review-request':
      return { field: 'endsAt', gt: new Date(t - REVIEW_MAX_AGE_MS), lte: new Date(t - REVIEW_DELAY_MS) };
  }
}

export const isDue: Record<NotificationKind, (b: CandidateBooking, now: Date) => boolean> = {
  'reminder-24h': isReminder24hDue,
  'reminder-2h': isReminder2hDue,
  'review-request': isReviewRequestDue,
};
