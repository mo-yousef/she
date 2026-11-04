'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { rescheduleBooking } from '@/app/actions/manage-booking';
import { formatSlot } from '@/lib/format-datetime';
import { DateStrip, type StripDay } from '@/components/booking/date-strip';
import { SlotGrid, type SlotItem } from '@/components/booking/slot-grid';
import { ContactLinks } from './contact-links';

export interface RescheduleDay extends StripDay {
  slots: SlotItem[];
}

type ErrorCode =
  'SLOT_TAKEN' | 'PAST_CUTOFF' | 'NOT_CHANGEABLE' | 'VALIDATION' | 'UNKNOWN';

/**
 * Reschedule picker (requirement 3.2): same date strip + slot grid as the booking
 * flow, fed with fresh server availability for the SAME service and staff (the
 * booking's own slot counted as free). The server action re-validates everything.
 */
export function ReschedulePicker({
  locale,
  slug,
  reference,
  token,
  manageHref,
  days,
  phone,
  whatsapp,
}: {
  locale: string;
  slug: string;
  reference: string;
  token: string;
  /** Manage page path (no query) to return to. */
  manageHref: string;
  days: RescheduleDay[];
  phone: string | null;
  whatsapp: string | null;
}) {
  const t = useTranslations('manage');
  const tb = useTranslations('booking');
  const router = useRouter();
  const firstOpen = days.find((d) => d.hasAvailability)?.dateKey ?? null;
  const [date, setDate] = useState<string | null>(firstOpen);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  const back = `${manageHref}?t=${encodeURIComponent(token)}`;
  const day = days.find((d) => d.dateKey === date);

  async function confirm() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rescheduleBooking({
        businessSlug: slug,
        reference,
        token,
        startsAt: slot,
      });
      if (res.ok) {
        // A re-issued token (booking moved past the old link's expiry) replaces the old one.
        const next = `${manageHref}?t=${encodeURIComponent(res.newToken ?? token)}&done=rescheduled`;
        router.replace(next, { locale });
        return;
      }
      setError(res.code === 'NOT_FOUND' ? 'UNKNOWN' : res.code);
      if (res.code === 'SLOT_TAKEN') {
        setSlot(null);
        router.refresh(); // fresh availability from the server
      }
    } catch {
      setError('UNKNOWN');
    } finally {
      setBusy(false);
    }
  }

  if (error === 'PAST_CUTOFF') {
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
    <div aria-busy={busy}>
      {error ? (
        <p
          role="alert"
          className="mb-4 text-[length:var(--text-subhead)] text-[color:var(--danger)]"
        >
          {error === 'SLOT_TAKEN' ? tb('confirmError.SLOT_TAKEN') : t(`error.${error}`)}
        </p>
      ) : null}
      {firstOpen === null ? (
        <>
          <p
            role="status"
            className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-center"
          >
            {t('noTimesBody')}
          </p>
          <div className="mt-3">
            <ContactLinks phone={phone} whatsapp={whatsapp} />
          </div>
        </>
      ) : (
        <>
          <DateStrip
            days={days}
            value={date}
            onChange={(d) => {
              setDate(d);
              setSlot(null);
            }}
          />
          <div className="mt-4">
            <SlotGrid slots={day?.slots ?? []} value={slot} onChange={setSlot} />
          </div>
          <p className="mt-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
            {tb('timezoneNote')}
          </p>
        </>
      )}
      {slot ? (
        <p role="status" className="mt-4 text-[length:var(--text-subhead)] font-medium">
          {t('newTime', { when: formatSlot(slot, locale) })}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!slot || busy}
        onClick={confirm}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t('confirmingReschedule') : t('confirmReschedule')}
      </button>
      <Link
        href={back}
        locale={locale}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-[length:var(--text-body)] font-medium text-[color:var(--b1-text)]"
      >
        {t('keepCurrentTime')}
      </Link>
    </div>
  );
}
