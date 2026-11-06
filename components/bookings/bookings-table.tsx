'use client';

/**
 * Bookings table (task 6.3). The server renders the filtered, paginated rows; this component
 * only draws them and owns the details dialog + status actions (shared `BookingDetails` and
 * `ConfirmSheet` from 6.2, same `changeBookingStatus` action as the calendar).
 *
 * Layout: a real <table> from `lg` up; below that each row is a card (a dense 9-column table
 * would need horizontal scrolling on a phone). Both are rendered, one is `display: none`
 * at any width, so assistive tech only sees one.
 */
import { useState } from 'react';
import { Globe, PenLine, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { changeBookingStatus } from '@/app/actions/calendar';
import type { BookingRow } from '@/lib/bookings-data';
import { formatPrice } from '@/lib/money';
import { ConfirmSheet } from '@/components/manage/confirm-sheet';
import { BookingDetails, STATUS_STYLE } from '@/components/calendar/booking-details';
import { failureKey, type ActionFailure } from '@/components/calendar/fields';
import { FormSheet } from '@/components/calendar/form-sheet';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VariantProps } from 'class-variance-authority';

const refBtn = `${buttonVariants({ variant: 'link', size: 'default' })} min-h-11 px-1 font-semibold underline underline-offset-2`;
const phoneLink = `${buttonVariants({ variant: 'link', size: 'default' })} min-h-11 gap-1.5 px-0 underline underline-offset-2`;

// Icon per status (never colour alone) maps onto a Badge tone.
type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'outline',
  CONFIRMED: 'default',
  COMPLETED: 'secondary',
  NO_SHOW: 'destructive',
  CANCELLED_BY_CUSTOMER: 'secondary',
  CANCELLED_BY_BUSINESS: 'secondary',
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('calendar');
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.CONFIRMED!;
  const Icon = st.icon;
  const cancelled = status.startsWith('CANCELLED');
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'default'} className={cancelled ? 'line-through' : undefined}>
      <Icon className="h-4 w-4 flex-none" aria-hidden />
      {t(`status.${status}` as 'status.CONFIRMED')}
    </Badge>
  );
}

function SourceBadge({ source }: { source: string }) {
  const t = useTranslations('calendar');
  const manual = source === 'MANUAL';
  const Icon = manual ? PenLine : Globe;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-4 w-4 flex-none" aria-hidden />
      {manual ? t('details.sourceManual') : t('details.sourceOnline')}
    </span>
  );
}

export function BookingsTable({ rows, locale }: { rows: BookingRow[]; locale: string }) {
  const t = useTranslations('bookings');
  const c = useTranslations('calendar');
  const router = useRouter();
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const [sheet, setSheet] = useState<'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  function close() {
    setSelected(null);
    setSheet(null);
    setError(null);
  }

  async function change(to: string, success: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await changeBookingStatus(selected.id, to);
      if (res.ok) {
        close();
        setAnnounce(success);
        router.refresh();
        return;
      }
      setSheet(null);
      const { key } = failureKey(res as unknown as ActionFailure);
      setError(c.has(`error.${key}`) ? c(`error.${key}`) : c('error.UNKNOWN'));
    } catch {
      setSheet(null);
      setError(c('error.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  }

  const name = (r: BookingRow) => r.guestName || '—';
  const open = (r: BookingRow) => (
    <button
      type="button"
      onClick={() => setSelected(r)}
      aria-label={t('table.open', { reference: r.reference })}
      className={refBtn}
    >
      {r.reference}
    </button>
  );
  const phone = (r: BookingRow) =>
    r.guestPhone ? (
      <a href={`tel:${r.guestPhone}`} className={phoneLink}>
        <Phone className="h-4 w-4 flex-none" aria-hidden />
        {r.guestPhone}
      </a>
    ) : (
      <span aria-hidden>—</span>
    );

  return (
    <div className="space-y-3">
      <p
        role="status"
        aria-live="polite"
        className={announce ? 'font-medium text-success' : 'sr-only'}
      >
        {announce}
      </p>
      {error && !selected ? (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* Desktop: table */}
      <Card className="hidden p-0 lg:block">
        <Table>
          <TableCaption className="sr-only">{t('table.caption')}</TableCaption>
          <TableHeader>
            <TableRow>
              {(
                [
                  'reference',
                  'customer',
                  'phone',
                  'service',
                  'staff',
                  'when',
                  'price',
                  'status',
                  'source',
                ] as const
              ).map((k) => (
                <TableHead key={k} scope="col">
                  {t(`table.${k}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableHead scope="row" className="font-normal">
                  {open(r)}
                </TableHead>
                <TableCell>{name(r)}</TableCell>
                <TableCell>{phone(r)}</TableCell>
                <TableCell>{r.service}</TableCell>
                <TableCell>{r.staffName}</TableCell>
                <TableCell>{r.dateLabel}</TableCell>
                <TableCell>{formatPrice(r.priceCents, locale)}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  <SourceBadge source={r.source} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile and tablet: cards */}
      <ul className="space-y-3 lg:hidden" aria-label={t('table.caption')}>
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="gap-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {open(r)}
                <StatusBadge status={r.status} />
              </div>
              <p className="font-semibold">{name(r)}</p>
              <p>
                {r.service} · {r.staffName}
              </p>
              <p className="text-muted-foreground">
                {r.dateLabel} · {r.timeLabel}
              </p>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{formatPrice(r.priceCents, locale)}</span>
                <SourceBadge source={r.source} />
              </p>
              {r.guestPhone ? <div>{phone(r)}</div> : null}
            </Card>
          </li>
        ))}
      </ul>

      <FormSheet
        open={selected !== null}
        title={c('details.bookingTitle')}
        closeLabel={c('details.close')}
        onClose={close}
      >
        {selected ? (
          <BookingDetails
            booking={{ ...selected, title: selected.service }}
            locale={locale}
            busy={busy}
            error={error}
            onStatus={(to) => change(to, c('result.statusChanged'))}
            onAskCancel={() => setSheet('cancel')}
          />
        ) : null}
      </FormSheet>

      <ConfirmSheet
        open={sheet === 'cancel'}
        title={c('cancelSheet.title')}
        confirmLabel={busy ? c('details.working') : c('cancelSheet.confirm')}
        keepLabel={c('cancelSheet.keep')}
        busy={busy}
        onConfirm={() => change('CANCELLED_BY_BUSINESS', c('result.bookingCancelled'))}
        onClose={() => setSheet(null)}
      >
        <p>{c('cancelSheet.body')}</p>
      </ConfirmSheet>
    </div>
  );
}
