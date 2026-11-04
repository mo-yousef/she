'use server';
/**
 * Thin server-action wrappers for team CRUD (task 6.5). Rules live in lib/team.ts; these
 * resolve the session, derive the business from the owner (never from client input), call
 * the core and revalidate the public page + dashboard.
 */
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';
import {
  addDayOffCore,
  createStaffCore,
  deleteStaffCore,
  moveStaffCore,
  removeDayOffCore,
  setStaffActiveCore,
  updateStaffCore,
  type TeamResult,
} from '@/lib/team';

async function scope(): Promise<{ userId: string | null; businessId: string | null }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, businessId: userId ? await findOwnerBusinessId(userId) : null };
}

function after<T>(result: TeamResult<T>): TeamResult<T> {
  if (result.ok) {
    // Staff names/eligibility show in the booking tools too.
    revalidateAfterOwnerEdit({ business: { id: result.businessId, slug: result.slug }, surfaces: ['public', 'team', 'calendar', 'bookings', 'services'] });
  }
  return result;
}

const denied = (userId: string | null) => ({ ok: false as const, code: userId ? ('FORBIDDEN' as const) : ('UNAUTHENTICATED' as const) });

export async function createStaff(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await createStaffCore(userId, businessId, raw));
}

export async function updateStaff(staffId: string, raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await updateStaffCore(userId, businessId, staffId, raw));
}

export async function setStaffActive(staffId: string, active: boolean) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await setStaffActiveCore(userId, businessId, staffId, active));
}

export async function moveStaff(staffId: string, dir: 'up' | 'down') {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await moveStaffCore(userId, businessId, staffId, dir));
}

export async function deleteStaff(staffId: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await deleteStaffCore(userId, businessId, staffId));
}

export async function addDayOff(staffId: string, raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await addDayOffCore(userId, businessId, staffId, raw));
}

export async function removeDayOff(dayOffId: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await removeDayOffCore(userId, businessId, dayOffId));
}
