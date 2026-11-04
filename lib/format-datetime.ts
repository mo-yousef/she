import { BUSINESS_TZ } from './time';

const LOCALE_MAP: Record<string, string> = {
  en: 'en-GB',
  el: 'el-GR',
  ru: 'ru-RU',
};

function intlLocale(locale: string): string {
  return LOCALE_MAP[locale] ?? 'en-GB';
}

/** Short, friendly date+time in the business timezone, e.g. "Fri 7 Nov, 14:30". */
export function formatSlot(iso: string, locale: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
  }).format(date);
}

/** Time only, e.g. "14:30". */
export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}

/** Full date, e.g. "Friday, 7 November 2026". */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}
