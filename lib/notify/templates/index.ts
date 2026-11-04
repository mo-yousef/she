/**
 * Booking message templates (task 5.2). Server-only; no request context needed.
 *
 *   const data = bookingToTemplateData({ ... });
 *   const { subject, html, text } = await renderBookingEmail('reminder-24h', data);
 *   const body = renderBookingPhoneBody('reminder-24h', data);
 *   await notifier.sendEmail({ to, subject, html, text, locale: data.locale, template: 'reminder-24h' });
 *
 * Throws on a missing translation or bad data; callers (sender, cron) catch.
 */
import { render } from '@react-email/render';
import { createElement } from 'react';
import { buildContent, linkFallbackText, safeBrandColour } from './content';
import { BookingLayout } from './layout';
import type { BookingTemplateData, RenderedEmail, TemplateKind } from './types';

export type * from './types';
export { bookingToTemplateData } from './from-booking';

export async function renderBookingEmail(kind: TemplateKind, data: BookingTemplateData): Promise<RenderedEmail> {
  const content = buildContent(kind, data);
  const element = createElement(BookingLayout, {
    locale: data.locale,
    accent: safeBrandColour(data.business.brandColour),
    content,
    linkFallback: content.cta ? linkFallbackText(data.locale, content.cta.url) : null,
  });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: content.subject, html, text };
}

/** Short plain-text body for WhatsApp/SMS. */
export function renderBookingPhoneBody(kind: TemplateKind, data: BookingTemplateData): string {
  return buildContent(kind, data).phone;
}
