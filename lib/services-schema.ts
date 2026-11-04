/**
 * Service CRUD input schema + pure rules (task 6.4, req 5.1). No DB / Next imports so it
 * is unit-testable and shared by the server core and the client form.
 *
 * Decisions (docs/decisions.md):
 *  - duration 5..480 in steps of 5 (matches onboarding's input constraints), buffer 0..120.
 *  - price 0..€5,000.00; a FREE service (0) is allowed (consultations, add-ons).
 *  - a VISIBLE service needs >= 1 eligible staff (`staffRequired`); a HIDDEN one may have none.
 * Messages are i18n key suffixes under `services.validation.*`.
 */
import { z } from 'zod';
import { CATEGORIES } from './catalogue';
import { parseEuroToCents } from './money';

export const SERVICE_LOCALES = ['el', 'ru'] as const; // en = the base fields
export const MAX_PRICE_CENTS = 500_000;
/** Bookings in these statuses that end in the future block deleting a service. */
export const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/** "25", "25.5", "25,50" and also "0" -> cents (null when invalid / above the cap). */
export function parseServicePrice(raw: string): number | null {
  const s = raw.trim();
  if (/^0{1,5}(?:[.,]0{1,2})?$/.test(s)) return 0;
  const cents = parseEuroToCents(s);
  return cents !== null && cents <= MAX_PRICE_CENTS ? cents : null;
}

const optText = (max: number, code: string) =>
  z
    .string()
    .trim()
    .max(max, code)
    .optional()
    .transform((v) => v || undefined);

const translation = z
  .object({ name: optText(80, 'translationNameTooLong'), description: optText(500, 'descriptionTooLong') })
  .optional();

export const serviceInputSchema = z
  .object({
    name: z.string().trim().min(2, 'nameRequired').max(80, 'nameRequired'),
    category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'categoryRequired' }) }),
    description: optText(500, 'descriptionTooLong'),
    durationMin: z.coerce
      .number({ invalid_type_error: 'durationInvalid' })
      .int('durationInvalid')
      .min(5, 'durationInvalid')
      .max(480, 'durationInvalid')
      .refine((n) => n % 5 === 0, 'durationInvalid'),
    bufferMin: z.coerce.number({ invalid_type_error: 'bufferInvalid' }).int('bufferInvalid').min(0, 'bufferInvalid').max(120, 'bufferInvalid'),
    price: z
      .string({ required_error: 'priceInvalid', invalid_type_error: 'priceInvalid' })
      .transform((v, ctx) => {
        const cents = parseServicePrice(v);
        if (cents === null) {
          ctx.addIssue({ code: 'custom', message: 'priceInvalid' });
          return z.NEVER;
        }
        return cents;
      }),
    active: z.boolean({ invalid_type_error: 'invalid' }),
    staffIds: z
      .array(z.string().min(1).max(64))
      .max(100)
      .transform((ids) => [...new Set(ids)]),
    translations: z.object({ el: translation, ru: translation }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.active && v.staffIds.length === 0) ctx.addIssue({ code: 'custom', path: ['staffIds'], message: 'staffRequired' });
  });

export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type FieldErrors = Record<string, string>;

/** First issue per field; nested paths are dotted (`translations.el.name`). */
export function serviceFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}

export type DeleteDecision = 'REFUSE' | 'ARCHIVE' | 'DELETE';

/**
 * Booking.serviceId is ON DELETE RESTRICT, so any booking row (even history) makes a hard
 * delete impossible: future active bookings refuse, history-only archives (hides), none deletes.
 */
export function decideDelete(c: { activeFutureCount: number; anyBookingCount: number }): DeleteDecision {
  if (c.activeFutureCount > 0) return 'REFUSE';
  return c.anyBookingCount > 0 ? 'ARCHIVE' : 'DELETE';
}

/**
 * Move one service up/down among services of the SAME category (the public page and the
 * dashboard group by category). Returns the full new id order, or null when it is already
 * first/last in its category.
 */
export function moveWithinCategory(
  items: ReadonlyArray<{ id: string; category: string }>,
  id: string,
  dir: 'up' | 'down',
): string[] | null {
  const i = items.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const step = dir === 'up' ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < items.length && items[j]!.category !== items[i]!.category) j += step;
  if (j < 0 || j >= items.length) return null;
  const ids = items.map((s) => s.id);
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}
