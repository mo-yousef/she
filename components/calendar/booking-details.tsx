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
import { Button } from '@/components/ui/button';

/** Per status: an icon + border style so it is never colour alone. */
export const STATUS_STYLE: Record<string, { icon: LucideIcon; cls: string }> = {
  PENDING: {
    icon: Clock,
    cls: 'border-2 border-dashed border-primary bg-card text-card-foreground',
  },
  CONFIRMED: {
    icon: CheckCircle2,
    cls: 'border-2 border-solid border-primary bg-primary text-primary-foreground',
  },
  COMPLETED: {
    icon: CheckCheck,
    cls: 'border-2 border-solid border-success bg-card text-card-foreground',
  },
  NO_SHOW: {
    icon: UserX,
    cls: 'border-2 border-double border-destructive bg-card text-card-foreground',
  },
  CANCELLED_BY_CUSTOMER: {
    icon: XCircle,
    cls: 'border-2 border-dotted border-border bg-card text-muted-foreground line-through',
  },
  CANCELLED_BY_BUSINESS: {
    icon: XCircle,
    cls: 'border-2 border-dotted border-border bg-card text-muted-foreground line-through',
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
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="min-w-0 break-words">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
          {error}
        </p>
      ) : null}
      <dl className="divide-y divide-border">
        {row(t('details.reference'), b.reference)}
        {row(t('details.status'), t(`status.${b.status}` as 'status.CONFIRMED'))}
        {row(t('details.customer'), b.guestName)}
        {row(
          t('details.phone'),
          b.guestPhone ? (
            <a
              href={`tel:${b.guestPhone}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-primary underline"
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
          <Button type="button" size="lg" disabled={busy} onClick={() => onStatus('CONFIRMED')}>
            {busy ? t('details.working') : t('details.confirmBooking')}
          </Button>
        ) : null}
        {next.includes('COMPLETED') && started ? (
          <Button type="button" size="lg" disabled={busy} onClick={() => onStatus('COMPLETED')}>
            {busy ? t('details.working') : t('details.markCompleted')}
          </Button>
        ) : null}
        {next.includes('NO_SHOW') && started ? (
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => onStatus('NO_SHOW')}>
            {busy ? t('details.working') : t('details.markNoShow')}
          </Button>
        ) : null}
        {next.includes('CANCELLED_BY_BUSINESS') ? (
          <Button type="button" variant="outline" size="lg" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={onAskCancel}>
            {t('details.cancelBooking')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
