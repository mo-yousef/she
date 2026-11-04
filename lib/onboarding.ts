/**
 * Onboarding cores (task 6.1). Server-only. `app/actions/onboarding.ts` holds the thin
 * 'use server' wrappers; everything here takes explicit inputs (user id, raw form object)
 * so Playwright can call it directly. Every business-scoped core starts with
 * `assertOwnsBusiness` (role AND Business.ownerId, read from the DB).
 *
 * Decisions (docs/decisions.md): a signed-in CUSTOMER becomes OWNER in the same
 * transaction that creates their DRAFT business; ADMIN is never downgraded; STAFF
 * cannot self-onboard. "Publish" moves DRAFT -> PENDING (admin approval lands in 7.1).
 */
import { Prisma, type BusinessStatus } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { assertOwnsBusiness, ownerAuthCode, type OwnerAuthCode } from './owner-auth';
import {
  basicsSchema,
  fieldErrors,
  firstServiceSchema,
  locationSchema,
  parseHoursForm,
  type FieldErrors,
} from './onboarding-schema';
import { publishChecklist, type ChecklistKey, type ChecklistInput } from './publish-checklist';
import { DEFAULT_SETTINGS } from './settings';
import { slugify } from './slug';

export type OnboardingResult<T = object> =
  | ({ ok: true; business: { id: string; slug: string } } & T)
  | { ok: false; code: OwnerAuthCode | 'VALIDATION' | 'NOT_ALLOWED' | 'INCOMPLETE' | 'UNKNOWN'; errors?: FieldErrors; missing?: ChecklistKey[] };

type Fail = Extract<OnboardingResult, { ok: false }>;
const fail = (code: Fail['code'], extra: Omit<Fail, 'ok' | 'code'> = {}): Fail => ({ ok: false, code, ...extra });

function unexpected(e: unknown): Fail {
  // Name only: error messages can embed submitted values (PII).
  console.error('onboarding failed', e instanceof Error ? e.name : 'unknown');
  return fail('UNKNOWN');
}

async function guarded<T>(
  userId: string | null,
  businessId: string,
  fn: (owned: Awaited<ReturnType<typeof assertOwnsBusiness>>) => Promise<OnboardingResult<T>>,
): Promise<OnboardingResult<T>> {
  try {
    return await fn(await assertOwnsBusiness(userId, businessId));
  } catch (e) {
    try {
      return fail(ownerAuthCode(e));
    } catch {
      return unexpected(e);
    }
  }
}

// ---- Step 1: create (first time) or update the basics ----------------------------------

const SLUG_ATTEMPTS = 5;

async function freeSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const base = slugify(name) || 'studio';
  const taken = new Set(
    (await tx.business.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((b) => b.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Creates the user's first Business (DRAFT) and sets role OWNER atomically. The user row
 * is locked first, so a double submit finds the business made by the first one and updates
 * it instead of creating a second. Slug collisions (unique index) are retried.
 */
export async function startOnboardingCore(userId: string | null, raw: unknown): Promise<OnboardingResult> {
  if (!userId) return fail('UNAUTHENTICATED');
  const parsed = basicsSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION', { errors: fieldErrors(parsed.error) });
  const data = parsed.data;

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
        if (!user) return fail('UNAUTHENTICATED');
        if (user.role === 'STAFF') return fail('NOT_ALLOWED');

        const existing = await tx.business.findFirst({
          where: { ownerId: userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, slug: true },
        });
        if (existing) {
          await tx.business.update({ where: { id: existing.id }, data: basicsData(data) });
          await writeAudit({ actorId: userId, businessId: existing.id, action: 'business.basics', meta: { fields: Object.keys(basicsData(data)) } }, tx);
          return { ok: true as const, business: existing };
        }

        const slug = await freeSlug(tx, data.name);
        const business = await tx.business.create({
          data: { ...basicsData(data), slug, ownerId: userId, status: 'DRAFT', settings: DEFAULT_SETTINGS },
          select: { id: true, slug: true },
        });
        if (user.role === 'CUSTOMER') {
          await tx.user.update({ where: { id: userId }, data: { role: 'OWNER' } });
          await writeAudit({ actorId: userId, businessId: business.id, action: 'user.role.owner', meta: { from: 'CUSTOMER' } }, tx);
        }
        await writeAudit({ actorId: userId, businessId: business.id, action: 'business.create', meta: { status: 'DRAFT' } }, tx);
        return { ok: true as const, business };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // slug raced: re-pick
      return unexpected(e);
    }
  }
  return fail('UNKNOWN');
}

function basicsData(d: ReturnType<typeof basicsSchema.parse>) {
  return {
    name: d.name,
    category: d.category,
    city: d.city,
    languages: d.languages,
    tagline: d.tagline ?? null,
    about: d.about ?? null,
  };
}

export async function saveBasicsCore(userId: string | null, businessId: string, raw: unknown): Promise<OnboardingResult> {
  return guarded(userId, businessId, async ({ user, business }) => {
    const parsed = basicsSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: fieldErrors(parsed.error) });
    const data = basicsData(parsed.data);
    await db.$transaction([
      db.business.update({ where: { id: business.id }, data }),
      db.auditLog.create({ data: { actorId: user.id, businessId: business.id, action: 'business.basics', meta: { fields: Object.keys(data) } } }),
    ]);
    return { ok: true, business };
  });
}

// ---- Step 2: location & contact --------------------------------------------------------

