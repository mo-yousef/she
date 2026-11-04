import { describe, it, expect } from 'vitest';
import {
  buildBusinessJsonLd,
  serializeJsonLd,
  languageAlternates,
  minutesToHHMM,
  type BusinessJsonLdInput,
} from './seo';

const base: BusinessJsonLdInput = {
  slug: 'rose-studio',
  name: 'Rose Studio',
  category: 'hair',
  city: 'Larnaca',
  ratingAvg: 4.66,
  ratingCount: 12,
  lat: 34.9,
  lng: 33.6,
  openingHours: [
    { weekday: 0, opensMin: 0, closesMin: 0, closed: true },
    { weekday: 1, opensMin: 9 * 60, closesMin: 18 * 60 + 30, closed: false },
  ],
};

describe('buildBusinessJsonLd', () => {
  it('omits aggregateRating when there are no reviews', () => {
    const ld = buildBusinessJsonLd({ ...base, ratingCount: 0, ratingAvg: 0 }, 'en');
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(buildBusinessJsonLd(base, 'en')).toHaveProperty('aggregateRating.ratingValue', 4.7);
  });

  it('skips closed days and formats HH:MM', () => {
    const ld = buildBusinessJsonLd(base, 'en');
    expect(ld.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '09:00', closes: '18:30' },
    ]);
    expect(minutesToHHMM(1440)).toBe('23:59');
  });

  it('includes geo only when coordinates exist, and uses the locale URL', () => {
    expect(buildBusinessJsonLd({ ...base, lat: null }, 'el')).not.toHaveProperty('geo');
    expect(buildBusinessJsonLd(base, 'el').url).toMatch(/\/el\/b\/rose-studio$/);
    expect(buildBusinessJsonLd(base, 'en')['@type']).toBe('HairSalon');
  });

  it('escapes < so business text cannot close the script tag', () => {
    const out = serializeJsonLd(buildBusinessJsonLd({ ...base, name: '</script><b>x' }, 'en'));
    expect(out).not.toContain('<');
    expect(JSON.parse(out).name).toBe('</script><b>x');
  });
});

describe('languageAlternates', () => {
  it('lists en/el/ru and x-default = en', () => {
    const a = languageAlternates('/b/x');
    expect(Object.keys(a).sort()).toEqual(['el', 'en', 'ru', 'x-default']);
    expect(a['x-default']).toBe(a.en);
  });
});
