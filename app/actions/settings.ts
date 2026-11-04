'use server';
/**
 * Thin wrappers for Settings (task 6.8). Rules live in lib/settings-save.ts; these resolve the session,
 * derive the business from the owner (never from client input), call the core and revalidate.
 */
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';
import { saveSettingsCore, unpublishCore, type SettingsResult } from '@/lib/settings-save';

async function scope(): Promise<{ userId: string | null; businessId: string | null }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, businessId: userId ? await findOwnerBusinessId(userId) : null };
}
function after<T>(result: SettingsResult<T>): SettingsResult<T> {
  if (result.ok) {
    // Slot interval / lead / advance change what is bookable; unpublish stops the public page.
    revalidateAfterOwnerEdit({ business: { id: result.businessId, slug: result.slug }, surfaces: ['public', 'settings', 'overview'] });
  }
  return result;
}
const denied = (userId: string | null) => ({ ok: false as const, code: userId ? ('FORBIDDEN' as const) : ('UNAUTHENTICATED' as const) });

export async function saveSettings(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await saveSettingsCore(userId, businessId, raw));
}
export async function unpublishListing() {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await unpublishCore(userId, businessId));
}
