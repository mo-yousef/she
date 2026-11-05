'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { signInWithPasswordAction, signInWithGoogleAction, type AuthFormState } from '@/app/actions/auth';
import { FieldError, FormError, inputClass, errorInputClass, primaryButton, secondaryButton } from './auth-fields';

/**
 * Email + password sign-in form. Client component: validation errors from the
 * server action render under the field that caused them (useActionState), and
 * the typed email is preserved. Google is shown only when enabled via the flag.
 */
export function SignInForm({
  locale,
  callback,
  googleEnabled,
}: {
  locale: string;
  callback: string;
  googleEnabled: boolean;
}) {
  const t = useTranslations('account');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signInWithPasswordAction,
    {},
  );
  const fe = state.fieldErrors ?? {};

  return (
    <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
      <FormError errorKey={state.formError} />
      <form action={formAction} className="space-y-3" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="callbackUrl" value={callback} />
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
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="block text-[length:var(--text-subhead)] font-medium">
              {t('passwordLabel')}
            </label>
            <Link
              href="/forgot-password"
              locale={locale}
              className="text-[length:var(--text-footnote)] text-[color:var(--tint)]"
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            aria-invalid={!!fe.password}
            aria-describedby={fe.password ? 'password-error' : undefined}
            className={`${fe.password ? errorInputClass : inputClass} mt-1`}
          />
          <FieldError id="password-error" errorKey={fe.password} />
        </div>
        <button type="submit" disabled={pending} className={primaryButton}>
          {t('signInSubmit')}
        </button>
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
