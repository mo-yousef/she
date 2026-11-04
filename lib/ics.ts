/**
 * Pure builders for the booking confirmation screen (requirement 3.2): the
 * downloadable .ics (RFC 5545), the Google Calendar template link and the
 * wa.me share link. No I/O. All instants are UTC; rendering to Europe/Nicosia
 * wall-clock happens elsewhere (lib/format-datetime.ts).
 */

export interface CalendarEvent {
  /** Booking reference, e.g. SC-AB234. Makes the UID stable per booking. */
  reference: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  location: string;
  /** PENDING bookings are TENTATIVE until the business confirms. */
  status: 'CONFIRMED' | 'TENTATIVE';
  /** DTSTAMP; injectable for tests. */
  now?: Date;
}

/** 'YYYYMMDDTHHmmssZ' (UTC), the form both iCalendar and Google expect. */
export function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newlines. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line at 75 OCTETS (not characters), never splitting a UTF-8
 * sequence. Continuation lines start with one space (which counts toward 75).
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // the leading space of the continuation takes one octet
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//she.cy//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.reference}@she.cy`,
    `DTSTAMP:${formatUtcStamp(e.now ?? new Date())}`,
    `DTSTART:${formatUtcStamp(e.startsAt)}`,
    `DTEND:${formatUtcStamp(e.endsAt)}`,
    `SUMMARY:${escapeIcsText(e.summary)}`,
    `LOCATION:${escapeIcsText(e.location)}`,
    `DESCRIPTION:${escapeIcsText(e.description)}`,
    `STATUS:${e.status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function buildGoogleCalendarUrl(e: Pick<CalendarEvent, 'startsAt' | 'endsAt' | 'summary' | 'description' | 'location'>): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.summary,
    dates: `${formatUtcStamp(e.startsAt)}/${formatUtcStamp(e.endsAt)}`,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * wa.me share link with a prefilled message. The message is built by the caller
 * from translated text and must NEVER contain the manage token or manage URL:
 * the share goes to third parties.
 */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
