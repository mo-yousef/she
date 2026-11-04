import { describe, expect, it } from 'vitest';
import { bookingToTemplateData, renderBookingEmail, renderBookingPhoneBody } from '.';
import type { BookingTemplateData, TemplateKind } from '.';
import { toNotifyLocale } from './from-booking';

/** Validates: Requirements 6, 8 */
const LOCALES = ['en', 'el', 'ru'] as const;
const KINDS: TemplateKind[] = [
  'booking-confirmed',
  'booking-new-business',
  'booking-rescheduled',
  'booking-cancelled',
  'reminder-24h',
  'reminder-2h',
  'review-request',
];
const BUSINESS_KINDS: TemplateKind[] = ['booking-new-business', 'booking-rescheduled', 'booking-cancelled'];

// 10:00 in Nicosia on a summer day (EEST, UTC+3) is 07:00Z. Winter 10:00 (EET) is 08:00Z.
const SUMMER_10_NICOSIA = new Date('2026-07-15T07:00:00Z');
const WINTER_10_NICOSIA = new Date('2026-01-15T08:00:00Z');

function data(over: Partial<BookingTemplateData> = {}): BookingTemplateData {
  const built = bookingToTemplateData(
    {
      booking: {
        reference: 'SC-AB12C',
        status: 'CONFIRMED',
        startsAt: SUMMER_10_NICOSIA,
        priceCents: 4550,
        guestName: 'Maria',
        guestPhone: '+35799123456',
        guestEmail: 'maria@example.com',
        note: null,
      },
      business: { name: 'Lotus Studio', slug: 'lotus', address: '12 Ledra St', city: 'Nicosia', brandPrimary: '#b04a7a' },
      service: { name: 'Gel manicure', durationMin: 45 },
      staff: { name: 'Eleni' },
    },
    { audience: 'customer', locale: 'en', manageToken: 'tok123.sig', siteUrl: 'https://she.cy' },
  );
  return { ...built, ...over };
}

const forKind = (kind: TemplateKind, locale: (typeof LOCALES)[number], over: Partial<BookingTemplateData> = {}) =>
  data({
    locale,
    audience: kind === 'booking-new-business' ? 'business' : 'customer',
    previousStartsAt: '2026-07-14T07:00:00.000Z',
    ...over,
  });

describe('templates render for every kind and locale', () => {
  for (const locale of LOCALES) {
    for (const kind of KINDS) {
      it(`${kind} / ${locale}`, async () => {
        const d = forKind(kind, locale);
        const email = await renderBookingEmail(kind, d);
        const phone = renderBookingPhoneBody(kind, d);
        for (const out of [email.subject, email.html, email.text, phone]) {
          // No untranslated ICU placeholders or next-intl key markers.
          expect(out).not.toMatch(/\{[a-zA-Z]+(,[^}]*)?\}/);
          expect(out).not.toMatch(/emails\.[a-zA-Z.]+/);
          expect(out).not.toContain('undefined');
        }
        expect(email.html).toMatch(new RegExp(`<html[^>]*lang="${locale}"`));
        expect(email.html).toMatch(/<html[^>]*dir="ltr"/);
        expect(email.text).toContain('SC-AB12C');
      });
    }
  }

  it('renders the business versions of reschedule and cancel in each locale', async () => {
    for (const locale of LOCALES) {
      for (const kind of ['booking-rescheduled', 'booking-cancelled'] as const) {
        const d = data({ locale, audience: 'business', manageToken: null, previousStartsAt: '2026-07-14T07:00:00.000Z' });
        const email = await renderBookingEmail(kind, d);
        const customerEmail = await renderBookingEmail(kind, { ...d, audience: 'customer' });
        expect(email.subject).not.toBe(customerEmail.subject);
        expect(email.subject).toContain('Maria');
      }
    }
  });
});

describe('subjects', () => {
  it('are localised', async () => {
    const subjects = await Promise.all(
      LOCALES.map(async (l) => (await renderBookingEmail('booking-confirmed', data({ locale: l }))).subject),
    );
    expect(new Set(subjects).size).toBe(3);
    expect(subjects[0]).toBe('Booking confirmed: Gel manicure at Lotus Studio');
    expect(subjects[1]).toMatch(/[Α-Ωα-ω]/);
    expect(subjects[2]).toMatch(/[А-Яа-я]/);
  });

  it('use ICU plurals for the reminder hours in each locale', async () => {
    const s = async (kind: TemplateKind, l: (typeof LOCALES)[number]) =>
      (await renderBookingEmail(kind, data({ locale: l }))).subject;
    expect(await s('reminder-24h', 'en')).toContain('24 hours');
    expect(await s('reminder-2h', 'en')).toContain('2 hours');
    expect(await s('reminder-24h', 'el')).toContain('24 ώρες');
    expect(await s('reminder-24h', 'ru')).toContain('24 часа');
    expect(await s('reminder-2h', 'ru')).toContain('2 часа');
  });
});

