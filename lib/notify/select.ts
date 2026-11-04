import type { EmailProvider, NotificationChannel, PhoneProvider, SendResult } from './types';

export type ProviderMode = 'live' | 'dev';

export interface NotifyEnv {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  TWILIO_SMS_FROM?: string;
}

/**
 * Per-channel-family choice between the real provider and the no-op dev notifier.
 * Never sends in tests; never sends without credentials. Unlike Turnstile this does
 * not fail closed in production: a missing key must not break booking, it only skips
 * the notification (and the skip is visible as a NOT_CONFIGURED result + warning).
 */
export function notifierModes(env: NotifyEnv): { email: ProviderMode; phone: ProviderMode } {
  if (env.NODE_ENV === 'test') return { email: 'dev', phone: 'dev' };
  return {
    email: env.RESEND_API_KEY ? 'live' : 'dev',
    phone:
      env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM && env.TWILIO_SMS_FROM
        ? 'live'
        : 'dev',
  };
}

function skipped(channel: NotificationChannel, template: string, quiet: boolean): SendResult {
  // Channel + template only. Never the recipient, subject or body (no PII in logs).
  if (!quiet) console.warn(`[notify] not configured, skipped channel=${channel} template=${template}`);
  return { ok: false, channel, code: 'NOT_CONFIGURED' };
}

/** No-op providers. `quiet` silences the warning (used under NODE_ENV=test). */
export function devEmail(quiet = false): EmailProvider {
  return { sendEmail: async (m) => skipped('EMAIL', m.template, quiet) };
}

export function devPhone(quiet = false): PhoneProvider {
  return {
    sendWhatsApp: async (m) => skipped('WHATSAPP', m.template, quiet),
    sendSms: async (m) => skipped('SMS', m.template, quiet),
  };
}
