/**
 * Shared, token-gated booking lookup for the confirmation page and its .ics route
 * (requirement 3.2). Server-only.
 *
 * Returns null for EVERY failure (bad params, unknown reference, wrong business,
 * missing/invalid/expired token) so callers answer 404 with no distinction and
 * never reveal whether a reference exists.
 */
import { z } from 'zod';
import { db } from './db';
import { verifyManageToken } from './tokens';

const paramsSchema = z.object({
  slug: z.string().min(1).max(80),
  reference: z.string().regex(/^SC-[A-Z0-9]{5}$/),
  token: z.string().min(1).max(200),
});

export async function loadConfirmedBooking(input: { slug: string; reference: string; token: string | undefined }) {
  const parsed = paramsSchema.safeParse(input);
  if (!parsed.success) return null;
  const { slug, reference, token } = parsed.data;

  const booking = await db.booking.findFirst({
    where: { reference, business: { slug } },
    select: {
      id: true,
      businessId: true,
      serviceId: true,
      staffId: true,
      reference: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceCents: true,
      locale: true,
      manageTokenHash: true,
      guestName: true,
      service: { select: { name: true, durationMin: true } },
      staff: { select: { name: true } },
      business: {
        select: {
          name: true,
          slug: true,
          status: true,
          address: true,
          city: true,
          phone: true,
          whatsapp: true,
          settings: true,
          brandPrimary: true,
          brandAccent: true,
        },
      },
    },
  });
  if (!booking) return null;
  if (!verifyManageToken(token, booking.manageTokenHash)) return null;
  return booking;
}

export type ConfirmedBooking = NonNullable<Awaited<ReturnType<typeof loadConfirmedBooking>>>;

/** Active bookings only get calendar/share actions. */
export function isActiveStatus(status: string): status is 'PENDING' | 'CONFIRMED' {
  return status === 'PENDING' || status === 'CONFIRMED';
}
