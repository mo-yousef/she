'use client';

/**
 * Booking details body + owner status actions, shared by the calendar's event dialog (6.2)
 * and the bookings table (6.3). Which actions appear comes from the pure transition table
 * (`allowedTransitions`); the server core enforces the same rules again. Labels live in the
 * `calendar` namespace on purpose (one wording per concept).
 */
import {
  CheckCheck,
  CheckCircle2,
  Clock,
  Phone,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { allowedTransitions, type BookingStatusName } from '@/lib/booking-status';
import { formatPrice } from '@/lib/money';
import { dangerBtn, primaryBtn, secondaryBtn } from './fields';

/** Per status: an icon + border style so it is never colour alone. */
export const STATUS_STYLE: Record<string, { icon: LucideIcon; cls: string }> = {
  PENDING: {
    icon: Clock,
    cls: 'border-2 border-dashed border-[color:var(--tint)] bg-[color:var(--surface)] text-[color:var(--label)]',
  },
  CONFIRMED: {
    icon: CheckCircle2,
    cls: 'border-2 border-solid border-[color:var(--tint)] bg-[color:var(--tint)] text-[color:var(--tint-contrast)]',
  },
  COMPLETED: {
    icon: CheckCheck,
    cls: 'border-2 border-solid border-[color:var(--success)] bg-[color:var(--surface)] text-[color:var(--label)]',
  },
  NO_SHOW: {
    icon: UserX,
    cls: 'border-2 border-double border-[color:var(--danger)] bg-[color:var(--surface)] text-[color:var(--label)]',
  },
  CANCELLED_BY_CUSTOMER: {
    icon: XCircle,
    cls: 'border-2 border-dotted border-[color:var(--control-border)] bg-[color:var(--surface)] text-[color:var(--label-secondary)] line-through',
  },
  CANCELLED_BY_BUSINESS: {
    icon: XCircle,
    cls: 'border-2 border-dotted border-[color:var(--control-border)] bg-[color:var(--surface)] text-[color:var(--label-secondary)] line-through',
  },
};

/** The fields the details body needs; both the calendar EventDto and BookingRow fit. */
export interface BookingDetailsData {
  id: string;
  status?: string;
  reference?: string;
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  /** Service name. */
  title: string;
  staffName: string;
  timeLabel: string;
  startIso: string;
  priceCents?: number;
  note?: string | null;
  source?: string;
}

export function BookingDetails({
  booking: b,
  locale,
  busy,
  error,
  onStatus,
  onAskCancel,
}: {
  booking: BookingDetailsData;
  locale: string;
  busy: boolean;
  error: string | null;
  onStatus: (to: BookingStatusName) => void;
  onAskCancel: () => void;
}) {
  const t = useTranslations('calendar');
  const started = Date.parse(b.startIso) <= Date.now();
  const next = allowedTransitions(b.status as BookingStatusName);

  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
        <dt className="text-[color:var(--label-secondary)]">{label}</dt>
        <dd className="min-w-0 break-words">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
        >
          {error}
        </p>
      ) : null}
      <dl className="divide-y divide-[color:var(--separator)]">
        {row(t('details.reference'), b.reference)}
        {row(t('details.status'), t(`status.${b.status}` as 'status.CONFIRMED'))}
        {row(t('details.customer'), b.guestName)}
        {row(
          t('details.phone'),
          b.guestPhone ? (
            <a
              href={`tel:${b.guestPhone}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-[color:var(--tint)] underline"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {b.guestPhone}
            </a>
          ) : null,
        )}
        {row(t('details.email'), b.guestEmail)}
        {row(t('details.service'), b.title)}
        {row(t('details.staff'), b.staffName)}
        {row(t('details.time'), b.timeLabel)}
        {row(
          t('details.price'),
          typeof b.priceCents === 'number' ? formatPrice(b.priceCents, locale) : null,
        )}
        {row(t('details.note'), b.note)}
        {row(
          t('details.source'),
          b.source === 'MANUAL' ? t('details.sourceManual') : t('details.sourceOnline'),
        )}
      </dl>

      <div className="flex flex-col gap-2">
        {next.includes('CONFIRMED') ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus('CONFIRMED')}
            className={primaryBtn}
          >
            {busy ? t('details.working') : t('details.confirmBooking')}
          </button>
        ) : null}
        {next.includes('COMPLETED') && started ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus('COMPLETED')}
            className={primaryBtn}
          >
            {busy ? t('details.working') : t('details.markCompleted')}
          </button>
        ) : null}
        {next.includes('NO_SHOW') && started ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus('NO_SHOW')}
            className={secondaryBtn}
          >
            {busy ? t('details.working') : t('details.markNoShow')}
          </button>
        ) : null}
        {next.includes('CANCELLED_BY_BUSINESS') ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAskCancel}
            className={dangerBtn}
          >
            {t('details.cancelBooking')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
