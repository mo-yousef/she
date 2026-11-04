/**
 * Photo cores (task 6.7 part 2, req 5.1 / 9). Server-only. `app/actions/photos.ts` holds the thin
 * 'use server' wrappers; everything here takes explicit inputs so Playwright can call it.
 * Every core starts with `assertOwnsBusiness`; photo ids are always looked up WITHIN the owner's
 * business (a foreign id is NOT_FOUND, never an error that reveals it exists).
 *
 *  - Order is dense (0..n-1) and rewritten under the Business row lock, the same lock `add` takes
 *    for the quota check, so parallel adds can never exceed MAX_PHOTOS.
 *  - Cover = first photo by sortOrder (no column). "Set as cover" = move to position 0.
 *  - The URL comes from the browser, so it is re-checked by `isTrustedPhotoUrl`; client-reported
 *    format/bytes are advisory (the real size/format gate is Cloudinary's, see docs/decisions.md).
 *  - Audit meta is ids + field names only (never URLs, alt text or public ids).
 *  - shortcut: deleting a photo does not delete the Cloudinary asset (see docs/shortcuts.md).
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { cloudinaryConfig, signCloudinaryParams, type CloudinaryConfig } from './cloudinary';
import { assertOwnsBusiness, ownerAuthCode, type OwnedBusiness, type OwnerAuthCode } from './owner-auth';
import {
  ALLOWED_PHOTO_FORMATS,
  addPhotoSchema,
  hasPhotoSlot,
  isTrustedPhotoUrl,
  moveToFront,
  parseAlt,
  photoFieldErrors,
  type PhotoFieldErrors,
} from './photos-schema';
import { moveWithinCategory } from './services-schema';

/** Non-blocking: the listing is PENDING/PUBLISHED but now has no photo. */
export type PhotoWarning = 'NO_PHOTOS';

type Fail = {
  ok: false;
  code: OwnerAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'QUOTA_EXCEEDED' | 'NOT_CONFIGURED' | 'UNKNOWN';
  errors?: PhotoFieldErrors;
};
export type PhotoResult<T = object> = ({ ok: true; businessId: string; slug: string; warnings: PhotoWarning[] } & T) | Fail;
const fail = (code: Fail['code'], extra: Omit<Fail, 'ok' | 'code'> = {}): Fail => ({ ok: false, code, ...extra });
type Tx = Prisma.TransactionClient;

async function run<T>(userId: string | null | undefined, businessId: string, fn: (o: OwnedBusiness) => Promise<PhotoResult<T>>): Promise<PhotoResult<T>> {
  let owned: OwnedBusiness;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  try {
    return await fn(owned);
  } catch (e) {
    console.error('photos failed', e instanceof Error ? e.name : 'unknown'); // name only: no PII
    return fail('UNKNOWN');
  }
}

