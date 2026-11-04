/**
 * Template content as plain data. Both the HTML email and the WhatsApp/SMS body are
 * built from this, so wording lives in one place (messages/*.json, namespace `emails`).
 * Server-only, no request context: works from cron jobs and route handlers.
 */
import { createTranslator } from 'next-intl';
import el from '../../../messages/el.json';
import en from '../../../messages/en.json';
import ru from '../../../messages/ru.json';
import { formatDate, formatTime } from '../../format-datetime';
import { formatPrice } from '../../money';
import type { NotifyLocale } from '../types';
import type { BookingTemplateData, TemplateKind } from './types';

const MESSAGES = { en, el, ru } as const;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function translator(locale: NotifyLocale): Translate {
  return createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: 'emails',
    // A missing key or bad ICU message must fail loudly (caught by the sender), never
    // ship a "emails.confirmed.intro" marker to a customer.
    onError: (e) => {
      throw e;
    },
  }) as unknown as Translate;
}

export interface EmailContent {
  subject: string;
  preheader: string;
  heading: string;
  greeting: string | null;
  intro: string;
  rows: Array<{ label: string; value: string }>;
  cta: { label: string; url: string } | null;
  footer: string;
  /** Short plain-text body for WhatsApp/SMS. */
  phone: string;
}

const SAFE_HEX = /^#[0-9a-f]{6}$/i;
export const DEFAULT_BRAND = '#1d36b6';
export function safeBrandColour(hex: string): string {
  return SAFE_HEX.test(hex) ? hex : DEFAULT_BRAND;
}

/** Absolute, locale-prefixed link. Token (if any) goes in `t`, matching the manage page. */
export function bookingLink(
  d: Pick<BookingTemplateData, 'siteUrl' | 'locale' | 'business' | 'reference'>,
  page: 'manage' | 'review' | 'business',
  token?: string | null,
): string {
  const base = `${d.siteUrl}/${d.locale}/b/${encodeURIComponent(d.business.slug)}`;
  if (page === 'business') return base;
  const path = `${base}/${page}/${d.reference}`;
  return token ? `${path}?t=${encodeURIComponent(token)}` : path;
}

export function buildContent(kind: TemplateKind, d: BookingTemplateData): EmailContent {
  const t = translator(d.locale);
  const isBusiness = d.audience === 'business';
  if (isBusiness && kind !== 'booking-new-business' && kind !== 'booking-rescheduled' && kind !== 'booking-cancelled') {
    throw new Error(`Template ${kind} has no business version`);
  }
  if (!isBusiness && kind === 'booking-new-business') {
    throw new Error('booking-new-business is business-only');
  }

  const date = (iso: string) => t('whenValue', { date: formatDate(iso, d.locale), time: formatTime(iso, d.locale) });
  const when = date(d.startsAt);
  const customer = d.customer.name ?? t('labels.customer');
  const hours = kind === 'reminder-24h' ? 24 : 2;
  const manageUrl = d.manageToken ? bookingLink(d, 'manage', d.manageToken) : null;
  const reviewUrl = d.manageToken ? bookingLink(d, 'review', d.manageToken) : null;
  const values = {
    business: d.business.name,
    service: d.serviceName,
    staff: d.staffName,
    reference: d.reference,
    customer,
    when,
    hours,
    url: manageUrl ?? '',
  };

  // Which `emails.<group>` keys apply, and whether the business-prefixed variants are used.
  let group: string;
  let prefix = '';
  let cta: EmailContent['cta'] = null;
  let subjectKey = 'subject';
  let headingKey = 'heading';
  let introKey = 'intro';
  let phoneKey = 'phone';
  let phoneUrl = manageUrl ?? '';

  switch (kind) {
    case 'booking-confirmed':
      group = d.pending ? 'pending' : 'confirmed';
      if (manageUrl) cta = { label: t('manage'), url: manageUrl };
      break;
    case 'booking-new-business':
      group = 'newBooking';
      if (d.pending) {
        subjectKey = 'subjectPending';
        headingKey = 'headingPending';
        introKey = 'introPending';
        phoneKey = 'phonePending';
      }
      break;
    case 'booking-rescheduled':
      group = 'rescheduled';
      if (isBusiness) prefix = 'business';
      else if (manageUrl) cta = { label: t('manage'), url: manageUrl };
      break;
    case 'booking-cancelled':
      group = 'cancelled';
      if (isBusiness) prefix = 'business';
      else {
        const url = bookingLink(d, 'business');
        cta = { label: t('bookAgain'), url };
        phoneUrl = url;
      }
      break;
    case 'reminder-24h':
    case 'reminder-2h':
      group = 'reminder';
      if (manageUrl) cta = { label: t('manage'), url: manageUrl };
      break;
    case 'review-request':
      group = 'reviewRequest';
      if (reviewUrl) cta = { label: t('reviewRequest.cta'), url: reviewUrl };
      phoneUrl = reviewUrl ?? '';
      break;
  }

  const key = (k: string) => {
    const name = prefix ? `${prefix}${k[0]!.toUpperCase()}${k.slice(1)}` : k;
    return `${group}.${name}`;
  };

  const phone = t(key(phoneKey), { ...values, url: phoneUrl }).trim();

  const rows: EmailContent['rows'] = [];
  const row = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label: t(`labels.${label}`), value });
  };
  if (isBusiness) {
    row('customer', d.customer.name);
    row('phone', d.customer.phone);
    row('email', d.customer.email);
    row('note', d.customer.note);
  }
  row('service', d.serviceName);
  row('staff', d.staffName);
  row('when', when);
  if (kind === 'booking-rescheduled' && d.previousStartsAt) row('previously', date(d.previousStartsAt));
  row('duration', t('durationMin', { count: d.durationMin }));
  row('price', formatPrice(d.priceCents, d.locale));
  if (!isBusiness) row('where', d.business.address);
  row('reference', d.reference);

  return {
    subject: t(key(subjectKey), values),
    preheader: t(key('preheader'), values),
    heading: t(key(headingKey), values),
    greeting: isBusiness ? null : d.customer.name ? t('greeting', { name: d.customer.name }) : t('greetingNoName'),
    intro: t(key(introKey), values),
    rows,
    cta,
    footer: t(isBusiness ? 'footerBusiness' : 'footer', values),
    phone,
  };
}

export function linkFallbackText(locale: NotifyLocale, url: string): string {
  return translator(locale)('linkFallback', { url });
}
