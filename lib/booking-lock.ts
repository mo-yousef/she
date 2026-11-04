/**
 * Shared write-side guards for anything that takes a staff member's time: online bookings,
 * manual bookings and blocks (tasks 4.3 / 6.2). Server-only; everything runs INSIDE a
 * transaction passed in by the caller.
 *
 * The DB exclusion constraints cover booking-vs-booking and block-vs-block, but not
 * booking-vs-block (two tables). So every writer must:
 *   1. `lockStaff` the affected staff rows (SELECT ... FOR UPDATE, sorted by id so two
 *      writers can never deadlock), then
 *   2. re-check overlap against BOTH active bookings and blocks, then
 *   3. insert, all in the same transaction.
 * Because they all take the same row lock, a block and a booking for the same staff
 * serialise, and whichever runs second sees the first.
 */
import { Prisma } from '@prisma/client';
import { ACTIVE_STATUSES } from './booking-status';

type Tx = Prisma.TransactionClient;

export async function lockStaff(tx: Tx, staffIds: string[]): Promise<void> {
  const ids = [...new Set(staffIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "StaffMember" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
}

/** Counts of live bookings / blocks overlapping [startsAt, endsAt) for one staff member. */
export async function countConflicts(
  tx: Tx,
  staffId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<{ bookings: number; blocks: number }> {
  const overlap = { staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
  const [bookings, blocks] = await Promise.all([
    tx.booking.count({ where: { ...overlap, status: { in: [...ACTIVE_STATUSES] } } }),
    tx.block.count({ where: overlap }),
  ]);
  return { bookings, blocks };
}

export async function hasConflict(
  tx: Tx,
  staffId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const c = await countConflicts(tx, staffId, startsAt, endsAt);
  return c.bookings + c.blocks > 0;
}

/**
 * Task 6.5: is the staff member bookable on this local date? False when deactivated, on a day off,
 * or the business has a closure (6.6) on that date. Call AFTER `lockStaff` in the same transaction: deactivation and day-off creation
 * take the same lock, so a booking that passed the pre-lock availability check cannot land
 * in a day off / on a deactivated member that was committed in between.
 */
export async function staffBookableOn(tx: Tx, staffId: string, dateKey: string): Promise<boolean> {
  const row = await tx.staffMember.findFirst({
    where: {
      id: staffId,
      active: true,
      daysOff: { none: { fromDate: { lte: dateKey }, toDate: { gte: dateKey } } },
      // A business closure committed after the pre-lock availability read (6.6).
      business: { closures: { none: { fromDate: { lte: dateKey }, toDate: { gte: dateKey } } } },
    },
    select: { id: true },
  });
  return row !== null;
}
