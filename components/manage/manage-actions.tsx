'use client';

import { useState } from 'react';
import { CalendarClock, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { cancelBooking } from '@/app/actions/manage-booking';
import { ContactLinks } from './contact-links';
import { ConfirmSheet } from './confirm-sheet';

const secondaryBtn =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-5 text-[length:var(--text-headline)] font-semibold';

/**
 * Reschedule link + Cancel button with confirmation sheet (requirement 3.2).
 * `canChange` is the server's read of the cancellation window at render time and
 * only decides what to SHOW; the action re-checks the window itself.
 */
export function ManageActions({
  locale,
  slug,
  reference,
  token,
  rescheduleHref,
  canChange,
  phone,
  whatsapp,
}: {
  locale: string;
  slug: string;
  reference: string;
  token: string;
  rescheduleHref: string;
  canChange: boolean;
  phone: string | null;
  whatsapp: string | null;
}) {
  const t = useTranslations('manage');
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'PAST_CUTOFF' | 'NOT_CHANGEABLE' | 'UNKNOWN' | null>(
    null,
  );

  async function confirmCancel() {
    setBusy(true);
    try {
      const res = await cancelBooking({ businessSlug: slug, reference, token });
      if (res.ok) {
        setSheet(false);
        router.refresh(); // page re-renders read-only with the cancelled status
        return;
      }
      setSheet(false);
      setError(
        res.code === 'PAST_CUTOFF'
          ? 'PAST_CUTOFF'
          : res.code === 'NOT_CHANGEABLE'
            ? 'NOT_CHANGEABLE'
            : 'UNKNOWN',
      );
      if (res.code === 'NOT_CHANGEABLE') router.refresh();
    } catch {
      setSheet(false);
      setError('UNKNOWN');
    } finally {
      setBusy(false);
    }
  }

  if (!canChange || error === 'PAST_CUTOFF') {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4 shadow-sm"
      >
        <p className="font-semibold">{t('pastCutoffTitle')}</p>
        <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
          {t('pastCutoffBody')}
        </p>
        <div className="mt-3">
          <ContactLinks phone={phone} whatsapp={whatsapp} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="text-[length:var(--text-subhead)] text-[color:var(--danger)]"
        >
          {t(`error.${error}`)}
        </p>
      ) : null}
      <Link href={rescheduleHref} locale={locale} className={secondaryBtn}>
        <CalendarClock className="h-5 w-5" aria-hidden />
        {t('reschedule')}
      </Link>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSheet(true);
        }}
        className={`${secondaryBtn} text-[color:var(--danger)]`}
      >
        <XCircle className="h-5 w-5" aria-hidden />
        {t('cancelBooking')}
      </button>
      <ConfirmSheet
        open={sheet}
        title={t('cancelSheetTitle')}
        confirmLabel={busy ? t('cancelling') : t('cancelConfirm')}
        keepLabel={t('keepBooking')}
        busy={busy}
        onConfirm={confirmCancel}
        onClose={() => setSheet(false)}
      >
        <p>{t('cancelSheetBody')}</p>
      </ConfirmSheet>
    </div>
  );
}
