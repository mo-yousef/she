'use server';
/**
 * Thin server-action wrappers for the profile page (task 6.7). Rules live in lib/profile.ts;
 * these resolve the session, derive the business from the owner (never from client input),
 * call the core and revalidate the public page + dashboard.
 */
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { saveBrandCore, saveProfileCore, type ProfileResult } from '@/lib/profile';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';

async function scope(): Promise<{ userId: string | null; businessId: string | null }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, businessId: userId ? await findOwnerBusinessId(userId) : null };
}

function after<T>(result: ProfileResult<T>): ProfileResult<T> {
  if (result.ok) {
    // 'overview' = publish checklist.
    revalidateAfterOwnerEdit({ business: { id: result.businessId, slug: result.slug }, surfaces: ['public', 'profile', 'overview'] });
  }
  return result;
}

const denied = (userId: string | null) => ({ ok: false as const, code: userId ? ('FORBIDDEN' as const) : ('UNAUTHENTICATED' as const) });

export async function saveProfile(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await saveProfileCore(userId, businessId, raw));
}

export async function saveBrand(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await saveBrandCore(userId, businessId, raw));
}
