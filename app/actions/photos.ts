'use server';
/**
 * Thin server-action wrappers for the profile photos (task 6.7 part 2). Rules live in
 * lib/photos.ts; these resolve the session, derive the business from the owner (never from
 * client input), call the core and revalidate the public page + dashboard.
 */
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import {
  addPhotoCore,
  createUploadSignatureCore,
  deletePhotoCore,
  movePhotoCore,
  setCoverCore,
  updatePhotoAltCore,
  type PhotoResult,
} from '@/lib/photos';
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';

async function scope(): Promise<{ userId: string | null; businessId: string | null }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, businessId: userId ? await findOwnerBusinessId(userId) : null };
}

function after<T>(result: PhotoResult<T>): PhotoResult<T> {
  if (result.ok) {
    // 'overview' = publish checklist.
    revalidateAfterOwnerEdit({ business: { id: result.businessId, slug: result.slug }, surfaces: ['public', 'profile', 'overview'] });
  }
  return result;
}

const denied = (userId: string | null) => ({ ok: false as const, code: userId ? ('FORBIDDEN' as const) : ('UNAUTHENTICATED' as const) });

/** No revalidation: signing changes nothing. The response never contains the API secret. */
export async function createUploadSignature() {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return createUploadSignatureCore(userId, businessId);
}

export async function addPhoto(raw: unknown) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await addPhotoCore(userId, businessId, raw));
}

export async function updatePhotoAlt(photoId: string, alt: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await updatePhotoAltCore(userId, businessId, photoId, alt));
}

export async function movePhoto(photoId: string, dir: 'up' | 'down') {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await movePhotoCore(userId, businessId, photoId, dir));
}

export async function setCover(photoId: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await setCoverCore(userId, businessId, photoId));
}

export async function deletePhoto(photoId: string) {
  const { userId, businessId } = await scope();
  if (!businessId) return denied(userId);
  return after(await deletePhotoCore(userId, businessId, photoId));
}
