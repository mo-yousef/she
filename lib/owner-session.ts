/**
 * Session-bound entry point for dashboard pages (task 6.1). Thin wrapper around
 * `owner-auth.ts` that reads the signed-in session and redirects instead of throwing,
 * since pages need a redirect, not a result code. Server actions use `assertOwnsBusiness`
 * directly and return a result instead of redirecting.
 */
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { db } from './db';
import { findOwnerBusinessId } from './owner-auth';

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
export async function requireOwnerBusiness(locale: string, path: string): Promise<OwnerContext> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/signin?callbackUrl=${encodeURIComponent(path)}`);
  }
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
    redirect(`/${locale}/for-business`);
  }
  const businessId = await findOwnerBusinessId(user.id);
  if (!businessId) {
    redirect(`/${locale}/onboarding`);
  }
  const business = await db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { id: true, slug: true, name: true, status: true },
  });
  return { userId: user.id, role: user.role, business };
}
