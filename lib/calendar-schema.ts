/**
 * Zod schemas for the dashboard calendar forms (task 6.2). Pure: shared by the client forms
 * (inline validation) and the server cores (the source of truth). Issue codes are i18n key
 * suffixes (calendar.validation.<code>), never display text.
 */
import { z } from 'zod';
import { normalisePhone } from './booking-schema';
import { isDateKey } from './calendar-params';

const E164 = /^\+[1-9]\d{7,14}$/;

export const manualBookingInputSchema = z.object({
  serviceId: z.string().min(1, 'required').max(40, 'required'),
  staffId: z.string().min(1, 'required').max(40, 'required'),
  /** Local (Europe/Nicosia) wall-clock date and time; converted to UTC on the server. */
  date: z.string().refine(isDateKey, 'invalidDate'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalidTime'),
  /** Language of the customer's confirmation email. */
  locale: z.enum(['en', 'el', 'ru']).default('en'),
  name: z.string().trim().min(2, 'nameRequired').max(80, 'nameRequired'),
  phone: z
    .string()
    .trim()
    .max(40, 'phoneInvalid')
    .optional()
    .transform((v) => (v ? normalisePhone(v) : undefined))
    .refine((v) => v === undefined || E164.test(v), 'phoneInvalid'),
  // Empty string means "no email" (not a union: a union would hide the 'emailInvalid' code).
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .toLowerCase()
      .email('emailInvalid')
      .max(254, 'emailInvalid')
      .optional(),
  ),
  note: z
    .string()
    .trim()
    .max(500, 'noteTooLong')
    .optional()
    .transform((v) => v || undefined),
  status: z.enum(['PENDING', 'CONFIRMED']).default('CONFIRMED'),
  priceCents: z
    .number()
    .int('priceInvalid')
    .min(0, 'priceInvalid')
    .max(1_000_000, 'priceInvalid')
    .optional(),
  sendConfirmation: z.boolean().default(true),
  /** A fresh nonce per form mount (client-generated) makes a double submit safe. */
  idempotencyKey: z.string().min(8).max(64).optional(),
});
export type ManualBookingInput = z.infer<typeof manualBookingInputSchema>;

export const createBlockInputSchema = z.object({
  /** One staff id, or 'all' for every active staff member. */
  staffId: z.string().min(1, 'required').max(40, 'required'),
  dateKey: z.string().refine(isDateKey, 'invalidDate'),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
  reason: z
    .string()
    .trim()
    .max(120, 'reasonTooLong')
    .optional()
    .transform((v) => v || undefined),
  recurrence: z.enum(['none', 'daily', 'weekly']).default('none'),
  untilKey: z.string().refine(isDateKey, 'invalidDate').optional(),
});
export type CreateBlockInput = z.input<typeof createBlockInputSchema>;
