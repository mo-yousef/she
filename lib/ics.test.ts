import { describe, it, expect } from 'vitest';
import { buildIcs, buildGoogleCalendarUrl, buildWhatsAppShareUrl, escapeIcsText, foldLine, formatUtcStamp } from './ics';
import { zonedWallTimeToUtc } from './time';

const base = {
  reference: 'SC-AB234',
  summary: 'Haircut, colour; at Salon',
  description: 'Line one\nLine two \\ end',
  location: 'Ledra 1, Nicosia',
  status: 'CONFIRMED' as const,
  now: new Date('2026-01-01T00:00:00Z'),
};

describe('ics builder', () => {
  it('converts Nicosia wall time to UTC across DST (winter +2, summer +3)', () => {
    const winter = zonedWallTimeToUtc('2026-01-15', 10 * 60);
    const summer = zonedWallTimeToUtc('2026-07-15', 10 * 60);
    expect(formatUtcStamp(winter)).toBe('20260115T080000Z');
    expect(formatUtcStamp(summer)).toBe('20260715T070000Z');
    const ics = buildIcs({ ...base, startsAt: summer, endsAt: new Date(summer.getTime() + 3_600_000) });
    expect(ics).toContain('DTSTART:20260715T070000Z');
    expect(ics).toContain('DTEND:20260715T080000Z');
  });

  it('escapes TEXT characters', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('uses CRLF everywhere and a stable UID and status', () => {
    const s = new Date('2026-07-15T07:00:00Z');
    const ics = buildIcs({ ...base, status: 'TENTATIVE', startsAt: s, endsAt: new Date(s.getTime() + 60_000) });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(ics).toContain('UID:SC-AB234@she.cy\r\n');
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
    expect(ics).toContain('SUMMARY:Haircut\\, colour\\; at Salon\r\n');
  });

  it('folds at 75 octets without splitting multibyte characters', () => {
    const long = 'DESCRIPTION:' + 'Ωμέγα'.repeat(30);
    const folded = foldLine(long);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });
});

describe('google link and whatsapp share', () => {
  it('builds a Google template URL with UTC dates', () => {
    const url = new URL(
      buildGoogleCalendarUrl({
        startsAt: new Date('2026-07-15T07:00:00Z'),
        endsAt: new Date('2026-07-15T08:00:00Z'),
        summary: 'Cut & colour',
        description: 'Ref SC-AB234',
        location: 'Nicosia',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20260715T070000Z/20260715T080000Z');
    expect(url.searchParams.get('text')).toBe('Cut & colour');
    expect(url.searchParams.get('location')).toBe('Nicosia');
  });

  it('encodes the WhatsApp message', () => {
    const url = buildWhatsAppShareUrl('Booked: Cut & colour\nSC-AB234');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe('Booked: Cut & colour\nSC-AB234');
  });
});
