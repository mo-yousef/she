/**
 * Photo rules shared by the server cores and the dashboard UI (task 6.7 part 2, req 5.1 / 9).
 * Pure: no Node or DB imports, so client components can import the constants.
 *
 * "Cover" is NOT a column: the cover is the FIRST photo by sortOrder (public page, search cards
 * and favourites all read `photos[0]`). "Set as cover" therefore means "move to position 0".
 */
import { z } from 'zod';

export const MAX_PHOTOS = 12;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const;
/** Browser-side pre-check and the file input's `accept`. No svg (script risk) and no gif. */
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_ALT_LENGTH = 160;
const MAX_URL_LENGTH = 300;

export type PhotoFieldErrors = Record<string, string>;

/** Quota helper: true while one more photo fits. */
export const hasPhotoSlot = (count: number) => count < MAX_PHOTOS;

/** Move `id` to position 0 keeping everyone else's relative order. Null if unknown or already first. */
export function moveToFront(ids: readonly string[], id: string): string[] | null {
  const i = ids.indexOf(id);
  if (i <= 0) return null;
  return [id, ...ids.filter((x) => x !== id)];
}

/** Alt text: control characters removed, trimmed. Empty is allowed (the UI nudges, never blocks). */
export function parseAlt(raw: unknown): { ok: true; alt: string } | { ok: false; errors: PhotoFieldErrors } {
  if (typeof raw !== 'string') return { ok: false, errors: { alt: 'altInvalid' } };
  const alt = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (alt.length > MAX_ALT_LENGTH) return { ok: false, errors: { alt: 'altTooLong' } };
  return { ok: true, alt };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The server never trusts a URL from the browser. Accepts ONLY:
 *   https://res.cloudinary.com/<OUR cloud>/image/upload/[<one transformation or v123>/]she/<THIS business>/<file>.<jpg|jpeg|png|webp>
 * The raw string is matched against a strict pattern (no userinfo, port, query, fragment,
 * backslash, percent-encoding, dots in directories, so no `..` traversal), then re-parsed with
 * `URL` as a second line so any parser disagreement fails closed.
 */
export function isTrustedPhotoUrl(url: unknown, cloudName: string | undefined, businessId: string): boolean {
  if (typeof url !== 'string' || !cloudName || !businessId || url.length > MAX_URL_LENGTH) return false;
  const re = new RegExp(
    `^https://res\\.cloudinary\\.com/${escapeRe(cloudName)}/image/upload/(?:[A-Za-z0-9_,:-]+/)?she/${escapeRe(businessId)}/[A-Za-z0-9_-]+\\.(?:${ALLOWED_PHOTO_FORMATS.join('|')})$`,
  );
  if (!re.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.port && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/**
 * What the browser reports after a Cloudinary upload. `format` and `bytes` are advisory (a
 * hostile client can lie); the real gates are Cloudinary's allowed formats and max file size.
 */
const formatSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .refine((s) => (ALLOWED_PHOTO_FORMATS as readonly string[]).includes(s), 'formatNotAllowed');

export const addPhotoSchema = z.object({
  url: z.string().max(MAX_URL_LENGTH, 'urlInvalid'),
  publicId: z.string().max(200).optional(),
  format: formatSchema,
  bytes: z.number().int().positive('bytesInvalid').max(MAX_PHOTO_BYTES, 'tooLarge'),
});

export function photoFieldErrors(error: z.ZodError): PhotoFieldErrors {
  const out: PhotoFieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.code === 'invalid_type' ? `${key}Invalid` : issue.message;
  }
  return out;
}
