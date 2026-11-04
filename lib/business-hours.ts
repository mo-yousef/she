/**
 * Business hours + closures cores (task 6.6, req 5.1 / 4.2). Server-only. `app/actions/hours.ts`
 * holds the thin 'use server' wrappers; everything here takes explicit inputs so Playwright can
 * call it. Every core starts with `assertOwnsBusiness`; closure ids are resolved through the
 * owner's business (a cross-tenant id is NOT_FOUND).
 *
 * Booking policy (same stance as 6.2 blocks and 6.5 days off):
 *  - weekly hours changes NEVER touch existing bookings and are not blocked; the result reports
 *    how many upcoming bookings now fall outside the new hours (non-blocking warning);
 *  - a NEW closure over upcoming PENDING/CONFIRMED bookings is refused (`HAS_BOOKINGS`, count +
 *    up to 10 local dates). The check and the write run under the row locks of ALL the
 *    business's staff (`lockStaff`), the lock online/manual bookings, blocks and days off take,
 *    and `staffBookableOn` re-checks closures after that lock, so a concurrent booking cannot slip in.
 *  - saving hours clamps staff overrides that no longer fit (`clampStaffHours`), in the same
 *    transaction, because the engine uses a staff window alone.
 * Audit meta is ids + field names only (never reason text or times).
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { lockStaff } from './booking-lock';
import { assertOwnsBusiness, ownerAuthCode, type OwnedBusiness, type OwnerAuthCode } from './owner-auth';
import { clampStaffHours, countOutsideHours, weekKey, type DayHours } from './hours';
import { MAX_CLOSURES, checkBusinessHours, checkClosureRange, closureInputSchema } from './hours-schema';
import { ACTIVE_BOOKING_STATUSES, type FieldErrors } from './services-schema';
import { parseSettings } from './settings';
import { staffFieldErrors } from './team-schema';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from './time';

/** Non-blocking: the listing is PENDING/PUBLISHED but every weekday is closed. */
export type HoursWarning = 'NO_OPEN_DAYS';
type Fail = {
  ok: false;
  code: OwnerAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'HAS_BOOKINGS' | 'UNKNOWN';
  errors?: FieldErrors;
  /** HAS_BOOKINGS: upcoming active bookings in the range (count only, no PII). */
  futureCount?: number;
  /** HAS_BOOKINGS: up to 10 affected local dates. */
  conflictDates?: string[];
};
export type HoursResult<T = object> = ({ ok: true; businessId: string; slug: string } & T) | Fail;
const fail = (code: Fail['code'], extra: Omit<Fail, 'ok' | 'code'> = {}): Fail => ({ ok: false, code, ...extra });
type Tx = Prisma.TransactionClient;

async function run<T>(userId: string | null | undefined, businessId: string, fn: (o: OwnedBusiness) => Promise<HoursResult<T>>): Promise<HoursResult<T>> {
  let owned: OwnedBusiness;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  try {
    return await fn(owned);
  } catch (e) {
    console.error('hours failed', e instanceof Error ? e.name : 'unknown'); // name only: no PII
    return fail('UNKNOWN');
  }
}
const base = (o: OwnedBusiness) => ({ ok: true as const, businessId: o.business.id, slug: o.business.slug });
const isLive = (o: OwnedBusiness) => o.business.status === 'PENDING' || o.business.status === 'PUBLISHED';

/** Every staff row of the business, locked in sorted order (same lock as bookings / blocks). */
async function lockAllStaff(tx: Tx, businessId: string): Promise<string[]> {
  const ids = (await tx.staffMember.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
  await lockStaff(tx, ids);
  return ids;
}

// ---- weekly hours ----------------------------------------------------------------------
export async function saveBusinessHoursCore(
  userId: string | null | undefined,
  businessId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<HoursResult<{ adjustedStaff: number; outsideBookings: number; warnings: HoursWarning[] }>> {
  return run(userId, businessId, async (o) => {
    const checked = checkBusinessHours(raw);
    if (!checked.ok) return fail('VALIDATION', { errors: checked.errors });
    const days = checked.days;
    const clamped = await db.$transaction(async (tx) => {
      await lockAllStaff(tx, o.business.id); // serialises against staff edits / bookings
      // All 7 rows are always written, so there are never missing weekdays.
      for (const d of days) {
        await tx.openingHours.upsert({
          where: { businessId_weekday: { businessId: o.business.id, weekday: d.weekday } },
          create: { businessId: o.business.id, weekday: d.weekday, opensMin: d.opensMin, closesMin: d.closesMin, closed: d.closed },
          update: { opensMin: d.opensMin, closesMin: d.closesMin, closed: d.closed },
        });
      }
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'business.hours', meta: { fields: ['openingHours'] } }, tx);
      // Staff overrides that no longer fit are clamped to the intersection (docs/decisions.md).
      const overrides = await tx.staffMember.findMany({
        where: { businessId: o.business.id, staffHours: { some: {} } },
        select: { id: true, staffHours: { select: { weekday: true, closed: true, opensMin: true, closesMin: true } } },
      });
      const changedIds: string[] = [];
      for (const s of overrides) {
        const next = clampStaffHours(s.staffHours, days);
        if (weekKey(next) === weekKey(s.staffHours)) continue;
        for (const d of next) {
          await tx.staffHours.updateMany({
            where: { staffId: s.id, weekday: d.weekday },
            data: { closed: d.closed, opensMin: d.opensMin, closesMin: d.closesMin },
          });
        }
        changedIds.push(s.id);
      }
      if (changedIds.length) {
        await writeAudit(
          { actorId: o.user.id, businessId: o.business.id, action: 'staff.hours.clamp', meta: { staffIds: changedIds, fields: ['hours'] } },
          tx,
        );
      }
      return changedIds.length;
    });
    const upcoming = await db.booking.findMany({
      where: { businessId: o.business.id, status: { in: [...ACTIVE_BOOKING_STATUSES] }, endsAt: { gt: now } },
      select: { startsAt: true, endsAt: true },
      take: 5000,
    });
    return {
      ...base(o),
      adjustedStaff: clamped,
      outsideBookings: countOutsideHours(upcoming, days),
      warnings: checked.noOpenDays && isLive(o) ? ['NO_OPEN_DAYS'] : [],
    };
  });
}

