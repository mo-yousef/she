/**
 * Owner authorisation (req 5.1: "authorise every owner action against ownership of the
 * target business"). Server-only, DB-backed, no Next/Auth.js imports so Playwright can call
 * it directly. Rules, decided from the DATABASE (never the cached session role):
 *   role is OWNER or ADMIN  AND  Business.ownerId === user id.
 * ADMIN gets no access to other people's businesses here (impersonation is out of scope).
 * The signed-in-session wrapper `requireOwnerBusiness` lives in `owner-session.ts`.
 */
import type { BusinessStatus, Role } from '@prisma/client';
import { db } from './db';

export type OwnerAuthCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

export class OwnerAuthError extends Error {
  constructor(readonly code: OwnerAuthCode) {
    super(code);
    this.name = 'OwnerAuthError';
  }
}

/** Pure ownership predicate. */
export function ownsBusiness(user: { id: string; role: Role | string }, business: { ownerId: string }): boolean {
  return (user.role === 'OWNER' || user.role === 'ADMIN') && business.ownerId === user.id;
}

export interface OwnedBusiness {
  user: { id: string; role: Role };
  business: { id: string; slug: string; ownerId: string; status: BusinessStatus };
}

/**
 * Throws `OwnerAuthError`. A missing business and someone else's business both answer
 * FORBIDDEN so ids cannot be probed. Call this at the top of EVERY owner mutation.
 */
export async function assertOwnsBusiness(userId: string | null | undefined, businessId: string): Promise<OwnedBusiness> {
  if (!userId) throw new OwnerAuthError('UNAUTHENTICATED');
  const [user, business] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true, ownerId: true, status: true } }),
  ]);
  if (!user) throw new OwnerAuthError('UNAUTHENTICATED');
  if (!business || !ownsBusiness(user, business)) throw new OwnerAuthError('FORBIDDEN');
  return { user, business };
}

/** Maps a thrown error to a result code; rethrows anything that is not an auth error. */
export function ownerAuthCode(e: unknown): OwnerAuthCode {
  if (e instanceof OwnerAuthError) return e.code;
  throw e;
}

/** The business an owner works on in the dashboard: their oldest one. */
export async function findOwnerBusinessId(userId: string): Promise<string | null> {
  const b = await db.business.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return b?.id ?? null;
}
