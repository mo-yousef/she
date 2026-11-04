/**
 * Booking rules + listing status cores (task 6.8, req 5.1). Server-only; `app/actions/settings.ts`
 * holds the thin wrappers. Every core starts with `assertOwnsBusiness`.
 *
 *  - saveSettingsCore: validates with the shared schema, merges into Business.settings under the
 *    Business row lock (unknown keys survive), audits `business.settings` with changed FIELD NAMES only.
 *    Existing bookings are never touched: a new rule applies to bookings made or changed afterwards.
 *  - unpublishCore: PUBLISHED | PENDING -> DRAFT under the Business row lock. SUSPENDED is admin-only
 *    (NOT_ALLOWED). Existing bookings stay valid and manageable; only new online bookings stop.
 */
import { db } from './db';
import { writeAudit } from './audit';
import { assertOwnsBusiness, ownerAuthCode, type OwnedBusiness, type OwnerAuthCode } from './owner-auth';
import { ACTIVE_STATUSES } from './booking-status';
import { parseSettings } from './settings';
import { changedSettingKeys, mergeSettings, parseSettingsForm, type SettingsFieldErrors } from './settings-schema';

type Fail = { ok: false; code: OwnerAuthCode | 'VALIDATION' | 'NOT_ALLOWED' | 'UNKNOWN'; errors?: SettingsFieldErrors };
export type SettingsResult<T = object> = ({ ok: true; businessId: string; slug: string } & T) | Fail;
const fail = (code: Fail['code'], errors?: SettingsFieldErrors): Fail => ({ ok: false, code, ...(errors ? { errors } : {}) });

async function run<T>(userId: string | null | undefined, businessId: string, fn: (o: OwnedBusiness) => Promise<SettingsResult<T>>): Promise<SettingsResult<T>> {
  let owned: OwnedBusiness;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  try {
    return await fn(owned);
  } catch (e) {
    console.error('settings failed', e instanceof Error ? e.name : 'unknown'); // name only
    return fail('UNKNOWN');
  }
}

export async function saveSettingsCore(userId: string | null | undefined, businessId: string, raw: unknown): Promise<SettingsResult<{ fields: string[] }>> {
  return run(userId, businessId, async (o) => {
    const parsed = parseSettingsForm(raw);
    if (!parsed.ok) return fail('VALIDATION', parsed.errors);
    const fields = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${o.business.id} FOR UPDATE`;
      const row = await tx.business.findUniqueOrThrow({ where: { id: o.business.id }, select: { settings: true } });
      const changed = changedSettingKeys(parseSettings(row.settings), parsed.data);
      if (changed.length) {
        await tx.business.update({ where: { id: o.business.id }, data: { settings: mergeSettings(row.settings, parsed.data) as object } });
        await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'business.settings', meta: { fields: changed } }, tx);
      }
      return changed;
    });
    return { ok: true, businessId: o.business.id, slug: o.business.slug, fields };
  });
}

export async function unpublishCore(userId: string | null | undefined, businessId: string): Promise<SettingsResult<{ from: 'PUBLISHED' | 'PENDING' }>> {
  return run(userId, businessId, async (o) =>
    db.$transaction(async (tx): Promise<SettingsResult<{ from: 'PUBLISHED' | 'PENDING' }>> => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${o.business.id} FOR UPDATE`;
      const { status } = await tx.business.findUniqueOrThrow({ where: { id: o.business.id }, select: { status: true } });
      if (status !== 'PUBLISHED' && status !== 'PENDING') return fail('NOT_ALLOWED'); // DRAFT already; SUSPENDED admin-only
      await tx.business.update({ where: { id: o.business.id }, data: { status: 'DRAFT' } });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'business.unpublish', meta: { from: status, to: 'DRAFT' } }, tx);
      return { ok: true, businessId: o.business.id, slug: o.business.slug, from: status };
    }),
  );
}

/** Upcoming active bookings: shown in the unpublish confirmation so the owner knows what stays. */
export function countUpcomingActive(businessId: string, now: Date = new Date()): Promise<number> {
  return db.booking.count({ where: { businessId, status: { in: [...ACTIVE_STATUSES] }, endsAt: { gt: now } } });
}
