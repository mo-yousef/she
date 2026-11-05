'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  signUpCustomerAction,
  signUpBusinessAction,
  signInWithGoogleAction,
  type AuthFormState,
} from '@/app/actions/auth';
import { FieldError, FormError, inputClass, errorInputClass, primaryButton, secondaryButton } from './auth-fields';

/**
 * Email + password sign-up form, shared by the customer and business signup
 * pages. The `variant` chooses the server action (role intent) and submit label.
 *
 * Client component: the sign-up actions use the `useActionState` signature
 * `(prevState, formData)`, so they must be driven by `useActionState` rather
 * than a bare `<form action>` (which would pass only the FormData and leave
 * `prevState` holding it). This also renders the inline field/form errors the
 * action returns. Google is shown only when enabled via the flag.
 */
export function SignUpForm({
  locale,
  callback,
  variant,
  googleEnabled,
}: {
  locale: string;
  callback: string;
  variant: 'customer' | 'business';
  googleEnabled: boolean;
}) {
  const t = useTranslations('account');
  const action = variant === 'business' ? signUpBusinessAction : signUpCustomerAction;
  const submitLabel = variant === 'business' ? t('businessSignUpSubmit') : t('signUpSubmit');

  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};

  return (
    <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
      <FormError errorKey={state.formError} />
      <form action={formAction} className="space-y-3" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="callbackUrl" value={callback} />
        <div>
          <label htmlFor="name" className="block text-[length:var(--text-subhead)] font-medium">
            {t('nameLabel')}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            defaultValue={state.values?.name ?? ''}
            aria-invalid={!!fe.name}
            aria-describedby={fe.name ? 'name-error' : undefined}
            className={`${fe.name ? errorInputClass : inputClass} mt-1`}
          />
          <FieldError id="name-error" errorKey={fe.name} />
        </div>
        <div>
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
            className={`${fe.email ? errorInputClass : inputClass} mt-1`}
          />
          <FieldError id="email-error" errorKey={fe.email} />
        </div>
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
          {submitLabel}
        </button>
        <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
          {t('terms', {
            terms: t('termsLink'),
            privacy: t('privacyLink'),
          })}
        </p>
      </form>

      {googleEnabled ? (
        <>
          <p className="my-4 text-center text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
            {t('or')}
          </p>
          <form action={signInWithGoogleAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="callbackUrl" value={callback} />
            <button type="submit" className={secondaryButton}>
              {t('google')}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
