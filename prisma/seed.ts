/**
 * Seed data (requirements §11). Resets and repopulates: 6 businesses across
 * Larnaca, Limassol, Nicosia and Paphos, each with 2–3 staff, 3–5 services,
 * varied opening hours, reviews, brand colours and placeholder gallery images,
 * plus demo owner/customer accounts and a few existing bookings so availability
 * looks realistic.
 *
 * Run: pnpm seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { slugify } from '../lib/slug';
import { generateReference } from '../lib/reference';
import { createManageToken } from '../lib/tokens';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { zonedWallTimeToUtc, localDateKey, addDaysToKey } from '../lib/time';

import { galleryFor } from '../lib/stock-photos';
const db = new PrismaClient();

// Placeholder gallery images (picsum, deterministic per seed).
const img = (seed: string) => `https://picsum.photos/seed/${seed}/1200/800`;

type HourSpec = { weekday: number; open: number; close: number; closed?: boolean };
const WD = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// 09:00–18:00 weekdays, 09:00–15:00 Saturday, closed Sunday.
function standardWeek(closedDay = WD.sun): HourSpec[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    if (weekday === closedDay) return { weekday, open: 0, close: 0, closed: true };
    if (weekday === WD.sat) return { weekday, open: 9 * 60, close: 15 * 60 };
    return { weekday, open: 9 * 60, close: 18 * 60 };
  });
}

interface SeedService {
  category: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
}

interface SeedBusiness {
  name: string;
  category: string;
  city: string;
  tagline: string;
  about: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  whatsapp: string;
  instagram: string;
  languages: string[];
  brandPrimary: string;
  brandAccent: string;
  closedDay: number;
  staff: { name: string; role: string }[];
  services: SeedService[];
  reviews: { authorName: string; rating: number; body: string }[];
}

const BUSINESSES: SeedBusiness[] = [
  {
    name: 'Lumière Nail Studio',
    category: 'nails',
    city: 'Larnaca',
    tagline: 'Gel, art and care by the Larnaca seafront.',
    about:
      'A calm nail studio two minutes from Finikoudes beach. We use breathable gels and take our time with every set.',
    address: 'Athinon Ave 42, Larnaca',
    lat: 34.9129,
    lng: 33.6366,
    phone: '+35724000111',
    whatsapp: '+35799000111',
    instagram: 'lumiere.nails.cy',
    languages: ['en', 'el', 'ru'],
    brandPrimary: '#7a3b6a',
    brandAccent: '#d98cc0',
    closedDay: WD.sun,
    staff: [
      { name: 'Maria P.', role: 'Nail artist' },
      { name: 'Elena K.', role: 'Nail technician' },
    ],
    services: [
      {
        category: 'nails',
        name: 'Gel manicure',
        description: 'Shaping, cuticle care and a long-lasting gel colour.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 2500,
      },
      {
        category: 'nails',
        name: 'Gel pedicure',
        description: 'Relaxing foot soak, shaping and gel colour.',
        durationMin: 75,
        bufferMin: 10,
        priceCents: 3200,
      },
      {
        category: 'nails',
        name: 'Nail art set',
        description: 'Full set with hand-painted art of your choice.',
        durationMin: 90,
        bufferMin: 15,
        priceCents: 4500,
      },
    ],
    reviews: [
      { authorName: 'Sophia', rating: 5, body: 'Beautiful work and so relaxing.' },
      { authorName: 'Anna', rating: 4, body: 'Lovely result, lasted three weeks.' },
    ],
  },
  {
    name: 'Flutter Lash Bar',
    category: 'lashes',
    city: 'Limassol',
    tagline: 'Classic to volume lashes in central Limassol.',
    about:
      'Lash specialists trained in Russian volume technique. Comfortable beds, careful isolation, lashes that last.',
    address: 'Anexartisias 18, Limassol',
    lat: 34.6841,
    lng: 33.0379,
    phone: '+35725000222',
    whatsapp: '+35799000222',
    instagram: 'flutter.lash.cy',
    languages: ['en', 'ru'],
    brandPrimary: '#3a4a7a',
    brandAccent: '#8ca0d9',
    closedDay: WD.mon,
    staff: [
      { name: 'Irina V.', role: 'Lead lash artist' },
      { name: 'Katya S.', role: 'Lash artist' },
      { name: 'Despina M.', role: 'Lash artist' },
    ],
    services: [
      {
        category: 'lashes',
        name: 'Classic lash set',
        description: 'One extension per natural lash for a natural look.',
        durationMin: 90,
        bufferMin: 15,
        priceCents: 5000,
      },
      {
        category: 'lashes',
        name: 'Hybrid lash set',
        description: 'A mix of classic and volume for extra texture.',
        durationMin: 105,
        bufferMin: 15,
        priceCents: 6000,
      },
      {
        category: 'lashes',
        name: 'Volume lash set',
        description: 'Fans of fine lashes for a full, soft look.',
        durationMin: 120,
        bufferMin: 15,
        priceCents: 7000,
      },
      {
        category: 'lashes',
        name: 'Lash refill',
        description: 'Top-up within three weeks of a full set.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 3500,
      },
    ],
    reviews: [
      { authorName: 'Olga', rating: 5, body: 'The most careful lash artist I have been to.' },
      { authorName: 'Marina', rating: 5, body: 'Perfect volume set, very natural.' },
      { authorName: 'Chloe', rating: 4, body: 'Great work, parking is tricky.' },
    ],
  },
  {
    name: 'Atelier Hair Nicosia',
    category: 'hair',
    city: 'Nicosia',
    tagline: 'Cut, colour and care in the old town.',
    about:
      'A boutique hair atelier inside the Venetian walls. Colour specialists with a quiet, unhurried approach.',
    address: 'Ledra Street 101, Nicosia',
    lat: 35.1718,
    lng: 33.3626,
    phone: '+35722000333',
    whatsapp: '+35799000333',
    instagram: 'atelier.hair.cy',
    languages: ['en', 'el'],
    brandPrimary: '#2f5e4a',
    brandAccent: '#7fc0a3',
    closedDay: WD.sun,
    staff: [
      { name: 'Andreas L.', role: 'Senior stylist' },
      { name: 'Georgia T.', role: 'Colourist' },
    ],
    services: [
      {
        category: 'hair',
        name: "Women's cut & finish",
        description: 'Consultation, cut and a blow-dry finish.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 3500,
      },
      {
        category: 'hair',
        name: 'Full head colour',
        description: 'Single-process colour with a gloss finish.',
        durationMin: 120,
        bufferMin: 15,
        priceCents: 7500,
      },
      {
        category: 'hair',
        name: 'Balayage',
        description: 'Hand-painted highlights for a lived-in look.',
        durationMin: 180,
        bufferMin: 20,
        priceCents: 12000,
      },
    ],
    reviews: [
      { authorName: 'Elli', rating: 5, body: 'Best balayage I have had in Cyprus.' },
      { authorName: 'Nadia', rating: 4, body: 'Lovely colour, a little pricey.' },
    ],
  },
  {
    name: 'Rouge Makeup Artistry',
    category: 'makeup',
    city: 'Paphos',
    tagline: 'Bridal and event makeup in Paphos.',
    about:
      'On-location and studio makeup for weddings, shoots and special occasions. Long-wear, photo-ready finishes.',
    address: 'Poseidonos Ave 5, Paphos',
    lat: 34.7571,
    lng: 32.4119,
    phone: '+35726000444',
    whatsapp: '+35799000444',
    instagram: 'rouge.makeup.cy',
    languages: ['en', 'el', 'ru'],
    brandPrimary: '#8a2d3b',
    brandAccent: '#d98c97',
    closedDay: WD.sun,
    staff: [{ name: 'Christina A.', role: 'Makeup artist' }],
    services: [
      {
        category: 'makeup',
        name: 'Event makeup',
        description: 'Full glam for a night out or celebration.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 5500,
      },
      {
        category: 'makeup',
        name: 'Bridal trial',
        description: 'A full run-through of your wedding-day look.',
        durationMin: 90,
        bufferMin: 15,
        priceCents: 8000,
      },
      {
        category: 'makeup',
        name: 'Bridal day makeup',
        description: 'Your finalised look on the wedding day.',
        durationMin: 90,
        bufferMin: 15,
        priceCents: 15000,
      },
    ],
    reviews: [
      { authorName: 'Maria', rating: 5, body: 'My bridal makeup lasted all night.' },
    ],
  },
  {
    name: 'Glow Facial Studio',
    category: 'facials',
    city: 'Limassol',
    tagline: 'Results-driven skin treatments.',
    about:
      'A skin studio focused on gentle, effective facials. Thorough consultations and honest advice, never a hard sell.',
    address: 'Gladstonos 60, Limassol',
    lat: 34.6786,
    lng: 33.0446,
    phone: '+35725000555',
    whatsapp: '+35799000555',
    instagram: 'glow.skin.cy',
    languages: ['en', 'el'],
    brandPrimary: '#3b6a7a',
    brandAccent: '#43a4c1',
    closedDay: WD.sun,
    staff: [
      { name: 'Natalie R.', role: 'Esthetician' },
      { name: 'Sofia D.', role: 'Skin therapist' },
    ],
    services: [
      {
        category: 'facials',
        name: 'Signature facial',
        description: 'Cleanse, exfoliate, mask and massage for all skin types.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 5000,
      },
      {
        category: 'facials',
        name: 'Deep-cleanse facial',
        description: 'Targeted extraction and clarifying treatment.',
        durationMin: 75,
        bufferMin: 10,
        priceCents: 6000,
      },
      {
        category: 'facials',
        name: 'Hydrating facial',
        description: 'Intensive moisture boost for tired, dry skin.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 5500,
      },
    ],
    reviews: [
      { authorName: 'Eleni', rating: 5, body: 'My skin has never looked better.' },
      { authorName: 'Tatiana', rating: 5, body: 'So relaxing and genuinely effective.' },
      { authorName: 'Rebecca', rating: 4, body: 'Great facial, booking was easy.' },
    ],
  },
  {
    name: 'Blissful Blow-Dry Bar',
    category: 'blowdry',
    city: 'Nicosia',
    tagline: 'Walk out with a perfect blow-dry.',
    about:
      'A dedicated blow-dry bar for a fast, flawless finish. In and out in under an hour, looking your best.',
    address: 'Stasikratous 24, Nicosia',
    lat: 35.1657,
    lng: 33.3644,
    phone: '+35722000666',
    whatsapp: '+35799000666',
    instagram: 'blissful.blowdry.cy',
    languages: ['en', 'el', 'ru'],
    brandPrimary: '#6a4a2f',
    brandAccent: '#d8b788',
    closedDay: WD.mon,
    staff: [
      { name: 'Melina C.', role: 'Stylist' },
      { name: 'Zoe P.', role: 'Stylist' },
    ],
    services: [
      {
        category: 'blowdry',
        name: 'Express blow-dry',
        description: 'A quick, polished finish for short to medium hair.',
        durationMin: 30,
        bufferMin: 5,
        priceCents: 2000,
      },
      {
        category: 'blowdry',
        name: 'Signature blow-dry',
        description: 'Wash, treatment and a long-lasting style.',
        durationMin: 45,
        bufferMin: 10,
        priceCents: 2800,
      },
      {
        category: 'blowdry',
        name: 'Occasion styling',
        description: 'Curls, waves or an updo for a special event.',
        durationMin: 60,
        bufferMin: 10,
        priceCents: 4000,
      },
    ],
    reviews: [
      { authorName: 'Dana', rating: 5, body: 'Fast and gorgeous, my go-to before events.' },
      { authorName: 'Lara', rating: 4, body: 'Lovely blow-dry, friendly staff.' },
    ],
  },
];

async function reset() {
  // Order matters for FK constraints.
  await db.notificationLog.deleteMany();
  await db.review.deleteMany();
  await db.booking.deleteMany();
  await db.block.deleteMany();
  await db.favourite.deleteMany();
  await db.staffService.deleteMany();
  await db.staffHours.deleteMany();
  await db.openingHours.deleteMany();
  await db.closure.deleteMany();
  await db.service.deleteMany();
  await db.serviceTranslation.deleteMany();
  await db.staffMember.deleteMany();
  await db.businessTranslation.deleteMany();
  await db.photo.deleteMany();
  await db.business.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
}

async function main() {
  console.log('Resetting database…');
  await reset();

  // Demo accounts.
  const owner = await db.user.create({
    data: { name: 'Demo Owner', email: 'owner@she.cy', role: 'OWNER', locale: 'en' },
  });
  const customer = await db.user.create({
    data: {
      name: 'Demo Customer',
      email: 'customer@she.cy',
      phone: '+35799123456',
      phoneVerifiedAt: new Date(),
      role: 'CUSTOMER',
      locale: 'en',
    },
  });
  await db.user.create({
    data: { name: 'Platform Admin', email: 'admin@she.cy', role: 'ADMIN', locale: 'en' },
  });

  const today = localDateKey(new Date());
  let createdBookings = 0;

  for (const b of BUSINESSES) {
    const settings = DEFAULT_SETTINGS as unknown as Prisma.InputJsonValue;

    const business = await db.business.create({
      data: {
        slug: slugify(b.name),
        ownerId: owner.id,
        name: b.name,
        tagline: b.tagline,
        about: b.about,
        category: b.category,
        city: b.city,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        phone: b.phone,
        whatsapp: b.whatsapp,
        instagram: b.instagram,
        languages: b.languages,
        brandPrimary: b.brandPrimary,
        brandAccent: b.brandAccent,
        status: 'PUBLISHED',
        settings,
        photos: {
          create: [0, 1, 2, 3].map((i) => ({
            url: galleryFor(b.category)[i]!,
            alt: `${b.name} photo ${i + 1}`,
            sortOrder: i,
          })),
        },
        openingHours: {
          create: standardWeek(b.closedDay).map((h) => ({
            weekday: h.weekday,
            opensMin: h.open,
            closesMin: h.close,
            closed: h.closed ?? false,
          })),
        },
      },
    });

    // Services.
    const services = [];
    for (let i = 0; i < b.services.length; i++) {
      const s = b.services[i]!;
      services.push(
        await db.service.create({
          data: {
            businessId: business.id,
            category: s.category,
            name: s.name,
            description: s.description,
            durationMin: s.durationMin,
            bufferMin: s.bufferMin,
            priceCents: s.priceCents,
            sortOrder: i,
          },
        }),
      );
    }

    // Staff, each eligible for every service.
    const staff = [];
    for (let i = 0; i < b.staff.length; i++) {
      const member = await db.staffMember.create({
        data: {
          businessId: business.id,
          name: b.staff[i]!.name,
          role: b.staff[i]!.role,
          photoUrl: img(`${slugify(b.name)}-staff-${i}`),
          sortOrder: i,
          services: { create: services.map((s) => ({ serviceId: s.id })) },
        },
      });
      staff.push(member);
    }

    // A couple of existing bookings a few days out so availability looks real.
    const firstService = services[0]!;
    const firstStaff = staff[0]!;
    for (const dayOffset of [2, 3]) {
      const dateKey = addDaysToKey(today, dayOffset);
      const startsAt = zonedWallTimeToUtc(dateKey, 11 * 60); // 11:00 local
      const endsAt = new Date(startsAt.getTime() + firstService.durationMin * 60_000);
      const expiresAt = endsAt.getTime() + 1000 * 60 * 60 * 24 * 30;
      const { hash } = createManageToken(`seed-${business.id}-${dayOffset}`, expiresAt);
      await db.booking.create({
        data: {
          reference: generateReference(),
          businessId: business.id,
          serviceId: firstService.id,
          staffId: firstStaff.id,
          customerId: customer.id,
          startsAt,
          endsAt,
          status: 'CONFIRMED',
          priceCents: firstService.priceCents,
          source: 'ONLINE',
          locale: 'en',
          manageTokenHash: hash,
        },
      });
      createdBookings++;
    }

    // Reviews, each linked to a completed past booking (so they are "verified").
    for (let i = 0; i < b.reviews.length; i++) {
      const r = b.reviews[i]!;
      const pastKey = addDaysToKey(today, -(i + 5));
      const startsAt = zonedWallTimeToUtc(pastKey, (10 + i) * 60);
      const endsAt = new Date(startsAt.getTime() + firstService.durationMin * 60_000);
      const expiresAt = endsAt.getTime() + 1000 * 60 * 60 * 24 * 30;
      const { hash } = createManageToken(`seed-rev-${business.id}-${i}`, expiresAt);
      const past = await db.booking.create({
        data: {
          reference: generateReference(),
          businessId: business.id,
          serviceId: firstService.id,
          staffId: staff[i % staff.length]!.id,
          customerId: customer.id,
          startsAt,
          endsAt,
          status: 'COMPLETED',
          priceCents: firstService.priceCents,
          source: 'ONLINE',
          locale: 'en',
          manageTokenHash: hash,
        },
      });
      await db.review.create({
        data: {
          businessId: business.id,
          bookingId: past.id,
          authorName: r.authorName,
          rating: r.rating,
          body: r.body,
          status: 'VISIBLE',
        },
      });
    }

    // Recompute rating aggregate.
    const agg = await db.review.aggregate({
      where: { businessId: business.id, status: { in: ['VISIBLE', 'FLAGGED'] } },
      _avg: { rating: true },
      _count: true,
    });
    await db.business.update({
      where: { id: business.id },
      data: {
        ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        ratingCount: agg._count,
      },
    });

    console.log(`  ✓ ${b.name} (${b.city}) — ${services.length} services, ${staff.length} staff`);
  }

  // Demo customer favourites the first two businesses.
  const firstTwo = await db.business.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
  for (const biz of firstTwo) {
    await db.favourite.create({ data: { userId: customer.id, businessId: biz.id } });
  }

  console.log(
    `\nSeeded ${BUSINESSES.length} businesses, ${createdBookings} upcoming bookings, demo accounts (owner@she.cy / customer@she.cy / admin@she.cy).`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
