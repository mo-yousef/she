/** Money is stored as integer cents, EUR. Format per locale with Intl. */

const LOCALE_MAP: Record<string, string> = {
  en: 'en-GB',
  el: 'el-GR',
  ru: 'ru-RU',
};

export function formatPrice(cents: number, locale: string = 'en', currency = 'EUR'): string {
  const intlLocale = LOCALE_MAP[locale] ?? 'en-GB';
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Decimal euro input -> integer cents ("25", "25.5", "25,50" -> 2500, 2550, 2550).
 * Returns null for empty, negative, zero, more than 2 decimals, or above €10,000.
 */
export function parseEuroToCents(raw: string): number | null {
  const m = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return cents > 0 && cents <= 1_000_000 ? cents : null;
}

/** Integer cents -> plain decimal for an input value ("2550" -> "25.50", 2500 -> "25"). */
export function centsToInputValue(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** "from €X" helper — lowest active service price for a business. */
export function fromPrice(cents: number, locale: string = 'en', currency = 'EUR'): string {
  return formatPrice(cents, locale, currency);
}
