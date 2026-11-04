'use client';
/** "Take my listing offline" (task 6.8): consequences in the sheet, safe default is Keep online. */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { unpublishListing } from '@/app/actions/settings';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { dangerBtn } from '@/components/calendar/fields';

export function UnpublishButton({ upcoming, pending }: { upcoming: number; pending: boolean }) {
  const t = useTranslations('settings.status.unpublish');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await unpublishListing();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(t(t.has(`error.${res.code}`) ? `error.${res.code}` : 'error.UNKNOWN'));
    } catch {
      setError(t('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className={dangerBtn} onClick={() => { setError(''); setOpen(true); }}>
        {t('button')}
      </button>
      <p role="alert" aria-live="assertive" className="font-medium text-[color:var(--danger)]">
        {open ? '' : error}
      </p>
      <ConfirmSheet open={open} title={t('title')} confirmLabel={busy ? t('working') : t('confirm')} keepLabel={t('keep')} busy={busy} onConfirm={confirm} onClose={() => !busy && setOpen(false)}>
        <p>{t(pending ? 'bodyPending' : 'bodyPublished')}</p>
        <ul className="mt-2 list-disc ps-5">
          <li>{t('consequence.page')}</li>
          <li>{t('consequence.booking')}</li>
          <li>{t('consequence.existing', { count: upcoming })}</li>
        </ul>
        <p className="mt-2">{t('republish')}</p>
        <p role="alert" aria-live="assertive" className="mt-2 font-medium text-[color:var(--danger)]">
          {open ? error : ''}
        </p>
      </ConfirmSheet>
    </div>
  );
}
