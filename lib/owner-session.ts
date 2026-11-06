/**
 * Session-bound entry point for dashboard pages (task 6.1). Thin wrapper around
 * `owner-auth.ts` that reads the signed-in session and redirects instead of throwing,
 * since pages need a redirect, not a result code. Server actions use `assertOwnsBusiness`
 * directly and return a result instead of redirecting.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { db } from './db';

export interface OwnerContext {
  userId: string;
  role: string;
  business: {
    id: string;
    slug: string;
    name: string;
    status: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'SUSPENDED';
  };
}

/**
 * Requires a signed-in OWNER or ADMIN. Redirects to sign-in (with callbackUrl) if not
 * signed in; redirects to onboarding if signed in but has no Business yet. Role is
 * re-read from the database, not the session's cached copy.
 */
export const requireOwnerBusiness = cache(async (locale: string, path: string): Promise<OwnerContext> => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/signin?callbackUrl=${encodeURIComponent(path)}`);
  }
  // Role comes from `session.user.role`, which `getCurrentUser` reads FRESH from
  // the Prisma row on every call (upsert ... select role) — never from the cached
  // session token. Reusing it preserves the "role from DB" guarantee while
  // avoiding a redundant `db.user.findUnique`.
  if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
    redirect(`/${locale}/for-business`);
  }
  // The owner's dashboard business is their oldest one. A single query returns
  // every field OwnerContext needs.
  const business = await db.business.findFirst({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true, name: true, status: true },
  });
  if (!business) {
    redirect(`/${locale}/onboarding`);
  }
  return { userId: session.user.id, role: session.user.role, business };
});
