/**
 * Team CRUD cores (task 6.5, req 5.1). Server-only. `app/actions/team.ts` holds the thin
 * 'use server' wrappers; everything here takes explicit inputs so Playwright can call it.
 * Every core starts with `assertOwnsBusiness`; every client-supplied staff / service / day-off
 * id is checked against the owner's business (cross-tenant ids are rejected).
 *
 * Booking policy (same stance as 6.2 blocks): nothing here silently strands a customer.
 *  - day off over a future ACTIVE booking      -> HAS_BOOKINGS (count + local dates, no PII)
 *  - deactivate / delete with a future booking -> HAS_FUTURE_BOOKINGS (count)
 *  - delete with history only                  -> ARCHIVED (Booking.staffId is RESTRICT)
 *  - a changed weekly schedule never touches existing bookings (shortcut, docs/shortcuts.md)
 * All of these check and write under the StaffMember row lock (`lockStaff`), the same lock
 * online bookings, manual bookings and blocks take, so a concurrent booking cannot slip in.
 * Audit meta is ids + field names only (never names, roles or reasons).
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { isForeignKeyViolation } from './booking-errors';
import { lockStaff } from './booking-lock';
import { assertOwnsBusiness, ownerAuthCode, type OwnedBusiness, type OwnerAuthCode } from './owner-auth';
import type { DayHours } from './hours';
import { ACTIVE_BOOKING_STATUSES, decideDelete, moveWithinCategory, type FieldErrors } from './services-schema';
import {
  MAX_DAY_OFF_RANGES,
  checkDayOffRange,
  checkStaffHours,
  dayOffInputSchema,
  staffFieldErrors,
  staffInputSchema,
} from './team-schema';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from './time';

/** Non-blocking: the listing is PENDING/PUBLISHED but bookings are impossible somewhere. */
export type TeamWarning = 'NO_ACTIVE_STAFF' | 'SERVICE_WITHOUT_STAFF';

type Fail = {
  ok: false;
  code: OwnerAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'HAS_FUTURE_BOOKINGS' | 'HAS_BOOKINGS' | 'UNKNOWN';
  errors?: FieldErrors;
  /** Upcoming active bookings affected (count only, no PII). */
  futureCount?: number;
  /** HAS_BOOKINGS: up to 10 affected local dates. */
  conflictDates?: string[];
};
export type TeamResult<T = object> =
  | ({ ok: true; businessId: string; slug: string; staffId: string; warnings: TeamWarning[] } & T)
  | Fail;

const fail = (code: Fail['code'], extra: Omit<Fail, 'ok' | 'code'> = {}): Fail => ({ ok: false, code, ...extra });
type Tx = Prisma.TransactionClient;

async function run<T>(
  userId: string | null | undefined,
  businessId: string,
  fn: (o: OwnedBusiness) => Promise<TeamResult<T>>,
): Promise<TeamResult<T>> {
  let owned: OwnedBusiness;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  try {
    return await fn(owned);
  } catch (e) {
    console.error('team failed', e instanceof Error ? e.name : 'unknown'); // name only: no PII
    return fail('UNKNOWN');
  }
}

