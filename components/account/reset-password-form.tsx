'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updatePasswordAction, type AuthFormState } from '@/app/actions/auth';
import { FieldError, FormError, inputClass, errorInputClass, primaryButton } from './auth-fields';

/**
 * Set a new password. Client component so the server action's `useActionState`
 * signature `(prevState, formData)` is honoured and inline field/form errors
 * render. A successful update redirects to `?done=1`.
 */
export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('account');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    updatePasswordAction,
    {},
  );
  const fe = state.fieldErrors ?? {};

  return (
    <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
      <FormError errorKey={state.formError} />
      <form action={formAction} className="space-y-3" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <div>
          <label htmlFor="password" className="block text-[length:var(--text-subhead)] font-medium">
            {t('passwordLabel')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-invalid={!!fe.password}
            aria-describedby={fe.password ? 'password-error' : 'password-hint'}
            className={`${fe.password ? errorInputClass : inputClass} mt-1`}
          />
          <p id="password-hint" className="mt-1 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
            {t('passwordHint')}
          </p>
          <FieldError id="password-error" errorKey={fe.password} />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-[length:var(--text-subhead)] font-medium">
            {t('confirmPasswordLabel')}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-invalid={!!fe.confirmPassword}
            aria-describedby={fe.confirmPassword ? 'confirmPassword-error' : undefined}
            className={`${fe.confirmPassword ? errorInputClass : inputClass} mt-1`}
          />
          <FieldError id="confirmPassword-error" errorKey={fe.confirmPassword} />
        </div>
        <button type="submit" disabled={pending} className={primaryButton}>
          {t('resetSubmit')}
        </button>
      </form>
    </div>
  );
}
