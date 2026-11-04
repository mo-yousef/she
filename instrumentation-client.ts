import { sentryOptions } from '@/lib/monitoring';

// Load the SDK only when a public DSN is set, so the default bundle carries no Sentry code.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => Sentry.init(sentryOptions(dsn)));
}
