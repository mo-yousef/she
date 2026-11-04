/**
 * Localized OTP message body (booking's locale). Server-only; no request context, same
 * createTranslator approach as lib/notify/templates/content.ts. Kept in its own module
 * so the DB logic in review-verification.ts does not import the message JSON files.
 */
import { createTranslator } from 'next-intl';
import el from '../messages/el.json';
import en from '../messages/en.json';
import ru from '../messages/ru.json';
import { OTP_EXPIRY_MS } from './review-otp';

const MESSAGES = { en, el, ru } as const;

export function otpMessageBody(locale: string, business: string, code: string): string {
  const l = locale === 'el' || locale === 'ru' ? locale : 'en';
  const t = createTranslator({
    locale: l,
    messages: MESSAGES[l],
    namespace: 'review',
    onError: (e) => {
      throw e;
    },
  }) as unknown as (key: string, values: Record<string, string | number>) => string;
  return t('otpMessage', { business, code, minutes: OTP_EXPIRY_MS / 60_000 });
}
