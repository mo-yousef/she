/**
 * Booking-rules form schema (task 6.8), shared by the client form and the server core.
 * The WRITE bounds are tighter than the READ schema in `settings.ts` (which must keep
 * parsing any value already stored), and every value written still parses there.
 * Error messages are i18n key suffixes under `settings.validation.*`.
 */
import { z } from 'zod';
import type { BusinessSettings } from './settings';

export const SLOT_INTERVALS = [15, 30, 60] as const;
export const SETTINGS_BOUNDS = {
  bufferMin: { min: 0, max: 120, step: 5 },
  minLeadMin: { min: 0, max: 1440, step: 15 },
  maxAdvanceDays: { min: 1, max: 365, step: 1 },
  cancellationWindowHours: { min: 0, max: 168, step: 1 },
  maxPerCustomerPerDay: { min: 1, max: 10, step: 1 },
} as const;
/** The public date strip shows at most this many days, whatever maxAdvanceDays says. */
export const DATE_STRIP_MAX_DAYS = 60;

const num = (b: { min: number; max: number; step: number }) =>
  z
    .number({ message: 'required' })
    .int('whole')
    .min(b.min, 'range')
    .max(b.max, 'range')
    .refine((n) => (n - b.min) % b.step === 0, 'step');

export const settingsFormSchema = z.object({
  autoConfirm: z.boolean({ message: 'required' }),
  slotIntervalMin: z.union([z.literal(15), z.literal(30), z.literal(60)], { errorMap: () => ({ message: 'choice' }) }),
  bufferMin: num(SETTINGS_BOUNDS.bufferMin),
  minLeadMin: num(SETTINGS_BOUNDS.minLeadMin),
  maxAdvanceDays: num(SETTINGS_BOUNDS.maxAdvanceDays),
  cancellationWindowHours: num(SETTINGS_BOUNDS.cancellationWindowHours),
  maxPerCustomerPerDay: num(SETTINGS_BOUNDS.maxPerCustomerPerDay),
});
export type SettingsForm = z.infer<typeof settingsFormSchema>;

export type SettingsFieldErrors = Partial<Record<keyof SettingsForm, string>>;

export function parseSettingsForm(raw: unknown): { ok: true; data: SettingsForm } | { ok: false; errors: SettingsFieldErrors } {
  const r = settingsFormSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors: SettingsFieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof SettingsForm | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Keys whose value differs (field NAMES for the audit log). */
export function changedSettingKeys(before: BusinessSettings, next: SettingsForm): string[] {
  return (Object.keys(settingsFormSchema.shape) as Array<keyof SettingsForm>).filter((k) => before[k] !== next[k]);
}

/** New stored JSON: unknown keys of the existing object survive; known keys come from the form. */
export function mergeSettings(existing: unknown, next: SettingsForm): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, ...next };
}
