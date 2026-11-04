/**
 * Shared (client + server) booking input schemas, requirement 3.1.
 * Error messages are i18n KEY SUFFIXES (booking.validation.<code>), never
 * display text, so the UI can translate them and the server can reuse them.
 */
import { z } from 'zod';

export const DEFAULT_COUNTRY_CODE = '+357';
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Best-effort normalisation toward E.164: strips spaces/dashes/brackets, turns a
 * leading 00 into +, and prefixes the default Cyprus code to a local number.
 * The result is NOT guaranteed valid; the schema checks it with the E.164 regex.
 */
export function normalisePhone(raw: string): string {
  const s = raw.trim().replace(/[\s().-]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  // "35799123456": country code typed without the plus (8-digit Cyprus numbers).
  if (/^357\d{8}$/.test(s)) return `+${s}`;
  return `${DEFAULT_COUNTRY_CODE}${s}`;
}

export const detailsSchema = z.object({
  name: z.string().trim().min(2, 'nameRequired').max(80, 'nameRequired'),
  email: z.string().trim().toLowerCase().email('emailInvalid').max(254, 'emailInvalid'),
  phone: z.string().transform(normalisePhone).pipe(z.string().regex(E164, 'phoneInvalid')),
  note: z
    .string()
    .trim()
    .max(500, 'noteTooLong')
    .optional()
    .transform((v) => v || undefined),
  // Two separate, required consents (terms AND booking messages).
  consentTerms: z.literal(true, { errorMap: () => ({ message: 'consentTerms' }) }),
  consentMessages: z.literal(true, { errorMap: () => ({ message: 'consentMessages' }) }),
});

export type DetailsField = keyof z.input<typeof detailsSchema>;
/** What the form holds while typing (raw strings, unchecked boxes). */
export interface DetailsDraft {
  name: string;
  email: string;
  phone: string;
  note: string;
  consentTerms: boolean;
  consentMessages: boolean;
}
export type DetailsErrors = Partial<Record<DetailsField, string>>;

export function validateDetails(draft: DetailsDraft):
  | { ok: true; data: z.output<typeof detailsSchema> }
  | { ok: false; errors: DetailsErrors } {
  const r = detailsSchema.safeParse(draft);
  if (r.success) return { ok: true, data: r.data };
  const errors: DetailsErrors = {};
  for (const issue of r.error.issues) {
    const field = issue.path[0] as DetailsField;
    if (!errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/** Inline validation for one field (run on blur). Returns the error code or undefined. */
export function validateDetailsField(field: DetailsField, draft: DetailsDraft): string | undefined {
  const r = detailsSchema.shape[field].safeParse(draft[field]);
  return r.success ? undefined : r.error.issues[0]?.message;
}

export const LOCALES = ['en', 'el', 'ru'] as const;

/** Payload of the createBooking server action (implemented in task 4.3). */
export const bookingInputSchema = z.object({
  businessSlug: z.string().min(1).max(80),
  serviceId: z.string().min(1).max(40),
  /** 'any' = let the server assign via pickStaffForSlot. */
  staffId: z.union([z.literal('any'), z.string().min(1).max(40)]),
  startsAt: z.string().datetime(),
  locale: z.enum(LOCALES),
  /** Generated once per stepper mount so 4.3 can make creation idempotent. */
  idempotencyKey: z.string().min(8).max(64),
  details: detailsSchema,
  /**
   * Turnstile token. Required for guests only; that depends on the session, so it is
   * enforced in the createBooking action, not here.
   */
  turnstileToken: z.string().max(2048).optional(),
});

export type BookingInput = z.input<typeof bookingInputSchema>;
export type ParsedBookingInput = z.output<typeof bookingInputSchema>;

export type CreateBookingResult =
  | { ok: true; reference: string; redirectTo?: string }
  | {
    ok: false;
    code: 'VALIDATION' | 'SLOT_TAKEN' | 'DAILY_LIMIT' | 'RATE_LIMITED' | 'VERIFICATION_FAILED' | 'NOT_IMPLEMENTED' | 'UNKNOWN';
  };
