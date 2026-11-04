import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeAvailability } from '@/lib/availability';
import { loadAvailabilityInput } from '@/lib/booking-availability';
import { parseBookingParams } from '@/lib/booking-params';
import { applicableSteps, furthestStep, resolveStaffId, clampStep } from '@/lib/booking-steps';
import { buildDayGrid, dayWindows } from '@/lib/slot-grid';
import { parseSettings } from '@/lib/settings';
import { localizedService } from '@/lib/localized-service';
import { BookingStepper, type BookingStepperProps } from '@/components/booking/booking-stepper';

// Always fresh: the availability here must never come from the 3-minute next-slot cache.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });
  const b = await db.business.findUnique({ where: { slug }, select: { name: true, status: true } });
  if (!b || b.status !== 'PUBLISHED') {
    const e = await getTranslations({ locale, namespace: 'errors' });
    return { title: e('notFoundTitle'), robots: { index: false } };
  }
  return { title: t('pageTitle', { name: b.name }), robots: { index: false, follow: false } };
}

/**
 * Booking page (requirement 3.1). Server side: loads the published business,
 * sanitises the URL state, computes availability fresh, and hands plain props to
 * the client stepper. The URL is the source of truth for service / staff / date /
 * slot / step, so refresh and back/forward restore the flow.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const raw = parseBookingParams(await searchParams);

  const business = await db.business.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      settings: true,
      services: {
        where: { active: true },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          durationMin: true,
          bufferMin: true,
          priceCents: true,
          translations: { select: { locale: true, name: true, description: true } },
          staffLinks: { select: { staffId: true } },
        },
      },
      staff: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, role: true },
      },
    },
  });
  if (!business || business.status !== 'PUBLISHED') notFound();

  // Which active staff perform which service (StaffService join).
  const activeStaff = new Set(business.staff.map((s) => s.id));
  const staffByService: Record<string, string[]> = {};
  for (const s of business.services) {
    staffByService[s.id] = s.staffLinks.map((l) => l.staffId).filter((id) => activeStaff.has(id));
  }

  // Drop a service/staff that does not belong to this business.
  const service = business.services.find((s) => s.id === raw.serviceId);
  const eligibleIds = service ? staffByService[service.id]! : [];
  const staffId = service ? resolveStaffId(raw.staffId, eligibleIds) : undefined;
  const steps = applicableSteps(service ? eligibleIds.length : undefined);

  // Availability, fresh, only once service + staff are known.
  let stripDays: BookingStepperProps['stripDays'] = [];
  let slots: BookingStepperProps['slots'] = [];
  let date: string | undefined;
  let slot: string | undefined;
  if (service && staffId) {
    const loaded = await loadAvailabilityInput({
      businessId: business.id,
      serviceId: service.id,
      staffId,
      days: raw.days,
    });
    if (loaded) {
      const { input } = loaded;
      const days = computeAvailability(input);
      stripDays = days.map((d) => ({ dateKey: d.dateKey, hasAvailability: d.slots.length > 0 }));
      const open = (k?: string) => (k ? days.find((d) => d.dateKey === k && d.slots.length > 0) : undefined);
      // Unknown or fully-booked date in the URL -> first day that has times.
      const day = open(raw.date) ?? days.find((d) => d.slots.length > 0);
      if (day) {
        date = day.dateKey;
        const scope = input.staffId ? input.staff.filter((s) => s.id === input.staffId) : input.staff;
        const grid = buildDayGrid({
          dateKey: day.dateKey,
          windows: dayWindows({
            dateKey: day.dateKey,
            openingHours: input.openingHours,
            staffHours: scope.map((s) => s.hours),
            staffDaysOff: scope.map((s) => s.daysOff),
            closures: input.closures,
          }),
          durationMin: service.durationMin,
          bufferMin: service.bufferMin,
          stepMin: input.settings.slotIntervalMin,
          available: day.slots.map((s) => s.startsAt),
        });
        slots = grid.map((g) => ({ startsAt: g.startsAt.toISOString(), available: g.available }));
        // A slot that is no longer free is dropped, not trusted.
        if (raw.slot && slots.some((s) => s.available && s.startsAt === raw.slot)) slot = raw.slot;
      }
    }
  }

  // Step: requested, else the furthest the selections allow; details are unknown
  // here (client state), so assume complete and let the client tighten it.
  const flow = { serviceId: service?.id, staffId, slot };
  const step = clampStep(raw.step ?? furthestStep(flow, steps, false), flow, steps, true);

  // Prefill for a signed-in customer (name/email from the account, phone from User).
  const session = await auth();
  const user = session?.user?.id
    ? await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, phone: true },
    })
    : null;

  const settings = parseSettings(business.settings);
  const t = await getTranslations('booking');

  return (
    <div
      className="brand-scope mx-auto max-w-2xl px-4 pb-16 pt-6"
    >
      <BookingStepper
        locale={locale}
        slug={business.slug}
        businessName={business.name}
        services={business.services.map((s) => ({
          id: s.id,
          ...localizedService(s, s.translations, locale),
          durationMin: s.durationMin,
          priceCents: s.priceCents,
        }))}
        staff={business.staff}
        staffByService={staffByService}
        state={{ serviceId: service?.id, staffId, date, slot, step, days: raw.days }}
        stripDays={stripDays}
        slots={slots}
        maxDays={Math.min(60, settings.maxAdvanceDays)}
        prefill={user ? { name: user.name ?? '', email: user.email ?? '', phone: user.phone ?? '' } : null}
        isGuest={!session?.user?.id}
        turnstileSiteKey={process.env.TURNSTILE_SITE_KEY || null}
      />
      <p className="sr-only">{t('timezoneNote')}</p>
    </div>
  );
}
