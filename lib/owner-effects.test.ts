import { describe, expect, it } from 'vitest';
import { routing } from '../i18n/routing';
import { availabilityTag } from './next-slot';
import { revalidateAfterOwnerEdit, type Surface } from './owner-effects';

const biz = { id: 'biz_1', slug: 'my-salon' };

function run(surfaces: Surface[]) {
  const paths: string[] = [];
  const tags: string[] = [];
  revalidateAfterOwnerEdit(
    { business: biz, surfaces },
    { path: (p, t) => paths.push(t ? `${p}#${t}` : p), tag: (t) => tags.push(t) },
  );
  return { paths, tags };
}

describe('revalidateAfterOwnerEdit', () => {
  it('public: page, OG image, home and search for every locale + availability tag', () => {
    const { paths, tags } = run(['public']);
    for (const l of routing.locales) {
      expect(paths).toContain(`/${l}/b/my-salon`);
      expect(paths).toContain(`/${l}/b/my-salon/opengraph-image`);
      expect(paths).toContain(`/${l}`);
      expect(paths).toContain(`/${l}/search`);
    }
    expect(paths).toHaveLength(routing.locales.length * 4);
    expect(tags).toEqual([availabilityTag(biz.id)]);
  });

  it('locales come from routing (en, el, ru)', () => {
    expect([...routing.locales].sort()).toEqual(['el', 'en', 'ru']);
  });

  it('availability only: the tag and nothing else', () => {
    expect(run(['availability'])).toEqual({ paths: [], tags: [availabilityTag(biz.id)] });
  });

  it('booking-level combination touches no public path', () => {
    const { paths, tags } = run(['availability', 'calendar', 'bookings']);
    expect(paths).toEqual(['/[locale]/dashboard/calendar#page', '/[locale]/dashboard/bookings#page']);
    expect(tags).toEqual([availabilityTag(biz.id)]);
  });

  it('dashboard-only surfaces do not touch public paths or tags', () => {
    expect(run(['reviews'])).toEqual({ paths: ['/[locale]/dashboard/reviews#page'], tags: [] });
  });

  it('overview revalidates the dashboard layout; availability is not duplicated with public', () => {
    const { paths, tags } = run(['public', 'availability', 'profile', 'overview']);
    expect(paths).toContain('/[locale]/dashboard/profile#page');
    expect(paths).toContain('/[locale]/dashboard#layout');
    expect(tags).toEqual([availabilityTag(biz.id)]);
  });

  it('every dashboard surface maps to its own page', () => {
    for (const s of ['calendar', 'bookings', 'services', 'team', 'hours', 'profile', 'reviews', 'settings'] as const) {
      expect(run([s]).paths).toEqual([`/[locale]/dashboard/${s}#page`]);
    }
  });
});
