import { Clock3, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ConfirmedBooking } from '@/lib/booking-confirmation';
import { formatSlot } from '@/lib/format-datetime';
import { formatPrice } from '@/lib/money';

/**
 * Booking summary list shared by the confirmation and manage pages (server
 * component, `booked` namespace) so the two never drift apart.
 */
export async function BookingSummary({
  booking,
  locale,
}: {
  booking: ConfirmedBooking;
  locale: string;
}) {
  const t = await getTranslations('booked');
  return (
    <dl className="divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
      <Row label={t('service')} value={booking.service.name} />
      <Row label={t('staff')} value={booking.staff.name} />
      <Row
        label={t('when')}
        value={formatSlot(booking.startsAt.toISOString(), locale)}
        icon={<Clock3 className="h-4 w-4" aria-hidden />}
      />
      <Row
        label={t('duration')}
        value={t('durationMin', { count: String(booking.service.durationMin) })}
      />
      <Row label={t('price')} value={formatPrice(booking.priceCents, locale)} />
      <Row
        label={t('where')}
        value={[booking.business.name, booking.business.address]
          .filter(Boolean)
          .join(', ')}
        icon={<MapPin className="h-4 w-4" aria-hidden />}
      />
    </dl>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <dt className="flex items-center gap-1.5 text-[color:var(--label-secondary)]">
        {icon}
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
