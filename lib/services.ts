/**
 * Services CRUD cores (task 6.4, req 5.1). Server-only. `app/actions/services.ts` holds the
 * thin 'use server' wrappers; everything here takes explicit inputs so Playwright can call it.
 * Every core starts with `assertOwnsBusiness`; every client-supplied service/staff id is
 * checked against the owner's business (cross-tenant ids are rejected).
 *
 * Delete rule (Booking.serviceId is ON DELETE RESTRICT): future active bookings -> refuse
 * (HAS_FUTURE_BOOKINGS, owner is offered "hide"); only history -> ARCHIVE (hide, row kept);
 * no bookings -> hard delete. Check + delete run in one transaction holding a row lock on the
 * Service; a P2003 from a racing insert is caught and the decision re-run.
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { isForeignKeyViolation } from './booking-errors';
import { assertOwnsBusiness, ownerAuthCode, type OwnedBusiness, type OwnerAuthCode } from './owner-auth';
import {
  ACTIVE_BOOKING_STATUSES,
  SERVICE_LOCALES,
  decideDelete,
  moveWithinCategory,
  serviceFieldErrors,
  serviceInputSchema,
  type FieldErrors,
  type ServiceInput,
} from './services-schema';

/** Non-blocking: the listing is PENDING/PUBLISHED but has no visible service left. */
export type ServiceWarning = 'NO_VISIBLE_SERVICE';

type Fail = {
  ok: false;
  code: OwnerAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'HAS_FUTURE_BOOKINGS' | 'UNKNOWN';
  errors?: FieldErrors;
  /** Number of upcoming active bookings (count only, no PII). */
  futureCount?: number;
};
export type ServiceResult<T = object> =
  | ({ ok: true; businessId: string; slug: string; serviceId: string; warnings: ServiceWarning[] } & T)
  | Fail;

const fail = (code: Fail['code'], extra: Omit<Fail, 'ok' | 'code'> = {}): Fail => ({ ok: false, code, ...extra });

async function run<T>(
  userId: string | null | undefined,
  businessId: string,
  fn: (o: OwnedBusiness) => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  let owned: OwnedBusiness;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  try {
    return await fn(owned);
  } catch (e) {
    console.error('services failed', e instanceof Error ? e.name : 'unknown'); // name only: no PII
    return fail('UNKNOWN');
  }
}

const lockBusiness = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${id} FOR UPDATE`;
const lockService = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${id} FOR UPDATE`;

async function warningsFor(o: OwnedBusiness): Promise<ServiceWarning[]> {
  if (o.business.status !== 'PENDING' && o.business.status !== 'PUBLISHED') return [];
  const visible = await db.service.count({ where: { businessId: o.business.id, active: true } });
  return visible === 0 ? ['NO_VISIBLE_SERVICE'] : [];
}

const done = async (o: OwnedBusiness, serviceId: string) => ({
  ok: true as const,
  businessId: o.business.id,
  slug: o.business.slug,
  serviceId,
  warnings: await warningsFor(o),
});

/** Staff ids must belong to this business; a visible service needs at least one ACTIVE one. */
async function checkStaff(tx: Prisma.TransactionClient, businessId: string, input: ServiceInput): Promise<FieldErrors | null> {
  const rows = await tx.staffMember.findMany({ where: { id: { in: input.staffIds }, businessId }, select: { id: true, active: true } });
  if (rows.length !== input.staffIds.length) return { staffIds: 'staffInvalid' };
  if (input.active && !rows.some((r) => r.active)) return { staffIds: 'staffRequired' };
  return null;
}

async function writeTranslations(tx: Prisma.TransactionClient, serviceId: string, input: ServiceInput) {
  if (!input.translations) return;
  for (const locale of SERVICE_LOCALES) {
    const t = input.translations[locale];
    if (t?.name || t?.description) {
      const data = { name: t.name ?? null, description: t.description ?? null };
      await tx.serviceTranslation.upsert({ where: { serviceId_locale: { serviceId, locale } }, create: { serviceId, locale, ...data }, update: data });
    } else {
      await tx.serviceTranslation.deleteMany({ where: { serviceId, locale } });
    }
  }
}

/** Replace the eligibility set. Links to INACTIVE staff (not shown in the form) are kept. */
async function replaceStaff(tx: Prisma.TransactionClient, serviceId: string, staffIds: string[]) {
  await tx.staffService.deleteMany({ where: { serviceId, staff: { active: true } } });
  if (staffIds.length) await tx.staffService.createMany({ data: staffIds.map((staffId) => ({ staffId, serviceId })), skipDuplicates: true });
}

// ---- create ----------------------------------------------------------------------------

