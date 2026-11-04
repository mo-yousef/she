'use client';
import { useEffect } from 'react';
import { captureError } from '@/lib/monitoring';

/**
 * Last-resort boundary: it replaces the root layout, so translations and the locale
 * provider are unavailable. The copy is English only on purpose (no i18n context here).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, { area: 'global', digest: error.digest });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem 1rem' }}>
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>This page didn’t load. Try again, or go back to the home page.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 1.5rem' }}>
            Try again
          </button>{' '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload is intended; the app shell is broken here */}
          <a href="/" style={{ display: 'inline-block', minHeight: 44, lineHeight: '44px', padding: '0 1rem' }}>
            Back to home
          </a>
        </main>
      </body>
    </html>
  );
}
