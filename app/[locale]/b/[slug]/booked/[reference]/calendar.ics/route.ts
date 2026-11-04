import { getTranslations } from 'next-intl/server';
import { loadConfirmedBooking, isActiveStatus } from '@/lib/booking-confirmation';
import { buildIcs } from '@/lib/ics';
import { bookingCalendarText } from '@/lib/booking-calendar-text';

export const dynamic = 'force-dynamic';

/**
 * Downloadable .ics. Re-verifies the same manage token (`t`) as the page; every
 * failure is the same bare 404 so a reference's existence is never revealed.
 * Text is generated in the booking's stored locale.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; reference: string }> },
) {
  const { slug, reference } = await params;
  const token = new URL(req.url).searchParams.get('t') ?? undefined;
  const booking = await loadConfirmedBooking({ slug, reference, token });
  if (!booking || !isActiveStatus(booking.status)) return new Response('Not found', { status: 404 });

  const t = await getTranslations({ locale: booking.locale, namespace: 'booked' });
  const text = bookingCalendarText(booking, t);
  const ics = buildIcs({
    reference: booking.reference,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE',
    ...text,
  });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="she-cy-${booking.reference}.ics"`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
}
