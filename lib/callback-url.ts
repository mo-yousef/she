/**
 * Open-redirect-safe `callbackUrl` handling for sign-in (task 6.1). Only same-origin,
 * relative paths are accepted; anything else falls back to the given default.
 */
import { routing } from '../i18n/routing';

const PLACEHOLDER_ORIGIN = 'http://callback.invalid';

export function safeCallbackPath(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return fallback;
  // Must be a single-slash absolute path: rejects "//host", "/\host", "https://x", "javascript:".
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  // Control characters (incl. tab/newline, which browsers strip inside URLs) are never legitimate.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** The locale a path is prefixed with ("/el/dashboard" -> "el"), or null. */
export function localeOfPath(path: string): (typeof routing.locales)[number] | null {
  const first = path.split('/')[1];
  return routing.locales.find((l) => l === first) ?? null;
}
