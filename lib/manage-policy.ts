/**
 * Customer change policy (requirement 3.2). Pure: no clock, no DB.
 *
 * A booking can be cancelled or rescheduled by the customer only while the
 * appointment is at least `windowHours` away (business setting
 * `cancellationWindowHours`). Both instants are absolute UTC moments, so the
 * Europe/Nicosia zone (and its DST shifts) cannot change the elapsed time;
 * display of the start in Nicosia wall-clock time happens elsewhere.
 */
export function withinChangeWindow(now: Date, startsAt: Date, windowHours: number): boolean {
  const msUntilStart = startsAt.getTime() - now.getTime();
  if (msUntilStart <= 0) return false; // already started: always "contact the business"
  return msUntilStart >= windowHours * 3_600_000;
}

/** The statuses a customer may still change. Everything else is read-only. */
export function isChangeableStatus(status: string): status is 'PENDING' | 'CONFIRMED' {
  return status === 'PENDING' || status === 'CONFIRMED';
}

/**
 * Whether the token must be re-issued after a move. The manage token expires at
 * (appointment end + grace); a booking moved later than the old expiry would
 * otherwise lock the customer out of their own link.
 */
export function needsNewToken(oldTokenExpiryMs: number, newEndsAt: Date, graceMs: number): boolean {
  return !(oldTokenExpiryMs >= newEndsAt.getTime() + graceMs);
}

/** Expiry (ms epoch) embedded in a raw manage token (`<expiry>.<sig>`); NaN if malformed. */
export function tokenExpiry(token: string): number {
  return Number(token.split('.')[0]);
}
