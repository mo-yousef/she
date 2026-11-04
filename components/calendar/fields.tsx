'use client';

import type { ReactNode } from 'react';

export const inputClass =
  'min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 py-2 text-[length:var(--text-body)] text-[color:var(--label)] aria-[invalid=true]:border-[color:var(--danger)]';
export const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 font-semibold text-[color:var(--tint-contrast)] disabled:opacity-60';
export const secondaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-5 font-semibold disabled:opacity-60';
export const dangerBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border-2 border-[color:var(--danger)] px-5 font-semibold text-[color:var(--danger)] disabled:opacity-60';

/** Label + control + hint + inline error. The control must use `fieldIds(id)` for aria wiring. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[length:var(--text-subhead)] font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p
          id={`${id}-hint`}
          className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]"
        >
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-err`}
          className="text-[length:var(--text-footnote)] text-[color:var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, hint?: string, error?: string) {
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') ||
    undefined;
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const;
}

/** Result of a calendar server action, narrowed for message mapping. */
export interface ActionFailure {
  ok: false;
  code: string;
  reason?: string;
  errors?: Record<string, string>;
  conflictCount?: number;
  conflictDates?: string[];
}

/** i18n key (under `calendar.error`) for a failed action, plus ICU values when needed. */
export function failureKey(res: ActionFailure): {
  key: string;
  values?: Record<string, string | number>;
} {
  if (res.code === 'NOT_ALLOWED') return { key: res.reason ?? 'INVALID_TRANSITION' };
  if (res.code === 'OVERLAP' && res.conflictCount) {
    return {
      key: 'BLOCK_OVERLAP',
      values: { count: res.conflictCount, dates: (res.conflictDates ?? []).join(', ') },
    };
  }
  return { key: res.code };
}
