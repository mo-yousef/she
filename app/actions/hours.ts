'use server';
/**
 * Thin server-action wrappers for the hours editor (task 6.6). Rules live in
 * lib/business-hours.ts; these resolve the session, derive the business from the owner (never
 * from client input), call the core and revalidate the public page + dashboard.
 */
import { auth } from '@/lib/auth';
import { addClosureCore, removeClosureCore, saveBusinessHoursCore, type HoursResult } from '@/lib/business-hours';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';

async function scope(): Promise<{ userId: string | null; businessId: string | null }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, businessId: userId ? await findOwnerBusinessId(userId) : null };
}
function after<T>(result: HoursResult<T>): HoursResult<T> {
  if (result.ok) {
    // Calendar shading, staff windows and the overview checklist depend on hours / closures.
    revalidateAfterOwnerEdit({ business: { id: result.businessId, slug: result.slug }, surfaces: ['public', 'hours', 'calendar', 'team', 'overview'] });
  }
  return result;
}
const denied = (userId: string | null) => ({ ok: false as const, code: userId ? ('FORBIDDEN' as const) : ('UNAUTHENTICATED' as const) });

export async function saveBusinessHours(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await saveBusinessHoursCore(userId, businessId, raw));
}
export async function addClosure(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await addClosureCore(userId, businessId, raw));
}
export async function removeClosure(closureId: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await removeClosureCore(userId, businessId, closureId));
}
