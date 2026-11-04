import type { PhoneMessage, PhoneProvider, SendResult } from './types';

/**
 * WhatsApp-then-SMS policy, independent of any provider.
 *
 * - WhatsApp succeeds -> done.
 * - WhatsApp fails for any reason except INVALID_RECIPIENT -> try SMS (the number may
 *   not be on WhatsApp, the template may be unapproved, the session window may be
 *   closed, or the API may be down).
 * - INVALID_RECIPIENT -> stop: the number itself is bad, SMS would fail the same way.
 * - NOT_CONFIGURED -> stop: nothing is configured to send with.
 *
 * The result of the last attempt is returned, so `channel` tells the caller (and the
 * notification log) what was actually used.
 */
export function shouldFallBackToSms(whatsapp: Extract<SendResult, { ok: false }>): boolean {
  return whatsapp.code !== 'INVALID_RECIPIENT' && whatsapp.code !== 'NOT_CONFIGURED';
}

export async function sendWithFallback(
  provider: PhoneProvider,
  message: PhoneMessage,
): Promise<SendResult> {
  const whatsapp = await provider.sendWhatsApp(message);
  if (whatsapp.ok || !shouldFallBackToSms(whatsapp)) return whatsapp;
  return provider.sendSms(message);
}