export async function createServiceCore(userId: string | null | undefined, businessId: string, raw: unknown): Promise<ServiceResult> {
  return run(userId, businessId, async (o) => {
    const parsed = serviceInputSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: serviceFieldErrors(parsed.error) });
    const input = parsed.data;
    const out = await db.$transaction(async (tx) => {
      const bad = await checkStaff(tx, o.business.id, input);
      if (bad) return bad;
      await lockBusiness(tx, o.business.id); // serialises sortOrder allocation
      const max = await tx.service.aggregate({ where: { businessId: o.business.id }, _max: { sortOrder: true } });
      const service = await tx.service.create({
        data: {
          businessId: o.business.id,
          category: input.category,
          name: input.name,
          description: input.description ?? null,
          durationMin: input.durationMin,
          bufferMin: input.bufferMin,
          priceCents: input.price,
          active: input.active,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });
      await replaceStaff(tx, service.id, input.staffIds);
      await writeTranslations(tx, service.id, input);
      await writeAudit(
        { actorId: o.user.id, businessId: o.business.id, action: 'service.create', meta: { serviceId: service.id, fields: ['name', 'category', 'description', 'durationMin', 'bufferMin', 'priceCents', 'active', 'staff'] } },
        tx,
      );
      return service.id;
    });
    if (typeof out !== 'string') return fail('VALIDATION', { errors: out });
    return done(o, out);
  });
}

// ---- update ----------------------------------------------------------------------------

export async function updateServiceCore(userId: string | null | undefined, businessId: string, serviceId: string, raw: unknown): Promise<ServiceResult> {
  return run(userId, businessId, async (o) => {
    const parsed = serviceInputSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: serviceFieldErrors(parsed.error) });
    const input = parsed.data;
    const out = await db.$transaction(async (tx) => {
      const existing = await tx.service.findFirst({
        where: { id: serviceId, businessId: o.business.id },
        include: { staffLinks: { select: { staffId: true, staff: { select: { active: true } } } }, translations: true },
      });
      if (!existing) return 'NOT_FOUND' as const;
      const bad = await checkStaff(tx, o.business.id, input);
      if (bad) return bad;

      const next = { name: input.name, category: input.category, description: input.description ?? null, durationMin: input.durationMin, bufferMin: input.bufferMin, priceCents: input.price, active: input.active };
      const fields = (Object.keys(next) as Array<keyof typeof next>).filter((k) => existing[k] !== next[k]) as string[];
      const prevStaff = existing.staffLinks.filter((l) => l.staff.active).map((l) => l.staffId).sort().join(',');
      if (prevStaff !== [...input.staffIds].sort().join(',')) fields.push('staff');
      if (input.translations) {
        const same = SERVICE_LOCALES.every((l) => {
          const row = existing.translations.find((t) => t.locale === l);
          const t = input.translations![l];
          return (row?.name ?? undefined) === t?.name && (row?.description ?? undefined) === t?.description;
        });
        if (!same) fields.push('translations');
      }

      await tx.service.update({ where: { id: existing.id }, data: next });
      await replaceStaff(tx, existing.id, input.staffIds);
      await writeTranslations(tx, existing.id, input);
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'service.update', meta: { serviceId: existing.id, fields } }, tx);
      return existing.id;
    });
    if (out === 'NOT_FOUND') return fail('NOT_FOUND');
    if (typeof out !== 'string') return fail('VALIDATION', { errors: out });
    return done(o, out);
  });
}

// ---- hide / show -----------------------------------------------------------------------

/** Hiding never touches existing bookings; new bookings are blocked because the public flow requires active. */
export async function setServiceActiveCore(userId: string | null | undefined, businessId: string, serviceId: string, active: boolean): Promise<ServiceResult> {
  return run(userId, businessId, async (o) => {
    if (typeof active !== 'boolean') return fail('VALIDATION');
    const out = await db.$transaction(async (tx) => {
      const svc = await tx.service.findFirst({
        where: { id: serviceId, businessId: o.business.id },
        select: { id: true, active: true, staffLinks: { select: { staff: { select: { active: true } } } } },
      });
      if (!svc) return 'NOT_FOUND' as const;
      if (active && !svc.staffLinks.some((l) => l.staff.active)) return 'STAFF' as const; // same rule as the form
      if (svc.active !== active) {
        await tx.service.update({ where: { id: svc.id }, data: { active } });
        await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: active ? 'service.show' : 'service.hide', meta: { serviceId: svc.id, fields: ['active'] } }, tx);
      }
      return svc.id;
    });
    if (out === 'NOT_FOUND') return fail('NOT_FOUND');
    if (out === 'STAFF') return fail('VALIDATION', { errors: { staffIds: 'staffRequired' } });
    return done(o, out);
  });
}

// ---- reorder ---------------------------------------------------------------------------

/**
 * Swaps with the neighbour in the same category and rewrites sortOrder densely (0..n-1) for
 * the whole business inside one locked transaction, so ties/gaps from earlier writes heal and
 * there is no unique index to trip over.
 */
