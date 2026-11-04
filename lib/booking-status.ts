/**
 * Booking status transition rules (tasks 6.2 / 6.3, req 3.3 and 5.1). Pure: no DB, no clock.
 * ONE table, used by the status core and by the UI (to decide which buttons to show).
 */
export type BookingStatusName =
  | 'PENDING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_BUSINESS'
  | 'NO_SHOW';

/** Statuses an OWNER may move a booking to. Terminal statuses have no entry. */
const OWNER_TRANSITIONS: Partial<
  Record<BookingStatusName, readonly BookingStatusName[]>
> = {
  PENDING: ['CONFIRMED', 'CANCELLED_BY_BUSINESS'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED_BY_BUSINESS'],
};

/** Statuses that hold the slot (match the booking_no_overlap exclusion constraint). */
export const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

export function isActiveStatus(s: string): boolean {
  return s === 'PENDING' || s === 'CONFIRMED';
}

export function isCancelledStatus(s: string): boolean {
  return s === 'CANCELLED_BY_CUSTOMER' || s === 'CANCELLED_BY_BUSINESS';
}

export function allowedTransitions(
  from: BookingStatusName,
): readonly BookingStatusName[] {
  return OWNER_TRANSITIONS[from] ?? [];
}

export type TransitionCheck = 'OK' | 'INVALID_TRANSITION' | 'NOT_STARTED';

/**
 * Whether an owner may move `from` -> `to`. Marking COMPLETED or NO_SHOW is only
 * possible once the appointment has started (you cannot complete the future).
 */
export function checkTransition(
  from: BookingStatusName,
  to: BookingStatusName,
  startsAt: Date,
  now: Date,
): TransitionCheck {
  if (!allowedTransitions(from).includes(to)) return 'INVALID_TRANSITION';
  if ((to === 'COMPLETED' || to === 'NO_SHOW') && now.getTime() < startsAt.getTime())
    return 'NOT_STARTED';
  return 'OK';
}