describe('pending vs confirmed', () => {
  it('uses "request received" wording for PENDING in every locale', async () => {
    for (const locale of LOCALES) {
      const confirmed = await renderBookingEmail('booking-confirmed', data({ locale }));
      const pending = await renderBookingEmail('booking-confirmed', data({ locale, pending: true }));
      expect(pending.subject).not.toBe(confirmed.subject);
      expect(pending.text).not.toBe(confirmed.text);
      expect(renderBookingPhoneBody('booking-confirmed', data({ locale, pending: true }))).not.toBe(
        renderBookingPhoneBody('booking-confirmed', data({ locale })),
      );
    }
    const en = await renderBookingEmail('booking-confirmed', data({ pending: true }));
    expect(en.subject).toContain('Request received');
    expect(en.text).not.toMatch(/is confirmed/);
  });

  it('tells the business when a request needs review', async () => {
    const d = data({ audience: 'business', pending: true, manageToken: null });
    expect((await renderBookingEmail('booking-new-business', d)).subject).toContain('request');
  });
});

describe('dates are shown in Europe/Nicosia', () => {
  it('summer 10:00 Nicosia shows 10:00 (not 07:00 UTC) in each locale', async () => {
    for (const locale of LOCALES) {
      const e = await renderBookingEmail('booking-confirmed', data({ locale }));
      expect(e.text).toContain('10:00');
      expect(e.text).not.toContain('07:00');
    }
  });

  it('winter 10:00 Nicosia shows 10:00 too', async () => {
    const d = data({ startsAt: WINTER_10_NICOSIA.toISOString() });
    expect((await renderBookingEmail('booking-confirmed', d)).text).toContain('10:00');
  });

  it('formats date and price per locale', async () => {
    const en = (await renderBookingEmail('booking-confirmed', data({ locale: 'en' }))).text;
    const ru = (await renderBookingEmail('booking-confirmed', data({ locale: 'ru' }))).text;
    expect(en).toContain('15 July 2026');
    expect(en).toContain('€45.50');
    expect(ru).toContain('июля 2026');
    expect(ru).toMatch(/45,50\s€/);
  });
});

describe('links and the plain-text bodies', () => {
  it('phone body and email text carry the reference and the locale-prefixed manage link', async () => {
    const url = 'https://she.cy/el/b/lotus/manage/SC-AB12C?t=tok123.sig';
    const d = data({ locale: 'el' });
    expect(renderBookingPhoneBody('booking-confirmed', d)).toContain(`SC-AB12C`);
    expect(renderBookingPhoneBody('booking-confirmed', d)).toContain(url);
    expect((await renderBookingEmail('booking-confirmed', d)).text).toContain(url);
  });

  it('review request links to the review route contract', async () => {
    const d = data({ locale: 'en' });
    const url = 'https://she.cy/en/b/lotus/review/SC-AB12C?t=tok123.sig';
    expect(renderBookingPhoneBody('review-request', d)).toContain(url);
    expect((await renderBookingEmail('review-request', d)).html).toContain(url);
  });

  it('cancelled notice links back to the business, not to a dead manage link', () => {
    const body = renderBookingPhoneBody('booking-cancelled', data());
    expect(body).not.toContain('manage');
  });

  it('business messages never contain a manage link or token', async () => {
    const d = data({ audience: 'business', manageToken: null });
    for (const kind of BUSINESS_KINDS) {
      const e = await renderBookingEmail(kind, d);
      expect(e.html + e.text + renderBookingPhoneBody(kind, d)).not.toMatch(/\/manage\/|tok123/);
    }
  });

  it('business copy includes customer contact details, customer copy does not show others', async () => {
    const biz = await renderBookingEmail('booking-new-business', data({ audience: 'business', manageToken: null }));
    expect(biz.text).toContain('maria@example.com');
    expect(biz.text).toContain('+35799123456');
  });
});

describe('locale selection', () => {
  it('business notice uses the owner locale, customer notice the booking locale', async () => {
    const customer = await renderBookingEmail('booking-confirmed', data({ locale: 'ru' }));
    const owner = await renderBookingEmail('booking-new-business', data({ locale: 'en', audience: 'business', manageToken: null }));
    expect(customer.html).toContain('lang="ru"');
    expect(owner.html).toContain('lang="en"');
    expect(owner.subject).toMatch(/^New booking/);
  });

  it('unknown locales fall back to English', () => {
    expect(toNotifyLocale('fr')).toBe('en');
    expect(toNotifyLocale(null)).toBe('en');
    expect(toNotifyLocale('ru')).toBe('ru');
  });

  it('rejects mixing audiences and kinds', async () => {
    await expect(renderBookingEmail('reminder-2h', data({ audience: 'business' }))).rejects.toThrow();
    await expect(renderBookingEmail('booking-new-business', data())).rejects.toThrow();
  });
});

describe('escaping and safety', () => {
  it('escapes user-provided strings in the HTML', async () => {
    const evil = '<script>alert(1)</script>';
    const d = data({
      audience: 'business',
      manageToken: null,
      serviceName: evil,
      staffName: evil,
      customer: { name: evil, phone: null, email: null, note: evil },
    });
    const e = await renderBookingEmail('booking-new-business', d);
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
  });

  it('falls back to the platform colour for an invalid brand colour', async () => {
    const e = await renderBookingEmail('booking-confirmed', data({ business: { ...data().business, brandColour: 'red;}</style><script>' } }));
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('#4a2c6d');
  });

  it('sets no remote images or tracking pixels', async () => {
    const e = await renderBookingEmail('booking-confirmed', data());
    expect(e.html).not.toMatch(/<img/i);
  });
});
