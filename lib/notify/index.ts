import { sendWithFallback } from './fallback';
import { resendFromEnv } from './resend';
import { devEmail, devPhone, notifierModes, type NotifyEnv } from './select';
import { twilioFromEnv } from './twilio';
import type { Notifier } from './types';

export type * from './types';

/**
 * Composition root. To swap providers, change the two `live` lines below (e.g. replace
 * `twilioFromEnv` with another `PhoneProvider`); nothing else in the app changes.
 */
export function createNotifier(env: NotifyEnv = process.env): Notifier {
  const modes = notifierModes(env);
  const quiet = env.NODE_ENV === 'test';
  const email = modes.email === 'live' ? resendFromEnv(env) : devEmail(quiet);
  const phone = modes.phone === 'live' ? twilioFromEnv(env) : devPhone(quiet);
  return {
    sendEmail: (m) => email.sendEmail(m),
    sendPhone: (m) => sendWithFallback(phone, m),
  };
}

let cached: Notifier | undefined;

/** Process-wide notifier; built lazily so importing this module never touches the SDKs' network. */
export function getNotifier(): Notifier {
  return (cached ??= createNotifier());
}
