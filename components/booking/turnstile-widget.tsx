'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const s =
      existing ??
      Object.assign(document.createElement('script'), { src: SRC, async: true });
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => {
      s.remove(); // a failed tag never fires again; drop it so Retry can load a fresh one
      reject(new Error('turnstile script failed'));
    });
    if (!existing) document.head.appendChild(s);
  });
}

/**
 * Cloudflare Turnstile challenge. Tokens are single use, so change `resetKey` after
 * every submit attempt to get a fresh one. Verification happens server-side only.
 * If the challenge cannot load (blocked script, offline) the visitor sees a message
 * and a Retry button, never a silently disabled Confirm button.
 */
export function TurnstileWidget({
  siteKey,
  locale,
  resetKey,
  onToken,
}: {
  siteKey: string;
  locale: string;
  resetKey: number;
  onToken: (token: string | null) => void;
}) {
  const t = useTranslations('booking');
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    onTokenRef.current(null);
    setStatus('loading');
    loadScript()
      .then(() => {
        if (cancelled || !host.current || !window.turnstile) return;
        id = window.turnstile.render(host.current, {
          sitekey: siteKey,
          language: locale,
          callback: (token: string) => {
            setStatus('ready');
            onTokenRef.current(token);
          },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            setStatus('failed');
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('failed');
        onTokenRef.current(null);
      });
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, locale, resetKey, attempt]);

  return (
    <div className="mt-4">
      <p id="bk-security-label" className="text-[length:var(--text-subhead)] font-medium">
        {t('securityCheck')}
      </p>
      <div
        ref={host}
        role="group"
        aria-labelledby="bk-security-label"
        className="mt-1 min-h-[65px]"
      />
      {status === 'loading' ? (
        <p
          role="status"
          className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]"
        >
          {t('securityCheckLoading')}
        </p>
      ) : null}
      {status === 'failed' ? (
        <div role="alert" className="mt-1">
          <p className="text-[length:var(--text-subhead)] text-[color:var(--danger)]">
            {t('securityCheckFailed')}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-1 inline-flex min-h-11 items-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-4 text-[length:var(--text-subhead)] font-medium"
          >
            {t('securityCheckRetry')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