export async function moveServiceCore(userId: string | null | undefined, businessId: string, serviceId: string, dir: 'up' | 'down'): Promise<ServiceResult<{ moved: boolean }>> {
  return run(userId, businessId, async (o) => {
    if (dir !== 'up' && dir !== 'down') return fail('VALIDATION');
    const out = await db.$transaction(async (tx) => {
      await lockBusiness(tx, o.business.id);
      const list = await tx.service.findMany({
        where: { businessId: o.business.id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, category: true, sortOrder: true },
      });
      if (!list.some((s) => s.id === serviceId)) return 'NOT_FOUND' as const;
      const swapped = moveWithinCategory(list, serviceId, dir);
      const order = swapped ?? list.map((s) => s.id);
      const bySort = new Map(list.map((s) => [s.id, s.sortOrder]));
      for (const [i, id] of order.entries()) {
        if (bySort.get(id) !== i) await tx.service.update({ where: { id }, data: { sortOrder: i } });
      }
      if (swapped) await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'service.move', meta: { serviceId, direction: dir } }, tx);
      return swapped !== null;
    });
    if (out === 'NOT_FOUND') return fail('NOT_FOUND');
    return { ...(await done(o, serviceId)), moved: out };
  });
}

// ---- delete ----------------------------------------------------------------------------

export async function deleteServiceCore(
  userId: string | null | undefined,
  businessId: string,
  serviceId: string,
): Promise<ServiceResult<{ outcome: 'DELETED' | 'ARCHIVED' }>> {
  return run(userId, businessId, async (o) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await db.$transaction(async (tx) => {
          const svc = await tx.service.findFirst({ where: { id: serviceId, businessId: o.business.id }, select: { id: true } });
          if (!svc) return { kind: 'NOT_FOUND' as const };
          // Row lock: an in-flight booking insert holds a KEY SHARE lock on this row via its FK,
          // so we wait for it (and then see it); a later insert waits for us and fails the FK.
          await lockService(tx, svc.id);
          const [activeFutureCount, anyBookingCount] = await Promise.all([
            tx.booking.count({ where: { serviceId: svc.id, status: { in: [...ACTIVE_BOOKING_STATUSES] }, endsAt: { gt: new Date() } } }),
            tx.booking.count({ where: { serviceId: svc.id } }),
          ]);
          const decision = decideDelete({ activeFutureCount, anyBookingCount });
          if (decision === 'REFUSE') return { kind: 'REFUSE' as const, activeFutureCount };
          if (decision === 'ARCHIVE') {
            await tx.service.update({ where: { id: svc.id }, data: { active: false } });
            await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'service.archive', meta: { serviceId: svc.id, fields: ['active'] } }, tx);
            return { kind: 'ARCHIVED' as const };
          }
          await tx.service.delete({ where: { id: svc.id } }); // cascades translations + StaffService
          const rest = await tx.service.findMany({ where: { businessId: o.business.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, sortOrder: true } });
          for (const [i, s] of rest.entries()) if (s.sortOrder !== i) await tx.service.update({ where: { id: s.id }, data: { sortOrder: i } });
          await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'service.delete', meta: { serviceId: svc.id } }, tx);
          return { kind: 'DELETED' as const };
        });
        if (out.kind === 'NOT_FOUND') return fail('NOT_FOUND');
        if (out.kind === 'REFUSE') return fail('HAS_FUTURE_BOOKINGS', { futureCount: out.activeFutureCount });
        return { ...(await done(o, serviceId)), outcome: out.kind === 'DELETED' ? ('DELETED' as const) : ('ARCHIVED' as const) };
      } catch (e) {
        // A booking slipped in despite the lock: the FK refused the delete. Re-run the decision.
        if (isForeignKeyViolation(e) && attempt === 0) continue;
        throw e;
      }
    }
    return fail('UNKNOWN');
  });
}

// ---- page loader -----------------------------------------------------------------------

export interface ServiceDto {
  id: string;
  category: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  active: boolean;
  /** Eligible ACTIVE staff ids (what the form edits). */
  staffIds: string[];
  staffNames: string[];
  translations: Record<'el' | 'ru', { name: string; description: string }>;
}

export async function loadServicesForDashboard(businessId: string): Promise<{ services: ServiceDto[]; staff: Array<{ id: string; name: string }> }> {
  const [rows, staff] = await Promise.all([
    db.service.findMany({
      where: { businessId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        staffLinks: { select: { staff: { select: { id: true, name: true, active: true } } } },
        translations: true,
      },
    }),
    db.staffMember.findMany({ where: { businessId, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
  ]);
  const services = rows.map((s): ServiceDto => {
    const eligible = s.staffLinks.map((l) => l.staff).filter((m) => m.active);
    const tr = (l: 'el' | 'ru') => {
      const r = s.translations.find((t) => t.locale === l);
      return { name: r?.name ?? '', description: r?.description ?? '' };
    };
    return {
      id: s.id,
      category: s.category,
      name: s.name,
      description: s.description,
      durationMin: s.durationMin,
      bufferMin: s.bufferMin,
      priceCents: s.priceCents,
      active: s.active,
      staffIds: eligible.map((m) => m.id),
      staffNames: eligible.map((m) => m.name),
      translations: { el: tr('el'), ru: tr('ru') },
    };
  });
  return { services, staff };
}
