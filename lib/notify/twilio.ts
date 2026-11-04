import twilio from 'twilio';
import type { NotificationChannel, NotifyErrorCode, PhoneMessage, PhoneProvider, SendResult } from './types';

/** The slice of the Twilio SDK we use; lets tests inject a fake. */
export interface TwilioLike {
  messages: {
    create(payload: { from: string; to: string; body: string; statusCallback?: string }): Promise<{ sid: string }>;
  };
}

// Twilio codes: 21211 invalid 'To' number, 21614 'To' is not a mobile number,
// 63016/63015-style WhatsApp errors are deliberately NOT here: they mean "not reachable
// on WhatsApp", which is exactly when SMS fallback should run.
const INVALID_RECIPIENT_CODES = new Set([21211, 21614, 21408]);

export function mapTwilioError(error: unknown): NotifyErrorCode {
  const e = error as { code?: number; status?: number } | null;
  if (e?.code !== undefined && INVALID_RECIPIENT_CODES.has(e.code)) return 'INVALID_RECIPIENT';
  if (e?.status === 429 || e?.code === 20429) return 'RATE_LIMITED';
  return 'PROVIDER_ERROR';
}

export function createTwilioPhone(
  client: TwilioLike,
  from: { whatsapp: string; sms: string },
  statusCallback?: string,
): PhoneProvider {
  async function send(
    channel: NotificationChannel,
    payload: { from: string; to: string },
    body: string,
  ): Promise<SendResult> {
    try {
      const res = await client.messages.create({ ...payload, body, ...(statusCallback ? { statusCallback } : {}) });
      return { ok: true, channel, providerId: res.sid };
    } catch (error) {
      // Error messages can echo the number; only the mapped code leaves this function.
      return { ok: false, channel, code: mapTwilioError(error) };
    }
  }

  return {
    sendWhatsApp: (m: PhoneMessage) =>
      send('WHATSAPP', { from: asWhatsApp(from.whatsapp), to: asWhatsApp(m.to) }, m.body),
    sendSms: (m: PhoneMessage) => send('SMS', { from: from.sms, to: m.to }, m.body),
  };
}

function asWhatsApp(number: string): string {
  return number.startsWith('whatsapp:') ? number : `whatsapp:${number}`;
}

/**
 * Per-message status callback URL. Twilio can only reach a public https URL, so it is
 * omitted for localhost / http (dev), where the log row simply stays at SENT.
 */
export function twilioStatusCallback(siteUrl: string | undefined): string | undefined {
  if (!siteUrl) return undefined;
  try {
    const u = new URL(siteUrl);
    if (u.protocol !== 'https:' || u.hostname === 'localhost') return undefined;
    return `${siteUrl.replace(/\/+$/, '')}/api/webhooks/twilio`;
  } catch {
    return undefined;
  }
}

export function twilioFromEnv(env: {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  TWILIO_SMS_FROM?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}): PhoneProvider {
  return createTwilioPhone(
    twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
    { whatsapp: env.TWILIO_WHATSAPP_FROM ?? '', sms: env.TWILIO_SMS_FROM ?? '' },
    twilioStatusCallback(env.NEXT_PUBLIC_SITE_URL),
  );
}
