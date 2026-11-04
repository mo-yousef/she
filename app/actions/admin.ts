'use server';
/**
 * Thin wrappers for the admin area (task 7.1). Rules live in lib/admin.ts; these resolve the session,
 * call the core with explicit inputs and revalidate after success.
 */
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { adminBusinessCore, adminReviewCore, adminSetRoleCore } from '@/lib/admin';
import { routing } from '@/i18n/routing';
import { revalidateBusinessPublic } from '@/lib/revalidate-public';
import type { BusinessAction, ReviewAction } from '@/lib/admin-params';
const uid = async () => (await auth())?.user?.id ?? null;
function refreshAdmin() {
  for (const l of routing.locales) revalidatePath(`/${l}/admin`, 'layout');
}
export async function adminBusinessAction(businessId: string, action: BusinessAction) {
  const res = await adminBusinessCore(await uid(), businessId, action);
  if (res.ok) {
    revalidateBusinessPublic({ id: res.businessId, slug: res.slug });
    refreshAdmin();
  }
  return res;
}
export async function adminReviewAction(reviewId: string, action: ReviewAction) {
  const res = await adminReviewCore(await uid(), reviewId, action);
  if (res.ok) {
    revalidateBusinessPublic({ id: res.businessId, slug: res.slug });
    refreshAdmin();
  }
  return res;
}
export async function adminRoleAction(targetId: string, makeAdmin: boolean) {
  const res = await adminSetRoleCore(await uid(), targetId, makeAdmin);
  if (res.ok) refreshAdmin();
  return res;
}