const lockBusiness = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${id} FOR UPDATE`;

async function warningsFor(o: OwnedBusiness): Promise<TeamWarning[]> {
  if (o.business.status !== 'PENDING' && o.business.status !== 'PUBLISHED') return [];
  const [activeStaff, uncovered] = await Promise.all([
    db.staffMember.count({ where: { businessId: o.business.id, active: true } }),
    db.service.count({ where: { businessId: o.business.id, active: true, staffLinks: { none: { staff: { active: true } } } } }),
  ]);
  const out: TeamWarning[] = [];
  if (activeStaff === 0) out.push('NO_ACTIVE_STAFF');
  if (uncovered > 0) out.push('SERVICE_WITHOUT_STAFF');
  return out;
}

const done = async (o: OwnedBusiness, staffId: string) => ({
  ok: true as const,
  businessId: o.business.id,
  slug: o.business.slug,
  staffId,
  warnings: await warningsFor(o),
});

const futureActiveCount = (tx: Tx, staffId: string) =>
  tx.booking.count({ where: { staffId, status: { in: [...ACTIVE_BOOKING_STATUSES] }, endsAt: { gt: new Date() } } });

async function businessHours(tx: Tx, businessId: string): Promise<DayHours[]> {
  const rows = await tx.openingHours.findMany({ where: { businessId }, select: { weekday: true, closed: true, opensMin: true, closesMin: true } });
  return rows;
}

/** Service ids must belong to this business (hidden services included). */
async function checkServices(tx: Tx, businessId: string, serviceIds: string[]): Promise<FieldErrors | null> {
  if (serviceIds.length === 0) return null;
  const n = await tx.service.count({ where: { id: { in: serviceIds }, businessId } });
  return n === serviceIds.length ? null : { serviceIds: 'serviceInvalid' };
}

/** All 7 rows or none: the engine treats a missing weekday as "not working". */
async function writeHours(tx: Tx, staffId: string, days: DayHours[] | null) {
  await tx.staffHours.deleteMany({ where: { staffId } });
  if (days) {
    await tx.staffHours.createMany({
      data: days.map((d) => ({ staffId, weekday: d.weekday, closed: d.closed, opensMin: d.opensMin, closesMin: d.closesMin })),
    });
  }
}

async function replaceServices(tx: Tx, staffId: string, serviceIds: string[]) {
  await tx.staffService.deleteMany({ where: { staffId } });
  if (serviceIds.length) await tx.staffService.createMany({ data: serviceIds.map((serviceId) => ({ staffId, serviceId })), skipDuplicates: true });
}

const hoursKey = (rows: ReadonlyArray<DayHours> | null) =>
  rows === null
    ? 'inherit'
    : [...rows]
        .sort((a, b) => a.weekday - b.weekday)
        .map((d) => (d.closed ? `${d.weekday}:x` : `${d.weekday}:${d.opensMin}-${d.closesMin}`))
        .join(',');

// ---- create ----------------------------------------------------------------------------
export async function createStaffCore(userId: string | null | undefined, businessId: string, raw: unknown): Promise<TeamResult> {
  return run(userId, businessId, async (o) => {
    const parsed = staffInputSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: staffFieldErrors(parsed.error) });
    const input = parsed.data;
    const out = await db.$transaction(async (tx) => {
      const bad = await checkServices(tx, o.business.id, input.serviceIds);
      if (bad) return bad;
      const hours = checkStaffHours(input.hours, await businessHours(tx, o.business.id));
      if (!hours.ok) return hours.errors;
      await lockBusiness(tx, o.business.id); // serialises sortOrder allocation
      const max = await tx.staffMember.aggregate({ where: { businessId: o.business.id }, _max: { sortOrder: true } });
      const staff = await tx.staffMember.create({
        data: { businessId: o.business.id, name: input.name, role: input.role, active: input.active, sortOrder: (max._max.sortOrder ?? -1) + 1 },
        select: { id: true },
      });
      await replaceServices(tx, staff.id, input.serviceIds);
      await writeHours(tx, staff.id, hours.days);
      await writeAudit(
        { actorId: o.user.id, businessId: o.business.id, action: 'staff.create', meta: { staffId: staff.id, fields: ['name', 'role', 'active', 'services', 'hours'] } },
        tx,
      );
      return staff.id;
    });
    if (typeof out !== 'string') return fail('VALIDATION', { errors: out });
    return done(o, out);
  });
}

// ---- update ----------------------------------------------------------------------------
export async function updateStaffCore(userId: string | null | undefined, businessId: string, staffId: string, raw: unknown): Promise<TeamResult> {
  return run(userId, businessId, async (o) => {
    const parsed = staffInputSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: staffFieldErrors(parsed.error) });
    const input = parsed.data;
    const out = await db.$transaction(async (tx) => {
      const scoped = await tx.staffMember.findFirst({ where: { id: staffId, businessId: o.business.id }, select: { id: true } });
      if (!scoped) return { kind: 'NOT_FOUND' as const };
      await lockStaff(tx, [scoped.id]);
      const existing = await tx.staffMember.findUniqueOrThrow({
        where: { id: scoped.id },
        include: { services: { select: { serviceId: true } }, staffHours: true },
      });
      const bad = await checkServices(tx, o.business.id, input.serviceIds);
      if (bad) return { kind: 'VALIDATION' as const, errors: bad };
      const hours = checkStaffHours(input.hours, await businessHours(tx, o.business.id));
      if (!hours.ok) return { kind: 'VALIDATION' as const, errors: hours.errors };
      if (existing.active && !input.active) {
        const n = await futureActiveCount(tx, existing.id);
        if (n > 0) return { kind: 'FUTURE' as const, n };
      }
      const next = { name: input.name, role: input.role, active: input.active };
      const fields = (Object.keys(next) as Array<keyof typeof next>).filter((k) => existing[k] !== next[k]) as string[];
      const prevServices = existing.services.map((s) => s.serviceId).sort().join(',');
      if (prevServices !== [...input.serviceIds].sort().join(',')) fields.push('services');
      const prevHours = existing.staffHours.length ? hoursKey(existing.staffHours) : 'inherit';
      if (prevHours !== hoursKey(hours.days)) fields.push('hours');
      await tx.staffMember.update({ where: { id: existing.id }, data: next });
      if (fields.includes('services')) await replaceServices(tx, existing.id, input.serviceIds);
      if (fields.includes('hours')) await writeHours(tx, existing.id, hours.days);
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'staff.update', meta: { staffId: existing.id, fields } }, tx);
      return { kind: 'OK' as const, id: existing.id };
    });
    if (out.kind === 'NOT_FOUND') return fail('NOT_FOUND');
    if (out.kind === 'VALIDATION') return fail('VALIDATION', { errors: out.errors });
    if (out.kind === 'FUTURE') return fail('HAS_FUTURE_BOOKINGS', { futureCount: out.n });
    return done(o, out.id);
  });
}

// ---- activate / deactivate -------------------------------------------------------------
/** Deactivating refuses while the member has future active bookings (resolve them first). */
export async function setStaffActiveCore(userId: string | null | undefined, businessId: string, staffId: string, active: boolean): Promise<TeamResult> {
  return run(userId, businessId, async (o) => {
    if (typeof active !== 'boolean') return fail('VALIDATION');
    const out = await db.$transaction(async (tx) => {
      const scoped = await tx.staffMember.findFirst({ where: { id: staffId, businessId: o.business.id }, select: { id: true } });
      if (!scoped) return { kind: 'NOT_FOUND' as const };
      await lockStaff(tx, [scoped.id]);
      const staff = await tx.staffMember.findUniqueOrThrow({ where: { id: scoped.id }, select: { id: true, active: true } });
      if (staff.active === active) return { kind: 'OK' as const, id: staff.id };
      if (!active) {
        const n = await futureActiveCount(tx, staff.id);
        if (n > 0) return { kind: 'FUTURE' as const, n };
      }
      await tx.staffMember.update({ where: { id: staff.id }, data: { active } });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: active ? 'staff.activate' : 'staff.deactivate', meta: { staffId: staff.id, fields: ['active'] } }, tx);
      return { kind: 'OK' as const, id: staff.id };
    });
    if (out.kind === 'NOT_FOUND') return fail('NOT_FOUND');
    if (out.kind === 'FUTURE') return fail('HAS_FUTURE_BOOKINGS', { futureCount: out.n });
    return done(o, out.id);
  });
}

// ---- reorder ---------------------------------------------------------------------------
/** Swap with the neighbour and rewrite sortOrder densely (0..n-1) inside a locked transaction. */
export async function moveStaffCore(userId: string | null | undefined, businessId: string, staffId: string, dir: 'up' | 'down'): Promise<TeamResult<{ moved: boolean }>> {
  return run(userId, businessId, async (o) => {
    if (dir !== 'up' && dir !== 'down') return fail('VALIDATION');
    const out = await db.$transaction(async (tx) => {
      await lockBusiness(tx, o.business.id);
      const list = await tx.staffMember.findMany({
        where: { businessId: o.business.id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, sortOrder: true },
      });
      if (!list.some((s) => s.id === staffId)) return 'NOT_FOUND' as const;
      // One flat list: reuse the services helper with a constant category.
      const swapped = moveWithinCategory(list.map((s) => ({ id: s.id, category: '' })), staffId, dir);
      const order = swapped ?? list.map((s) => s.id);
      const bySort = new Map(list.map((s) => [s.id, s.sortOrder]));
      for (const [i, id] of order.entries()) {
        if (bySort.get(id) !== i) await tx.staffMember.update({ where: { id }, data: { sortOrder: i } });
      }
      if (swapped) await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'staff.move', meta: { staffId, direction: dir } }, tx);
      return swapped !== null;
    });
    if (out === 'NOT_FOUND') return fail('NOT_FOUND');
    return { ...(await done(o, staffId)), moved: out };
  });
}

// ---- delete ----------------------------------------------------------------------------
export async function deleteStaffCore(
  userId: string | null | undefined,
  businessId: string,
  staffId: string,
): Promise<TeamResult<{ outcome: 'DELETED' | 'ARCHIVED' }>> {
  return run(userId, businessId, async (o) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await db.$transaction(async (tx) => {
          const scoped = await tx.staffMember.findFirst({ where: { id: staffId, businessId: o.business.id }, select: { id: true } });
          if (!scoped) return { kind: 'NOT_FOUND' as const };
          await lockBusiness(tx, o.business.id); // lock order: business, then staff
          await lockStaff(tx, [scoped.id]);
          const [activeFutureCount, anyBookingCount] = await Promise.all([
            futureActiveCount(tx, scoped.id),
            tx.booking.count({ where: { staffId: scoped.id } }),
          ]);
          const decision = decideDelete({ activeFutureCount, anyBookingCount });
          if (decision === 'REFUSE') return { kind: 'REFUSE' as const, activeFutureCount };
          if (decision === 'ARCHIVE') {
            await tx.staffMember.update({ where: { id: scoped.id }, data: { active: false } });
            await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'staff.archive', meta: { staffId: scoped.id, fields: ['active'] } }, tx);
            return { kind: 'ARCHIVED' as const };
          }
          await tx.staffMember.delete({ where: { id: scoped.id } }); // cascades links, hours, days off, blocks
          const rest = await tx.staffMember.findMany({ where: { businessId: o.business.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, sortOrder: true } });
          for (const [i, s] of rest.entries()) if (s.sortOrder !== i) await tx.staffMember.update({ where: { id: s.id }, data: { sortOrder: i } });
          await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'staff.delete', meta: { staffId: scoped.id } }, tx);
          return { kind: 'DELETED' as const };
        });
        if (out.kind === 'NOT_FOUND') return fail('NOT_FOUND');
        if (out.kind === 'REFUSE') return fail('HAS_FUTURE_BOOKINGS', { futureCount: out.activeFutureCount });
        return { ...(await done(o, staffId)), outcome: out.kind === 'DELETED' ? ('DELETED' as const) : ('ARCHIVED' as const) };
      } catch (e) {
        // A booking slipped in despite the lock: the FK refused the delete. Re-run the decision.
        if (isForeignKeyViolation(e) && attempt === 0) continue;
        throw e;
      }
    }
    return fail('UNKNOWN');
  });
}

// ---- days off --------------------------------------------------------------------------
export async function addDayOffCore(
  userId: string | null | undefined,
  businessId: string,
  staffId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<TeamResult<{ dayOffId: string }>> {
  return run(userId, businessId, async (o) => {
    const parsed = dayOffInputSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: staffFieldErrors(parsed.error) });
    const input = parsed.data;
    const rangeError = checkDayOffRange(input, localDateKey(now, BUSINESS_TZ));
    if (rangeError) return fail('VALIDATION', { errors: rangeError });
    // Local-midnight bounds of the range: DST-safe (never +24h arithmetic).
    const from = zonedWallTimeToUtc(input.fromDate, 0);
    const to = zonedWallTimeToUtc(addDaysToKey(input.toDate, 1), 0);
    const out = await db.$transaction(async (tx) => {
      const scoped = await tx.staffMember.findFirst({ where: { id: staffId, businessId: o.business.id }, select: { id: true } });
      if (!scoped) return { kind: 'NOT_FOUND' as const };
      await lockStaff(tx, [scoped.id]); // same lock online bookings take
      if ((await tx.staffDayOff.count({ where: { staffId: scoped.id } })) >= MAX_DAY_OFF_RANGES) {
        return { kind: 'VALIDATION' as const, errors: { form: 'tooMany' } };
      }
      const clashing = await tx.booking.findMany({
        where: { staffId: scoped.id, status: { in: [...ACTIVE_BOOKING_STATUSES] }, startsAt: { lt: to }, endsAt: { gt: from > now ? from : now } },
        select: { startsAt: true },
        orderBy: { startsAt: 'asc' },
      });
      if (clashing.length > 0) {
        const dates = [...new Set(clashing.map((b) => localDateKey(b.startsAt, BUSINESS_TZ)))].slice(0, 10);
        return { kind: 'CLASH' as const, count: clashing.length, dates };
      }
      const row = await tx.staffDayOff.create({
        data: { staffId: scoped.id, fromDate: input.fromDate, toDate: input.toDate, reason: input.reason ?? null },
        select: { id: true },
      });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'staff.dayoff.add', meta: { staffId: scoped.id, dayOffId: row.id, fields: ['dayOff'] } }, tx);
      return { kind: 'OK' as const, staffId: scoped.id, dayOffId: row.id };
    });
    if (out.kind === 'NOT_FOUND') return fail('NOT_FOUND');
    if (out.kind === 'VALIDATION') return fail('VALIDATION', { errors: out.errors });
    if (out.kind === 'CLASH') return fail('HAS_BOOKINGS', { futureCount: out.count, conflictDates: out.dates });
    return { ...(await done(o, out.staffId)), dayOffId: out.dayOffId };
  });
}

export async function removeDayOffCore(userId: string | null | undefined, businessId: string, dayOffId: string): Promise<TeamResult> {
  return run(userId, businessId, async (o) => {
    const out = await db.$transaction(async (tx) => {
      const row = await tx.staffDayOff.findFirst({ where: { id: dayOffId, staff: { businessId: o.business.id } }, select: { id: true, staffId: true } });
      if (!row) return null;
      await tx.staffDayOff.delete({ where: { id: row.id } });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'staff.dayoff.remove', meta: { staffId: row.staffId, dayOffId: row.id, fields: ['dayOff'] } }, tx);
      return row.staffId;
    });
    if (!out) return fail('NOT_FOUND');
    return done(o, out);
  });
}

// ---- page loader -----------------------------------------------------------------------
export interface TeamMemberDto {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  active: boolean;
  serviceIds: string[];
  serviceNames: string[];
  /** null = inherits business hours. Otherwise all 7 days. */
  customHours: DayHours[] | null;
  /** Ongoing and upcoming only. */
  daysOff: Array<{ id: string; fromDate: string; toDate: string; reason: string | null }>;
  /** Names of visible services this (active) member is the ONLY active provider of. */
  soleProviderOf: string[];
}
export interface TeamPageData {
  members: TeamMemberDto[];
  services: Array<{ id: string; name: string; active: boolean }>;
  businessHours: DayHours[];
  todayKey: string;
}

export async function loadTeamForDashboard(businessId: string, now: Date = new Date()): Promise<TeamPageData> {
  const todayKey = localDateKey(now, BUSINESS_TZ);
  const [staff, services, hours] = await Promise.all([
    db.staffMember.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        services: { select: { serviceId: true } },
        staffHours: true,
        daysOff: { where: { toDate: { gte: todayKey } }, orderBy: { fromDate: 'asc' } },
      },
    }),
    db.service.findMany({
      where: { businessId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, active: true, staffLinks: { select: { staffId: true } } },
    }),
    db.openingHours.findMany({ where: { businessId }, select: { weekday: true, closed: true, opensMin: true, closesMin: true } }),
  ]);
  const activeIds = new Set(staff.filter((s) => s.active).map((s) => s.id));
  const nameOf = new Map(services.map((s) => [s.id, s.name]));
  const sole = new Map<string, string[]>();
  for (const svc of services) {
    if (!svc.active) continue;
    const providers = svc.staffLinks.map((l) => l.staffId).filter((id) => activeIds.has(id));
    if (providers.length === 1) sole.set(providers[0]!, [...(sole.get(providers[0]!) ?? []), svc.name]);
  }
  return {
    members: staff.map((s): TeamMemberDto => ({
      id: s.id,
      name: s.name,
      role: s.role,
      photoUrl: s.photoUrl,
      active: s.active,
      serviceIds: s.services.map((l) => l.serviceId),
      serviceNames: s.services.map((l) => nameOf.get(l.serviceId)).filter((n): n is string => !!n),
      customHours: s.staffHours.length
        ? s.staffHours.map(({ weekday, closed, opensMin, closesMin }) => ({ weekday, closed, opensMin, closesMin })).sort((a, b) => a.weekday - b.weekday)
        : null,
      daysOff: s.daysOff.map((d) => ({ id: d.id, fromDate: d.fromDate, toDate: d.toDate, reason: d.reason })),
      soleProviderOf: s.active ? (sole.get(s.id) ?? []) : [],
    })),
    services: services.map((s) => ({ id: s.id, name: s.name, active: s.active })),
    businessHours: hours,
    todayKey,
  };
}
