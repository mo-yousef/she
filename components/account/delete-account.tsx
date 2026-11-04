'use client';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deleteAccountAction } from '@/app/actions/delete-account';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';

/** "Delete your account" with a confirmation sheet; the user must type their email to confirm. */
export function DeleteAccount({ locale, email, ownsBusiness }: { locale: string; email: string; ownsBusiness: boolean }) {
  const t = useTranslations('account.delete');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function confirm() {
    if (typed.trim().toLowerCase() !== email.toLowerCase()) {
      setError('EMAIL_MISMATCH');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await deleteAccountAction({ confirmEmail: typed });
      if (res.ok) {
        window.location.assign(`/${locale}/account?deleted=1`);
        return;
      }
      setOpen(false);
      setError(res.code);
    } catch {
      setOpen(false);
      setError('UNKNOWN');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mt-1 text-[color:var(--label-secondary)]">{t('consequences')}</p>
      {ownsBusiness ? (
        <p className="mt-3 text-[color:var(--label-secondary)]">{t('ownerNotice')}</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setTyped('');
            setError(null);
            setOpen(true);
          }}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border-2 border-[color:var(--danger)] px-5 font-semibold text-[color:var(--danger)]"
        >
          {t('open')}
        </button>
      )}
      <p role="alert" aria-live="assertive" className="mt-3 text-[color:var(--danger)]">
        {error && !open ? t(`error.${error}`) : ''}
      </p>
      <ConfirmSheet
        open={open}
        title={t('sheetTitle')}
        confirmLabel={t('confirm')}
        keepLabel={t('keep')}
        busy={busy}
        onConfirm={confirm}
        onClose={() => !busy && setOpen(false)}
      >
        <p>{t('sheetBody')}</p>
        <label htmlFor={inputId} className="mt-3 block font-medium text-[color:var(--label)]">
          {t('typeEmail', { email })}
        </label>
        <input
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-invalid={error === 'EMAIL_MISMATCH'}
          className="mt-1 min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[color:var(--label)]"
        />
        <p role="alert" className="mt-2 text-[color:var(--danger)]">
          {error === 'EMAIL_MISMATCH' && open ? t('error.EMAIL_MISMATCH') : ''}
        </p>
      </ConfirmSheet>
    </>
  );
}
