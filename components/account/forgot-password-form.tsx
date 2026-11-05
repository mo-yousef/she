'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { requestPasswordResetAction, type AuthFormState } from '@/app/actions/auth';
import { FieldError, FormError, inputClass, errorInputClass, primaryButton } from './auth-fields';

/**
 * Request a password-reset email. Client component so the server action's
 * `useActionState` signature `(prevState, formData)` is honoured and inline
 * field/form errors render. A successful request redirects to `?sent=1`.
 */
export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('account');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );
  const fe = state.fieldErrors ?? {};

  return (
    <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
      <FormError errorKey={state.formError} />
      <form action={formAction} className="space-y-3" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="email" className="block text-[length:var(--text-subhead)] font-medium">
          {t('emailLabel')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.values?.email ?? ''}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? 'email-error' : undefined}
          className={fe.email ? errorInputClass : inputClass}
        />
        <FieldError id="email-error" errorKey={fe.email} />
        <button type="submit" disabled={pending} className={primaryButton}>
          {t('forgotSubmit')}
        </button>
      </form>
    </div>
  );
}
