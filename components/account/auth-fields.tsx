'use client';

import { useTranslations } from 'next-intl';

/** Shared Tailwind token strings for the auth forms. */
export const inputClass =
  'min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)]';
export const errorInputClass =
  'min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--danger)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)]';
export const primaryButton =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 font-semibold text-[color:var(--tint-contrast)] disabled:opacity-60';
export const secondaryButton =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-5 font-semibold text-[color:var(--label)]';

/** Inline, per-field error shown directly under its input. */
export function FieldError({ id, errorKey }: { id: string; errorKey?: string }) {
  const t = useTranslations('account.error');
  if (!errorKey) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[length:var(--text-footnote)] text-[color:var(--danger)]">
      {t(errorKey)}
    </p>
  );
}

/** Form-level error banner for cross-cutting failures (rate limit, provider). */
export function FormError({ errorKey }: { errorKey?: string }) {
  const t = useTranslations('account.error');
  if (!errorKey) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
    >
      {t(errorKey)}
    </p>
  );
}
