/**
 * Owner-provided service translations (req 8): the base fields are the default language
 * (en); a translation row overrides name/description per field for its locale, and an empty
 * or missing field falls back to the base. Pure.
 */
export interface ServiceTextRow {
  locale: string;
  name: string | null;
  description: string | null;
}

export function localizedService(
  service: { name: string; description: string | null },
  translations: readonly ServiceTextRow[] | undefined,
  locale: string,
): { name: string; description: string | null } {
  const row = translations?.find((t) => t.locale === locale);
  return {
    name: row?.name?.trim() || service.name,
    description: row?.description?.trim() || service.description,
  };
}
