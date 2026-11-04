import type { ConfirmedBooking } from './booking-confirmation';

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * Summary / description / location shared by the .ics file and the Google link,
 * so both carry the same text. `t` is the `booked` namespace in the booking's locale.
 */
export function bookingCalendarText(
  b: Pick<ConfirmedBooking, 'reference' | 'service' | 'staff' | 'business'>,
  t: Translate,
) {
  return {
    summary: t('icsSummary', { service: b.service.name, business: b.business.name }),
    description: t('icsDescription', { reference: b.reference, staff: b.staff.name }),
    location: [b.business.name, b.business.address, b.business.city].filter(Boolean).join(', '),
  };
}