// ---- closures --------------------------------------------------------------------------
export async function addClosureCore(
  userId: string | null | undefined,
  businessId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<HoursResult<{ closureId: string }>> {
  return run(userId, businessId, async (o) => {
    const parsed = closureInputSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: staffFieldErrors(parsed.error) });
    const input = parsed.data;
    const rangeError = checkClosureRange(input, localDateKey(now, BUSINESS_TZ));
    if (rangeError) return fail('VALIDATION', { errors: rangeError });
    // Local-midnight bounds of the range: DST-safe (never +24h arithmetic).
    const from = zonedWallTimeToUtc(input.fromDate, 0);
    const to = zonedWallTimeToUtc(addDaysToKey(input.toDate, 1), 0);
    const out = await db.$transaction(async (tx) => {
      await lockAllStaff(tx, o.business.id);
      if ((await tx.closure.count({ where: { businessId: o.business.id } })) >= MAX_CLOSURES) {
        return { kind: 'VALIDATION' as const, errors: { form: 'tooMany' } };
      }
      const clashing = await tx.booking.findMany({
        where: { businessId: o.business.id, status: { in: [...ACTIVE_BOOKING_STATUSES] }, startsAt: { lt: to }, endsAt: { gt: from > now ? from : now } },
        select: { startsAt: true },
        orderBy: { startsAt: 'asc' },
      });
      if (clashing.length > 0) {
        const dates = [...new Set(clashing.map((b) => localDateKey(b.startsAt, BUSINESS_TZ)))].slice(0, 10);
        return { kind: 'CLASH' as const, count: clashing.length, dates };
      }
      const row = await tx.closure.create({
        data: { businessId: o.business.id, fromDate: input.fromDate, toDate: input.toDate, reason: input.reason ?? null },
        select: { id: true },
      });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'closure.add', meta: { closureId: row.id, fields: ['closure'] } }, tx);
      return { kind: 'OK' as const, closureId: row.id };
    });
    if (out.kind === 'VALIDATION') return fail('VALIDATION', { errors: out.errors });
    if (out.kind === 'CLASH') return fail('HAS_BOOKINGS', { futureCount: out.count, conflictDates: out.dates });
    return { ...base(o), closureId: out.closureId };
  });
}

export async function removeClosureCore(userId: string | null | undefined, businessId: string, closureId: string): Promise<HoursResult> {
  return run(userId, businessId, async (o) => {
    const found = await db.$transaction(async (tx) => {
      const row = await tx.closure.findFirst({ where: { id: String(closureId), businessId: o.business.id }, select: { id: true } });
      if (!row) return false;
      await tx.closure.delete({ where: { id: row.id } });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'closure.remove', meta: { closureId: row.id, fields: ['closure'] } }, tx);
      return true;
    });
    return found ? base(o) : fail('NOT_FOUND');
  });
}

// ---- page loader -----------------------------------------------------------------------
export interface HoursPageData {
  /** All 7 weekdays (a missing row is shown closed). */
  days: DayHours[];
  /** Ongoing and upcoming only. */
  closures: Array<{ id: string; fromDate: string; toDate: string; reason: string | null }>;
  todayKey: string;
  slotIntervalMin: number;
}
export async function loadHoursForDashboard(businessId: string, now: Date = new Date()): Promise<HoursPageData> {
  const todayKey = localDateKey(now, BUSINESS_TZ);
  const [biz, rows, closures] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId }, select: { settings: true } }),
    db.openingHours.findMany({ where: { businessId }, select: { weekday: true, closed: true, opensMin: true, closesMin: true } }),
    db.closure.findMany({ where: { businessId, toDate: { gte: todayKey } }, orderBy: [{ fromDate: 'asc' }, { id: 'asc' }] }),
  ]);
  const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => rows.find((r) => r.weekday === weekday) ?? { weekday, closed: true, opensMin: 0, closesMin: 0 });
  return {
    days,
    closures: closures.map((c) => ({ id: c.id, fromDate: c.fromDate, toDate: c.toDate, reason: c.reason })),
    todayKey,
    slotIntervalMin: parseSettings(biz.settings).slotIntervalMin,
  };
}
