/**
 * Onboarding wizard input schemas (task 6.1), shared by the server cores and any client
 * checks. Messages are i18n KEY SUFFIXES under `onboarding.validation.*`, never display text.
 * Forms post plain strings, so every schema takes strings and normalises them.
 */
import { z } from 'zod';
import { normalisePhone } from './booking-schema';
import { parseTimeOfDay, validateWeek, type DayHours, type HoursError } from './hours';
import { parseEuroToCents } from './money';
import { CATEGORIES, CITIES } from './catalogue';

export const LANGUAGES = ['en', 'el', 'ru'] as const;
const E164 = /^\+[1-9]\d{7,14}$/;

/** "" -> undefined, otherwise trimmed. */
const text = (max: number, code: string) =>
  z
    .string()
    .trim()
    .max(max, code)
    .optional()
    .transform((v) => v || undefined);

const phone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? normalisePhone(v) : undefined))
  .pipe(z.string().regex(E164, 'phoneInvalid').optional());

const instagram = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '') : undefined))
  .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, 'instagramInvalid').optional());

const website = z
  .string()
  .trim()
  .max(200, 'websiteInvalid')
  .optional()
  .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
  .pipe(
    z
      .string()
      .refine((v) => {
        try {
          const u = new URL(v);
          return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
        } catch {
          return false;
        }
      }, 'websiteInvalid')
      .optional(),
  );

/** Optional decimal degrees. "" -> undefined; "34,7" tolerated. */
const coord = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(',', '.')) : undefined))
    .pipe(z.number().finite().min(min, 'coordInvalid').max(max, 'coordInvalid').optional());

export const basicsSchema = z.object({
  name: z.string().trim().min(2, 'nameRequired').max(80, 'nameRequired'),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'categoryRequired' }) }),
  city: z.enum(CITIES, { errorMap: () => ({ message: 'cityRequired' }) }),
  languages: z.array(z.enum(LANGUAGES)).min(1, 'languagesRequired'),
  tagline: text(120, 'taglineTooLong'),
  about: text(2000, 'aboutTooLong'),
});

export const locationSchema = z
  .object({
    address: z.string().trim().min(3, 'addressRequired').max(200, 'addressRequired'),
    phone,
    whatsapp: phone,
    instagram,
    website,
    // Cyprus sits roughly at 34.5-35.7 N, 32.2-34.7 E; a loose box catches swapped/typo'd values.
    lat: coord(34, 36),
    lng: coord(32, 35),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { path: ['lng'], message: 'coordPair' });

export const firstServiceSchema = z.object({
  serviceName: z.string().trim().min(2, 'serviceNameRequired').max(80, 'serviceNameRequired'),
  serviceCategory: z.enum(CATEGORIES, { errorMap: () => ({ message: 'categoryRequired' }) }),
  durationMin: z.coerce.number({ invalid_type_error: 'durationInvalid' }).int('durationInvalid').min(5, 'durationInvalid').max(480, 'durationInvalid'),
  price: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const cents = parseEuroToCents(v);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'priceInvalid' });
        return z.NEVER;
      }
      return cents;
    }),
  staffName: z.string().trim().min(2, 'staffNameRequired').max(60, 'staffNameRequired'),
});

export type FieldErrors = Record<string, string>;

export interface StepState {
  /** Error code (`onboarding.error.*`) or null before the first submit. */
  code: string | null;
  errors: FieldErrors;
  /** What the user typed, so the form never clears their input on error. */
  values: Record<string, unknown>;
}

export const initialStepState: StepState = { code: null, errors: {}, values: {} };

/** First issue per field, keyed by the field name ("form" for whole-form issues). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** FormData -> plain object. Repeated keys (checkbox groups) become arrays under `multi`. */
export function formToObject(fd: FormData, multi: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith('$ACTION')) continue; // React/Next internal fields
    out[key] = multi.includes(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? '');
  }
  for (const key of multi) out[key] ??= [];
  return out;
}

/**
 * Hours form fields: `closed-<weekday>` (checkbox, "on" when closed), `open-<weekday>`,
 * `close-<weekday>` as HH:MM. Returns the validated week or per-weekday error codes.
 */
export function parseHoursForm(
  raw: Record<string, unknown>,
): { ok: true; days: DayHours[] } | { ok: false; errors: HoursError[] } {
  const days: DayHours[] = [];
  const errors: HoursError[] = [];
  for (let weekday = 0; weekday <= 6; weekday++) {
    const closed = raw[`closed-${weekday}`] === 'on';
    const opens = parseTimeOfDay(String(raw[`open-${weekday}`] ?? ''));
    const closes = parseTimeOfDay(String(raw[`close-${weekday}`] ?? ''));
    if (!closed && (opens === null || closes === null)) {
      errors.push({ weekday, code: 'range' });
      continue;
    }
    days.push({ weekday, closed, opensMin: opens ?? 0, closesMin: closes ?? 0 });
  }
  if (errors.length) return { ok: false, errors };
  return validateWeek(days);
}
