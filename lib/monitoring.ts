/**
 * Error monitoring behind a tiny interface (task 8.3, req 10). Sentry is the only
 * implementation; with no DSN configured every call is a no-op (dev, CI, tests).
 * Callers pass ids/codes only: never names, emails, phones or free text.
 */
const CONTEXT_ALLOWLIST = new Set([
  'area',
  'action',
  'code',
  'businessId',
  'bookingId',
  'serviceId',
  'staffId',
  'userId',
  'digest',
]);

export type ErrorContext = Record<string, string | number | boolean | undefined>;

export function monitoringEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/** Keep only allowlisted keys with short scalar values (ids/codes). */
export function safeContext(context: ErrorContext = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(context)) {
    if (!CONTEXT_ALLOWLIST.has(k) || v === undefined) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 64) : v;
  }
  return out;
}

export function captureError(error: unknown, context?: ErrorContext): void {
  if (!monitoringEnabled()) return;
  const extra = safeContext(context);
  // Dynamic import keeps the SDK out of client bundles that only contain an error boundary.
  void import('@sentry/nextjs')
    .then((Sentry) => Sentry.captureException(error, { extra }))
    .catch(() => {
      // Monitoring must never break the request.
    });
}

type Scrubbable = {
  request?: { data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown; url?: string };
  user?: unknown;
  breadcrumbs?: Array<{ data?: unknown; message?: string }>;
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
};

/**
 * Sentry `beforeSend`: drops request bodies, cookies, headers, query strings, the user
 * (email/ip) and breadcrumb data. Exception messages are replaced by the error type
 * alone because they can embed user input.
 */
export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split(/[?#]/)[0];
  }
  delete event.user;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => {
      const rest = { ...b };
      delete rest.data;
      delete rest.message;
      return rest;
    });
  }
  event.exception?.values?.forEach((v) => {
    delete v.value;
  });
  delete event.message;
  return event;
}

/** Shared init options for server, edge and client. */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