export async function saveLocationCore(userId: string | null, businessId: string, raw: unknown): Promise<OnboardingResult> {
  return guarded(userId, businessId, async ({ user, business }) => {
    const parsed = locationSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: fieldErrors(parsed.error) });
    const d = parsed.data;
    const data = {
      address: d.address,
      phone: d.phone ?? null,
      whatsapp: d.whatsapp ?? null,
      instagram: d.instagram ?? null,
      website: d.website ?? null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
    };
    await db.$transaction([
      db.business.update({ where: { id: business.id }, data }),
      db.auditLog.create({ data: { actorId: user.id, businessId: business.id, action: 'business.location', meta: { fields: Object.keys(data) } } }),
    ]);
    return { ok: true, business };
  });
}

// ---- Step 3: hours ---------------------------------------------------------------------

export async function saveHoursCore(userId: string | null, businessId: string, raw: Record<string, unknown>): Promise<OnboardingResult> {
  return guarded(userId, businessId, async ({ user, business }) => {
    const parsed = parseHoursForm(raw);
    if (!parsed.ok) {
      // Per-day codes are encoded as `day-<weekday>` / `form` field errors.
      const errors: FieldErrors = {};
      for (const e of parsed.errors) errors[e.weekday === null ? 'form' : `day-${e.weekday}`] ??= e.code;
      return fail('VALIDATION', { errors });
    }
    await db.$transaction([
      ...parsed.days.map((d) =>
        db.openingHours.upsert({
          where: { businessId_weekday: { businessId: business.id, weekday: d.weekday } },
          create: { businessId: business.id, weekday: d.weekday, opensMin: d.opensMin, closesMin: d.closesMin, closed: d.closed },
          update: { opensMin: d.opensMin, closesMin: d.closesMin, closed: d.closed },
        }),
      ),
      db.auditLog.create({ data: { actorId: user.id, businessId: business.id, action: 'business.hours', meta: { fields: ['openingHours'] } } }),
    ]);
    return { ok: true, business };
  });
}

// ---- Step 4: first service + first staff member ----------------------------------------

/**
 * Minimal version of 6.4/6.5: one service, one staff member, linked. Re-saving edits the
 * first service/staff (by sortOrder) instead of adding more, so the step is resumable.
 */
export async function saveFirstServiceCore(userId: string | null, businessId: string, raw: unknown): Promise<OnboardingResult> {
  return guarded(userId, businessId, async ({ user, business }) => {
    const parsed = firstServiceSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: fieldErrors(parsed.error) });
    const d = parsed.data;
    await db.$transaction(async (tx) => {
      const svcData = { name: d.serviceName, category: d.serviceCategory, durationMin: d.durationMin, priceCents: d.price, active: true };
      const existingService = await tx.service.findFirst({ where: { businessId: business.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
      const service = existingService
        ? await tx.service.update({ where: { id: existingService.id }, data: svcData, select: { id: true } })
        : await tx.service.create({ data: { ...svcData, businessId: business.id }, select: { id: true } });
      const existingStaff = await tx.staffMember.findFirst({ where: { businessId: business.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
      const staff = existingStaff
        ? await tx.staffMember.update({ where: { id: existingStaff.id }, data: { name: d.staffName, active: true }, select: { id: true } })
        : await tx.staffMember.create({ data: { businessId: business.id, name: d.staffName }, select: { id: true } });
      await tx.staffService.upsert({
        where: { staffId_serviceId: { staffId: staff.id, serviceId: service.id } },
        create: { staffId: staff.id, serviceId: service.id },
        update: {},
      });
      await writeAudit(
        { actorId: user.id, businessId: business.id, action: 'business.firstService', meta: { serviceId: service.id, staffId: staff.id } },
        tx,
      );
    });
    return { ok: true, business };
  });
}

// ---- Checklist + publish ---------------------------------------------------------------

type Client = Prisma.TransactionClient | typeof db;

/** Reads the counts the checklist needs. Used by pages AND by the publish core. */
export async function loadChecklistInput(client: Client, businessId: string): Promise<ChecklistInput | null> {
  const b = await client.business.findUnique({
    where: { id: businessId },
    select: { name: true, category: true, city: true, address: true },
  });
  if (!b) return null;
  const [serviceCount, staffCount, hours, photoCount] = await Promise.all([
    client.service.count({ where: { businessId, active: true } }),
    client.staffMember.count({ where: { businessId, active: true, services: { some: { service: { active: true } } } } }),
    client.openingHours.findMany({ where: { businessId, closed: false }, select: { opensMin: true, closesMin: true } }),
    client.photo.count({ where: { businessId } }),
  ]);
  return { ...b, serviceCount, staffCount, openDayCount: hours.filter((h) => h.closesMin > h.opensMin).length, photoCount };
}

/**
 * Submits a DRAFT listing for approval: DRAFT -> PENDING. The checklist is recomputed
 * from the database inside the transaction on a locked row; nothing the client sends
 * matters. Unpublish/settings is 6.8; PENDING -> PUBLISHED is admin approval (7.1).
 */
export async function submitForReviewCore(userId: string | null, businessId: string): Promise<OnboardingResult<{ status: BusinessStatus }>> {
  return guarded(userId, businessId, async ({ user, business }) => {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business.id} FOR UPDATE`;
      const current = await tx.business.findUniqueOrThrow({ where: { id: business.id }, select: { status: true } });
      if (current.status !== 'DRAFT') return fail('NOT_ALLOWED');
      const input = await loadChecklistInput(tx, business.id);
      const { items, canPublish } = publishChecklist(input!);
      if (!canPublish) return fail('INCOMPLETE', { missing: items.filter((i) => !i.done).map((i) => i.key) });
      await tx.business.update({ where: { id: business.id }, data: { status: 'PENDING' } });
      await writeAudit({ actorId: user.id, businessId: business.id, action: 'business.submit', meta: { from: 'DRAFT', to: 'PENDING' } }, tx);
      return { ok: true as const, business, status: 'PENDING' as const };
    });
  });
}
