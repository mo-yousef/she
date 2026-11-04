import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/monitoring';

export async function register() {
  // No DSN: Sentry stays uninitialised (no-op).
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryOptions(process.env.SENTRY_DSN));
  }
}

export const onRequestError = Sentry.captureRequestError;
