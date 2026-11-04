/**
 * Owner-provided business text translations (req 8): the base tagline/about are the default
 * language (en); a `BusinessTranslation` row overrides each field per locale, and an empty or
 * missing field falls back to the base. Pure. Mirrors `localizedService`.
 */
export interface BusinessTextRow {
  locale: string;
  tagline: string | null;
  about: string | null;
}

export function localizedBusinessText(
  business: { tagline: string | null; about: string | null },
  translations: readonly BusinessTextRow[] | undefined,
  locale: string,
): { tagline: string | null; about: string | null } {
  const row = translations?.find((t) => t.locale === locale);
  return {
    tagline: row?.tagline?.trim() || business.tagline,
    about: row?.about?.trim() || business.about,
  };
}
