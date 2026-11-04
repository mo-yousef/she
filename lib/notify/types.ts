/**
 * Notification plumbing types (task 5.1, requirement 6).
 *
 * Interface choice: two methods, not one `send(message)` union and not three channel
 * methods.
 *   - `sendEmail`  -> one email provider (Resend today).
 *   - `sendPhone`  -> "reach this phone": WhatsApp first, SMS fallback. The fallback is
 *     a delivery policy, so callers (cron, actions) never pick WhatsApp vs SMS.
 * A provider swap (e.g. Twilio -> Vonage) means writing one `PhoneProvider` and changing
 * one line in `index.ts`. The WhatsApp-then-SMS policy lives in `fallback.ts` and is
 * provider-agnostic.
 *
 * `locale` is carried on every message so 5.2 templates can render in the customer's
 * language; adapters do not use it. `template` is a name such as "booking-confirmed";
 * it is the only content identifier that may be logged (never recipients or bodies).
 */

/** Mirrors the Prisma enum `NotificationChannel`. */
export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

export type NotifyLocale = 'en' | 'el' | 'ru';

export type NotifyErrorCode =
  /** Provider says the address/number is unusable. Retrying on another channel will not help. */
  | 'INVALID_RECIPIENT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  /** No credentials (or test env): nothing was sent. */
  | 'NOT_CONFIGURED';

/**
 * Maps directly onto `NotificationLog` (5.4): `channel` = channel actually used,
 * `providerId` = provider message id on success, `status` = ok ? 'SENT' : code.
 */
export type SendResult =
  | { ok: true; channel: NotificationChannel; providerId: string }
  | { ok: false; channel: NotificationChannel; code: NotifyErrorCode };

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  locale: NotifyLocale;
  template: string;
}

export interface PhoneMessage {
  /** E.164, e.g. +35799123456. */
  to: string;
  body: string;
  locale: NotifyLocale;
  template: string;
}

/** One phone-capable provider. Each method returns a result; it must not throw. */
export interface PhoneProvider {
  sendWhatsApp(message: PhoneMessage): Promise<SendResult>;
  sendSms(message: PhoneMessage): Promise<SendResult>;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<SendResult>;
}

export interface Notifier {
  sendEmail(message: EmailMessage): Promise<SendResult>;
  /** WhatsApp first, SMS fallback. The returned `channel` is the one that was last tried. */
  sendPhone(message: PhoneMessage): Promise<SendResult>;
}
