/**
 * Accessibility pass (task 8.1, AC9, AC11). axe-core (wcag2a, wcag2aa, wcag21aa, wcag22aa) on a
 * key-page set in light and dark at 1440x900, mobile 360x800 light for four pages, plus a 200%
 * text check (no horizontal overflow, buttons not clipped). Serious/critical violations fail.
 * Results of this run are summarised in docs/a11y-report.md.
 */
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { db } from '../lib/db';
import { manageTokenFor } from '../lib/booking';
import { signInAs } from './auth';
import { randomPhone } from './fixtures';
import { createOwnerFixture, gotoReady, type OwnerFx } from './owner-helpers';
import { en } from './messages';

test.describe.configure({ mode: 'serial' });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
type Scheme = 'light' | 'dark';
type Who = 'anon' | 'owner' | 'admin';

let fx: OwnerFx;
let adminId: string;
let bookingRef: string;
let token: string;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 360, height: 800 };

test.beforeAll(async () => {
  fx = await createOwnerFixture(1);
  adminId = (await db.user.create({ data: { email: `a11y-${randomUUID().slice(0, 8)}@e2e.test`, name: 'E2E Admin', role: 'ADMIN' } })).id;
  const id = randomUUID();
  const startsAt = new Date(fx.slotIso);
  const endsAt = new Date(startsAt.getTime() + 3_600_000);
  const t = manageTokenFor(id, endsAt);
  token = encodeURIComponent(t.token);
  bookingRef = `SC-${randomUUID().slice(0, 5).toUpperCase()}`;
  await db.booking.create({
    data: {
      id, reference: bookingRef, businessId: fx.businessId, serviceId: fx.serviceId, staffId: fx.staffIds[0]!,
      guestName: 'A11y Guest', guestPhone: randomPhone(), guestEmail: 'a11y@e2e.test',
      startsAt, endsAt, status: 'CONFIRMED', priceCents: 3000, manageTokenHash: t.hash,
    },
  });
});

test.afterAll(async () => {
  await fx.cleanupAll();
  await db.user.deleteMany({ where: { id: adminId } });
});

async function ctx(browser: Browser, scheme: Scheme, who: Who, size = DESKTOP): Promise<BrowserContext> {
  const context = await browser.newContext({ colorScheme: scheme, viewport: size });
  if (who === 'owner') await signInAs(context, fx.ownerId);
  if (who === 'admin') await signInAs(context, adminId);
  return context;
}

interface Target {
  name: string;
  who: Who;
  url: () => string;
  /** Extra setup after load (e.g. open a sheet). */
  prep?: (p: Page) => Promise<void>;
}

const bizUrl = () => `/en/b/${fx.slug}`;
const stepperQs = () =>
  new URLSearchParams({ service: fx.serviceId, staff: fx.staffIds[0]!, date: fx.dateKey, slot: fx.slotIso });

const TARGETS: Target[] = [
  { name: 'home', who: 'anon', url: () => '/en' },
  { name: 'search', who: 'anon', url: () => '/en/search' },
  { name: 'business', who: 'anon', url: bizUrl },
  { name: 'stepper-service', who: 'anon', url: () => `${bizUrl()}/book` },
  { name: 'stepper-datetime', who: 'anon', url: () => `${bizUrl()}/book?${stepperQs()}&step=datetime` },
  { name: 'confirmation', who: 'anon', url: () => `${bizUrl()}/booked/${bookingRef}?t=${token}` },
  { name: 'manage', who: 'anon', url: () => `${bizUrl()}/manage/${bookingRef}?t=${token}` },
  { name: 'account-signed-out', who: 'anon', url: () => '/en/account' },
  { name: 'legal-privacy', who: 'anon', url: () => '/en/legal/privacy' },
  { name: 'dash-overview', who: 'owner', url: () => '/en/dashboard' },
  { name: 'dash-calendar', who: 'owner', url: () => '/en/dashboard/calendar' },
  { name: 'dash-bookings', who: 'owner', url: () => '/en/dashboard/bookings' },
  {
    name: 'dash-services-sheet',
    who: 'owner',
    url: () => '/en/dashboard/services',
    prep: async (p) => {
      await p.getByRole('button', { name: en.services.add }).first().click();
      await p.getByRole('dialog').waitFor();
    },
  },
  { name: 'dash-profile', who: 'owner', url: () => '/en/dashboard/profile' },
  { name: 'admin-overview', who: 'admin', url: () => '/en/admin' },
];

async function load(page: Page, t: Target) {
  await gotoReady(page, t.url(), (p) => p.getByRole('heading').first());
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await t.prep?.(page);
}

async function expectNoBlocking(page: Page, label: string) {
  const res = await new AxeBuilder({ page })
    .withTags(TAGS)
    // Third-party content we do not control: OSM tile images/attribution inside the Leaflet map.
    .exclude('.leaflet-container')
    .analyze();
  const blocking = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map(
    (v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const t of TARGETS) {
    test(`axe ${t.name} ${scheme} 1440`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await ctx(browser, scheme, t.who);
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: scheme });
      await load(page, t);
      await expectNoBlocking(page, `${t.name} ${scheme}`);
      await context.close();
    });
  }
}

const MOBILE_PAGES = ['home', 'business', 'stepper-datetime', 'dash-overview'];
for (const t of TARGETS.filter((x) => MOBILE_PAGES.includes(x.name))) {
  test(`axe ${t.name} light 360`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await ctx(browser, 'light', t.who, MOBILE);
    const page = await context.newPage();
    await load(page, t);
    await expectNoBlocking(page, `${t.name} mobile`);
    await context.close();
  });
}

const ZOOM_PAGES = ['home', 'business', 'stepper-datetime', 'dash-overview'];
for (const size of [DESKTOP, MOBILE]) {
  for (const t of TARGETS.filter((x) => ZOOM_PAGES.includes(x.name))) {
    test(`200% text ${t.name} ${size.width}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await ctx(browser, 'light', t.who, size);
      const page = await context.newPage();
      await load(page, t);
      // The layout is rem-based, so scaling the root size is what the browser text-size setting does.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const clipped: string[] = [];
        document.querySelectorAll('main a[href], main button, header a[href], header button').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return;
          // Inside a horizontal scroller (e.g. the date strip) content may extend; it is reachable by scrolling.
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return;
          }
          if (b.left < -1 || b.right > de.clientWidth + 1) {
            clipped.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(b.left)}..${Math.round(b.right)}`);
          }
        });
        return { sw: de.scrollWidth, cw: de.clientWidth, clipped };
      });
      expect(r.sw, `scrollWidth ${r.sw} > clientWidth ${r.cw}`).toBeLessThanOrEqual(r.cw + 1);
      expect(r.clipped).toEqual([]);
      await context.close();
    });
  }
}