const lockBusiness = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${id} FOR UPDATE`;
const done = (o: OwnedBusiness, warnings: PhotoWarning[] = []) => ({ ok: true as const, businessId: o.business.id, slug: o.business.slug, warnings });
const listOrdered = (tx: Tx, businessId: string) =>
  tx.photo.findMany({ where: { businessId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, sortOrder: true } });

/** Rewrite sortOrder to 0..n-1 following `order`; touches only rows whose position changed. */
async function writeOrder(tx: Tx, list: Array<{ id: string; sortOrder: number }>, order: string[]) {
  const was = new Map(list.map((p) => [p.id, p.sortOrder]));
  for (const [i, id] of order.entries()) if (was.get(id) !== i) await tx.photo.update({ where: { id }, data: { sortOrder: i } });
}

// ---- upload signature ------------------------------------------------------------------

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  allowedFormats: string;
  signature: string;
}

/** Signs a one-photo upload into `she/<businessId>`. Never returns the secret. */
export async function createUploadSignatureCore(
  userId: string | null | undefined,
  businessId: string,
  cfg: CloudinaryConfig | null = cloudinaryConfig(),
  now: Date = new Date(),
): Promise<PhotoResult<{ upload: UploadSignature }>> {
  return run(userId, businessId, async (o) => {
    if (!cfg) return fail('NOT_CONFIGURED');
    // Pre-check only; the authoritative quota check is in addPhotoCore under the lock.
    if (!hasPhotoSlot(await db.photo.count({ where: { businessId: o.business.id } }))) return fail('QUOTA_EXCEEDED');
    const folder = `she/${o.business.id}`;
    const allowedFormats = ALLOWED_PHOTO_FORMATS.join(',');
    const timestamp = Math.floor(now.getTime() / 1000);
    const signature = signCloudinaryParams({ allowed_formats: allowedFormats, folder, timestamp }, cfg.apiSecret);
    return { ...done(o), upload: { cloudName: cfg.cloudName, apiKey: cfg.apiKey, timestamp, folder, allowedFormats, signature } };
  });
}

// ---- add -------------------------------------------------------------------------------

export async function addPhotoCore(
  userId: string | null | undefined,
  businessId: string,
  raw: unknown,
  cloudName: string | undefined = process.env.CLOUDINARY_CLOUD_NAME,
): Promise<PhotoResult<{ photoId: string }>> {
  return run(userId, businessId, async (o) => {
    if (!cloudName) return fail('NOT_CONFIGURED');
    const parsed = addPhotoSchema.safeParse(raw);
    if (!parsed.success) return fail('VALIDATION', { errors: photoFieldErrors(parsed.error) });
    const { url } = parsed.data;
    if (!isTrustedPhotoUrl(url, cloudName, o.business.id)) return fail('VALIDATION', { errors: { url: 'urlInvalid' } });
    const out = await db.$transaction(async (tx) => {
      await lockBusiness(tx, o.business.id); // serialises the quota check and sortOrder allocation
      const [count, max, dup] = await Promise.all([
        tx.photo.count({ where: { businessId: o.business.id } }),
        tx.photo.aggregate({ where: { businessId: o.business.id }, _max: { sortOrder: true } }),
        tx.photo.findFirst({ where: { businessId: o.business.id, url }, select: { id: true } }),
      ]);
      if (!hasPhotoSlot(count)) return 'QUOTA' as const;
      if (dup) return 'DUPLICATE' as const;
      const photo = await tx.photo.create({ data: { businessId: o.business.id, url, sortOrder: (max._max.sortOrder ?? -1) + 1 }, select: { id: true } });
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'photo.add', meta: { photoId: photo.id } }, tx);
      return photo.id;
    });
    if (out === 'QUOTA') return fail('QUOTA_EXCEEDED');
    if (out === 'DUPLICATE') return fail('VALIDATION', { errors: { url: 'duplicate' } });
    return { ...done(o), photoId: out };
  });
}

// ---- alt text --------------------------------------------------------------------------

export async function updatePhotoAltCore(userId: string | null | undefined, businessId: string, photoId: string, rawAlt: unknown): Promise<PhotoResult<{ photoId: string }>> {
  return run(userId, businessId, async (o) => {
    const parsed = parseAlt(rawAlt);
    if (!parsed.ok) return fail('VALIDATION', { errors: parsed.errors });
    const out = await db.$transaction(async (tx) => {
      const photo = await tx.photo.findFirst({ where: { id: photoId, businessId: o.business.id }, select: { id: true, alt: true } });
      if (!photo) return false;
      if (photo.alt !== parsed.alt) {
        await tx.photo.update({ where: { id: photo.id }, data: { alt: parsed.alt } });
        await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'photo.alt', meta: { photoId: photo.id, fields: ['alt'] } }, tx);
      }
      return true;
    });
    return out ? { ...done(o), photoId } : fail('NOT_FOUND');
  });
}

// ---- reorder / cover -------------------------------------------------------------------

/** Shared body of move + cover: lock, compute the new order, write it densely, audit if it changed. */
async function reorder(
  o: OwnedBusiness,
  photoId: string,
  compute: (list: Array<{ id: string }>) => string[] | null,
  audit: { action: string; meta: Record<string, string> },
): Promise<PhotoResult<{ photoId: string; moved: boolean }>> {
  const out = await db.$transaction(async (tx) => {
    await lockBusiness(tx, o.business.id);
    const list = await listOrdered(tx, o.business.id);
    if (!list.some((p) => p.id === photoId)) return 'NOT_FOUND' as const;
    const next = compute(list);
    await writeOrder(tx, list, next ?? list.map((p) => p.id)); // also heals any non-dense order
    if (next) await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: audit.action, meta: { photoId, ...audit.meta } }, tx);
    return next !== null;
  });
  return out === 'NOT_FOUND' ? fail('NOT_FOUND') : { ...done(o), photoId, moved: out };
}

export async function movePhotoCore(userId: string | null | undefined, businessId: string, photoId: string, dir: 'up' | 'down') {
  return run(userId, businessId, async (o) => {
    if (dir !== 'up' && dir !== 'down') return fail('VALIDATION');
    // One flat list: reuse the services helper with a constant category.
    return reorder(o, photoId, (list) => moveWithinCategory(list.map((p) => ({ id: p.id, category: '' })), photoId, dir), { action: 'photo.move', meta: { direction: dir } });
  });
}

export async function setCoverCore(userId: string | null | undefined, businessId: string, photoId: string) {
  return run(userId, businessId, (o) => reorder(o, photoId, (list) => moveToFront(list.map((p) => p.id), photoId), { action: 'photo.cover', meta: {} }));
}

// ---- delete ----------------------------------------------------------------------------

export async function deletePhotoCore(userId: string | null | undefined, businessId: string, photoId: string): Promise<PhotoResult> {
  return run(userId, businessId, async (o) => {
    const remaining = await db.$transaction(async (tx) => {
      await lockBusiness(tx, o.business.id);
      const list = await listOrdered(tx, o.business.id);
      if (!list.some((p) => p.id === photoId)) return null;
      await tx.photo.delete({ where: { id: photoId } });
      const rest = list.filter((p) => p.id !== photoId);
      await writeOrder(tx, list, rest.map((p) => p.id));
      await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'photo.delete', meta: { photoId } }, tx);
      return rest.length;
    });
    if (remaining === null) return fail('NOT_FOUND');
    const live = o.business.status === 'PENDING' || o.business.status === 'PUBLISHED';
    return done(o, live && remaining === 0 ? ['NO_PHOTOS'] : []);
  });
}

// ---- page loader -----------------------------------------------------------------------

export async function loadPhotosForDashboard(businessId: string) {
  return db.photo.findMany({
    where: { businessId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, url: true, alt: true },
  });
}
