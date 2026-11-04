/**
 * Admin cores (task 7.1, req 5). Server-only; `app/actions/admin.ts` holds the thin wrappers.
 * Every core starts with `assertAdmin` (role from the DB). Transitions are status-guarded under the
 * Business row lock; audit rows carry ids, statuses and fixed codes only (never names or emails).
 *
 * Suspending keeps existing bookings valid (same stance as owner unpublish): only new online
 * bookings stop, because the public page and search show PUBLISHED listings only.
 */
import type { BusinessStatus, ReviewStatus, Role } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { adminAuthCode, assertAdmin, type AdminAuthCode } from './admin-auth';
import { BUSINESS_TRANSITIONS, REVIEW_TRANSITIONS, type BusinessAction, type ReviewAction } from './admin-params';
import { loadChecklistInput } from './onboarding';
import { publishChecklist } from './publish-checklist';
import { lockBusiness, recomputeBusinessRating } from './review-rating';
type Code = AdminAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'NOT_ALLOWED' | 'INCOMPLETE' | 'SELF_DEMOTE' | 'LAST_ADMIN' | 'UNKNOWN';
export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; code: Code; missing?: string[] };
const fail = (code: Code, missing?: string[]): { ok: false; code: Code; missing?: string[] } => ({ ok: false, code, ...(missing ? { missing } : {}) });
async function guarded<T>(userId: string | null | undefined, fn: (adminId: string) => Promise<AdminResult<T>>): Promise<AdminResult<T>> {
  let adminId: string;
  try {
    adminId = (await assertAdmin(userId)).id;
  } catch (e) {
    return fail(adminAuthCode(e));
  }
  try {
    return await fn(adminId);
  } catch (e) {
    console.error('admin action failed', e instanceof Error ? e.name : 'unknown'); // name only
    return fail('UNKNOWN');
  }
}
export function adminBusinessCore(
  userId: string | null | undefined,
  businessId: string,
  action: BusinessAction,
): Promise<AdminResult<{ businessId: string; slug: string; from: BusinessStatus; to: BusinessStatus }>> {
  return guarded(userId, async (adminId) => {
    const rule = BUSINESS_TRANSITIONS[action as BusinessAction];
    if (!rule || typeof businessId !== 'string' || !businessId) return fail('VALIDATION');
    return db.$transaction(async (tx) => {
      await lockBusiness(tx, businessId);
      const b = await tx.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true, status: true } });
      if (!b) return fail('NOT_FOUND');
      if (!rule.from.includes(b.status)) return fail('NOT_ALLOWED');
      if (action === 'approve') {
        // Recomputed from the DB under the lock: an owner may have edited since submitting.
        const { items, canPublish } = publishChecklist((await loadChecklistInput(tx, b.id))!);
        if (!canPublish) return fail('INCOMPLETE', items.filter((i) => !i.done).map((i) => i.key));
      }
      await tx.business.update({ where: { id: b.id }, data: { status: rule.to } });
      await writeAudit({ actorId: adminId, businessId: b.id, action: `admin.business.${action}`, meta: { from: b.status, to: rule.to } }, tx);
      return { ok: true as const, businessId: b.id, slug: b.slug, from: b.status, to: rule.to };
    });
  });
}
export function adminReviewCore(
  userId: string | null | undefined,
  reviewId: string,
  action: ReviewAction,
): Promise<AdminResult<{ businessId: string; slug: string; from: ReviewStatus; to: ReviewStatus }>> {
  return guarded(userId, async (adminId) => {
    const rule = REVIEW_TRANSITIONS[action as ReviewAction];
    if (!rule || typeof reviewId !== 'string' || !reviewId) return fail('VALIDATION');
    const found = await db.review.findUnique({ where: { id: reviewId }, select: { businessId: true } });
    if (!found) return fail('NOT_FOUND');
    return db.$transaction(async (tx) => {
      await lockBusiness(tx, found.businessId); // serialises with new reviews and owner reports
      const r = await tx.review.findUnique({ where: { id: reviewId }, select: { id: true, status: true, business: { select: { id: true, slug: true } } } });
      if (!r) return fail('NOT_FOUND');
      if (!rule.from.includes(r.status)) return fail('NOT_ALLOWED');
      await tx.review.update({ where: { id: r.id }, data: { status: rule.to } });
      await recomputeBusinessRating(tx, r.business.id);
      await writeAudit({ actorId: adminId, businessId: r.business.id, action: `admin.review.${action}`, meta: { reviewId: r.id, from: r.status, to: rule.to } }, tx);
      return { ok: true as const, businessId: r.business.id, slug: r.business.slug, from: r.status, to: rule.to };
    });
  });
}
/**
 * Make admin / remove admin. Guards: an admin cannot remove their own role; the last admin cannot be
 * removed (checked under a lock on every ADMIN row so two admins demoting each other cannot both win).
 * Removing admin returns the user to OWNER if they own a business, else CUSTOMER.
 */
export function adminSetRoleCore(
  userId: string | null | undefined,
  targetId: string,
  makeAdmin: boolean,
): Promise<AdminResult<{ from: Role; to: Role }>> {
  return guarded(userId, async (adminId) => {
    if (typeof targetId !== 'string' || !targetId || typeof makeAdmin !== 'boolean') return fail('VALIDATION');
    if (!makeAdmin && targetId === adminId) return fail('SELF_DEMOTE');
    return db.$transaction(async (tx) => {
      const admins = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "role" = 'ADMIN' FOR UPDATE`;
      const t = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, _count: { select: { businesses: true } } } });
      if (!t) return fail('NOT_FOUND');
      let to: Role;
      if (makeAdmin) {
        if (t.role === 'ADMIN') return fail('NOT_ALLOWED');
        to = 'ADMIN';
      } else {
        if (t.role !== 'ADMIN') return fail('NOT_ALLOWED');
        if (admins.length <= 1) return fail('LAST_ADMIN');
        to = t._count.businesses > 0 ? 'OWNER' : 'CUSTOMER';
      }
      await tx.user.update({ where: { id: t.id }, data: { role: to } });
      await writeAudit({ actorId: adminId, businessId: null, action: 'admin.user.role', meta: { userId: t.id, from: t.role, to } }, tx);
      return { ok: true as const, from: t.role, to };
    });
  });
}
