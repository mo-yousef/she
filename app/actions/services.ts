'use server';

/**
 * Thin server-action wrappers for services CRUD (task 6.4). Rules live in lib/services.ts;
 * these resolve the session, derive the business from the owner (never from client input),
 * call the core and revalidate the public page + dashboard.
 */
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';
import {
  createServiceCore,
  deleteServiceCore,
  moveServiceCore,
  setServiceActiveCore,
  updateServiceCore,
  type ServiceResult,
} from '@/lib/services';

async function scope(): Promise<{ userId: string | null; businessId: string | null }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, businessId: userId ? await findOwnerBusinessId(userId) : null };
}

function after<T>(result: ServiceResult<T>): ServiceResult<T> {
  if (result.ok) {
    // Service names/visibility show in the booking tools too.
    revalidateAfterOwnerEdit({ business: { id: result.businessId, slug: result.slug }, surfaces: ['public', 'services', 'calendar', 'bookings'] });
  }
  return result;
}

const denied = (userId: string | null) => ({ ok: false as const, code: userId ? ('FORBIDDEN' as const) : ('UNAUTHENTICATED' as const) });

export async function createService(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await createServiceCore(userId, businessId, raw));
}

export async function updateService(serviceId: string, raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await updateServiceCore(userId, businessId, serviceId, raw));
}

export async function setServiceActive(serviceId: string, active: boolean) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await setServiceActiveCore(userId, businessId, serviceId, active));
}

export async function moveService(serviceId: string, dir: 'up' | 'down') {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await moveServiceCore(userId, businessId, serviceId, dir));
}

export async function deleteService(serviceId: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await deleteServiceCore(userId, businessId, serviceId));
}
