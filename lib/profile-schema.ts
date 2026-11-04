/**
 * Profile details input (task 6.7). Reuses the onboarding `basicsSchema` / `locationSchema`
 * unchanged (same limits, same normalisation) and adds optional el/ru translations of the
 * tagline and about text (en = the base fields). Pure: shared by the server core and the form.
 * Messages are i18n key suffixes under `onboarding.validation.*` (reused, not duplicated).
 */
import { z } from 'zod';
import { basicsSchema, locationSchema } from './onboarding-schema';

export const PROFILE_TRANSLATION_LOCALES = ['el', 'ru'] as const;
export type ProfileTranslationLocale = (typeof PROFILE_TRANSLATION_LOCALES)[number];

const translationSchema = z.object({
  tagline: basicsSchema.shape.tagline,
  about: basicsSchema.shape.about,
});

export type ProfileFieldErrors = Record<string, string>;

type Basics = z.infer<typeof basicsSchema>;
type Location = z.infer<typeof locationSchema>;
export interface ProfileData {
  basics: Basics;
  location: Location;
  translations: Record<ProfileTranslationLocale, { tagline?: string; about?: string }>;
}

const key = (issue: z.ZodIssue) => issue.path.join('.') || 'form';

/** Validates the flat form object. Field errors are keyed `name`, `lat`, `translations.el.tagline`... */
export function parseProfile(raw: unknown): { ok: true; data: ProfileData } | { ok: false; errors: ProfileFieldErrors } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tr = (obj.translations && typeof obj.translations === 'object' ? obj.translations : {}) as Record<string, unknown>;
  const basics = basicsSchema.safeParse(obj);
  const location = locationSchema.safeParse(obj);
  const translations = z
    .object({ el: translationSchema.default({}), ru: translationSchema.default({}) })
    .safeParse({ el: tr.el ?? {}, ru: tr.ru ?? {} });

  if (basics.success && location.success && translations.success) {
    return { ok: true, data: { basics: basics.data, location: location.data, translations: translations.data } };
  }
  const errors: ProfileFieldErrors = {};
  if (!basics.success) for (const i of basics.error.issues) errors[key(i)] ??= i.message;
  if (!location.success) for (const i of location.error.issues) errors[key(i)] ??= i.message;
  if (!translations.success) for (const i of translations.error.issues) errors[`translations.${key(i)}`] ??= i.message;
  return { ok: false, errors };
}
