/**
 * Design audit helper (task 6.11). SKIPPED unless AUDIT_SHOTS=1, so `pnpm test:e2e` is
 * unaffected. Signs in a richly populated owner and captures every Phase 6 page at three
 * viewports in light and dark, plus key states, into test-results/audit/ (gitignored).
 * Also writes per-page findings JSON: text-contrast pairs below WCAG AA (computed from the
 * rendered colours, transparent backgrounds resolved up the tree), interactive targets
 * smaller than 44px, horizontal overflow, and an ARIA snapshot of the main region.
 *
 *   AUDIT_SHOTS=1 E2E_DATABASE_URL=postgresql://user@localhost:5432/she_cy_test?schema=public \
 *     pnpm exec playwright test e2e/design-audit-screenshots.spec.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test, type Page, type BrowserContext } from '@playwright/test';
import { db } from '../lib/db';
import { signInAs } from './auth';
import { createOwnerFixture, createUser, gotoReady, TINY_PNG, type OwnerFx } from './owner-helpers';
import { en } from './messages';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from '../lib/time';
import { contrastRatio } from '../lib/contrast';

const OUT = 'test-results/audit';
const VIEWPORTS = [
  { name: '360', width: 360, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;
const PAGES: [string, string][] = [
  ['overview', 'dashboard'],
  ['calendar', 'dashboard/calendar'],
  ['bookings', 'dashboard/bookings'],
  ['services', 'dashboard/services'],
  ['team', 'dashboard/team'],
  ['hours', 'dashboard/hours'],
  ['profile', 'dashboard/profile'],
  ['reviews', 'dashboard/reviews'],
  ['settings', 'dashboard/settings'],
];

test.skip(!process.env.AUDIT_SHOTS, 'design audit helper: set AUDIT_SHOTS=1');
test.describe.configure({ mode: 'serial' });

const findings: Record<string, unknown> = {};

/** Runs inside the page: raw data only; ratios are computed in Node with lib/contrast.ts. */
async function scan(page: Page) {
  return page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    const rgba = (c: string): [number, number, number, number] => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const visible = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const bgOf = (el: Element): { rgb: [number, number, number]; image: boolean } => {
      const layers: [number, number, number, number][] = [];
      let image = false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.backgroundImage !== 'none') image = true;
        const c = rgba(s.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let out: [number, number, number] = [255, 255, 255];
      const root = rgba(getComputedStyle(document.documentElement).backgroundColor);
      if (root[3] > 0 && !layers.length) out = [root[0], root[1], root[2]];
      for (const l of layers.reverse()) out = [0, 1, 2].map((i) => l[i]! * l[3] + out[i]! * (1 - l[3])) as [number, number, number];
      return { rgb: out, image };
    };
    const path = (el: Element) => {
      const t = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      return `${t}${id}${cls ? '.' + cls : ''}`;
    };
    const text: unknown[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim()) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      if (!visible(el)) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const fg = rgba(s.color);
      const bg = bgOf(el);
      const op = (() => {
        let o = 1;
        for (let m: Element | null = el; m; m = m.parentElement) o *= Number(getComputedStyle(m).opacity);
        return o;
      })();
      const f = [0, 1, 2].map((i) => fg[i]! * fg[3] * op + bg.rgb[i]! * (1 - fg[3] * op));
      text.push({
        sel: path(el),
        txt: n.textContent.trim().slice(0, 40),
        fg: f.map(Math.round),
        bg: bg.rgb.map(Math.round),
        px: parseFloat(s.fontSize),
        bold: parseInt(s.fontWeight, 10) >= 700,
        image: bg.image,
        disabled: (el as HTMLButtonElement).disabled === true || el.closest('[disabled],[aria-disabled=true]') !== null,
      });
    }
    const small: unknown[] = [];
    document
      .querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],[role=checkbox],summary')
      .forEach((el) => {
        if (!visible(el)) return;
        const r = el.getBoundingClientRect();
        const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
        if ((r.height < 43.5 || r.width < 43.5) && !inline) {
          const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
          small.push({ sel: path(el), label, w: Math.round(r.width), h: Math.round(r.height), type: el.getAttribute('type') });
        }
      });
    const de = document.documentElement;
    // Elements that stick out of the viewport and are not inside a scroll container.
    const wide: string[] = [];
    if (de.scrollWidth > de.clientWidth + 1) {
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right <= de.clientWidth + 1 || r.width === 0 || getComputedStyle(el).display === 'none') return;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'hidden' || o === 'scroll') return;
        }
        if (wide.length < 6) wide.push(`${path(el)} right=${Math.round(r.right)}`);
      });
    }
    return {
      wide,
      text,
      small,
      overflowX: de.scrollWidth > de.clientWidth + 1,
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
    };
  });
}

type TextItem = { sel: string; txt: string; fg: number[]; bg: number[]; px: number; bold: boolean; image: boolean; disabled: boolean };
const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

async function capture(page: Page, key: string, opts: { aria?: boolean; full?: boolean } = {}) {
  const s = await scan(page);
  const low = (s.text as TextItem[])
    .map((t) => {
      const large = t.px >= 24 || (t.px >= 18.66 && t.bold);
      const ratio = contrastRatio(hex(t.fg), hex(t.bg));
      return { ...t, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5 };
    })
    .filter((t) => t.ratio < t.need);
  findings[key] = { low, small: s.small, overflowX: s.overflowX, wide: s.wide, scrollW: s.scrollW, clientW: s.clientW };
  await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: opts.full ?? true });
  if (opts.aria) {
    const snap = await page.locator('body').ariaSnapshot().catch(() => 'n/a');
    writeFileSync(`${OUT}/${key}.aria.txt`, snap);
  }
}

async function ready(page: Page, url: string, zoom = false) {
  await gotoReady(page, url, (p) => p.getByRole('heading').first());
  // 200% text: the layout is rem-based, so scaling the root font size is what the browser's text-size setting does.
  if (zoom) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function seedRich(): Promise<OwnerFx> {
  const fx = await createOwnerFixture(2);
  const b = fx.businessId;
  await db.business.update({
    where: { id: b },
    data: {
      name: 'Aphrodite Nails & Beauty Studio Larnaca',
      tagline: 'Gel, acrylics and nail art by the sea',
      about: 'A calm studio on the Larnaca seafront.',
      phone: '+35799123456',
      brandPrimary: '#7a2e5a',
      brandAccent: '#e7b4d0',
    },
  });
  await db.businessTranslation.create({ data: { businessId: b, locale: 'el', tagline: 'Τζελ και nail art δίπλα στη θάλασσα', about: 'Ένα ήρεμο στούντιο.' } });
  await db.photo.createMany({
    data: [
      { businessId: b, url: TINY_PNG, alt: 'Reception', sortOrder: 1 },
      { businessId: b, url: TINY_PNG, alt: 'Nail station', sortOrder: 2 },
      { businessId: b, url: TINY_PNG, alt: '', sortOrder: 3 },
    ],
  });
  const svc2 = await db.service.create({ data: { businessId: b, category: 'nails', name: 'Gel polish with extended nail art design', durationMin: 90, priceCents: 4500, bufferMin: 10, sortOrder: 1 } });
  const svc3 = await db.service.create({ data: { businessId: b, category: 'nails', name: 'Pedicure', durationMin: 45, priceCents: 0, active: false, sortOrder: 2 } });
  for (const s of fx.staffIds) await db.staffService.create({ data: { staffId: s, serviceId: svc2.id } });
  void svc3;
  await db.staffMember.update({ where: { id: fx.staffIds[1]! }, data: { name: 'Eleftheria Papadopoulou-Georgiou', role: 'Senior nail artist' } });
  await db.staffHours.create({ data: { staffId: fx.staffIds[1]!, weekday: 1, opensMin: 600, closesMin: 900 } });
  const today = localDateKey(new Date(), BUSINESS_TZ);
  await db.closure.create({ data: { businessId: b, fromDate: addDaysToKey(today, 9), toDate: addDaysToKey(today, 11), reason: 'Easter holiday' } });
  await db.staffDayOff.create({ data: { staffId: fx.staffIds[1]!, fromDate: addDaysToKey(today, 4), toDate: addDaysToKey(today, 5), reason: 'Training' } });
  await db.block.create({
    data: { businessId: b, staffId: fx.staffIds[0]!, startsAt: zonedWallTimeToUtc(today, 14 * 60), endsAt: zonedWallTimeToUtc(today, 15 * 60), reason: 'Supplier visit' },
  });
  const mk = async (dayOff: number, startMin: number, status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED_BY_CUSTOMER' | 'NO_SHOW', name: string, svc = fx.serviceId, staff = fx.staffIds[0]!, durationMin = 60) => {
    const d = addDaysToKey(today, dayOff);
    return db.booking.create({
      data: {
        reference: `SC-${randomUUID().slice(0, 5).toUpperCase()}`,
        businessId: b, serviceId: svc, staffId: staff, guestName: name, guestPhone: '+35799123456', guestEmail: 'x@e2e.test',
        startsAt: zonedWallTimeToUtc(d, startMin), endsAt: zonedWallTimeToUtc(d, startMin + durationMin),
        status, priceCents: 3000, manageTokenHash: 'x', source: 'ONLINE',
      },
    });
  };
  await mk(0, 10 * 60, 'CONFIRMED', 'Maria Constantinou');
  await mk(0, 11 * 60 + 30, 'PENDING', 'Katerina Ioannou-Christodoulou', svc2.id, fx.staffIds[1]!, 90);
  await mk(1, 10 * 60, 'PENDING', 'Elena Petrou');
  await mk(2, 13 * 60, 'CONFIRMED', 'Anna Smith');
  await mk(-1, 12 * 60, 'CANCELLED_BY_CUSTOMER', 'Sofia Demetriou');
  await mk(-3, 12 * 60, 'NO_SHOW', 'Irene Kyriacou');
  const c1 = await mk(-2, 10 * 60, 'COMPLETED', 'Olga Ivanova');
  const c2 = await mk(-4, 10 * 60, 'COMPLETED', 'Christina Michael');
  const c3 = await mk(-5, 10 * 60, 'COMPLETED', 'Dimitra Andreou');
  await db.review.create({ data: { businessId: b, bookingId: c1.id, authorName: 'Olga I.', rating: 5, body: 'Lovely studio, the gel lasted three weeks. Will book again.' } });
  await db.review.create({ data: { businessId: b, bookingId: c2.id, authorName: 'Christina M.', rating: 2, body: 'Waited 25 minutes past my time.', ownerReply: 'Sorry about the wait, we had a late booking before you. We have added more buffer time.' } });
  await db.review.create({ data: { businessId: b, bookingId: c3.id, authorName: 'Dimitra A.', rating: 4, body: 'Good work.', status: 'FLAGGED' } });
  await db.business.update({ where: { id: b }, data: { ratingAvg: 3.7, ratingCount: 3 } });
  return fx;
}

let fx: OwnerFx;
let emptyOwnerId: string;
let emptyBizId: string;
let newOwnerId: string;

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  fx = await seedRich();
  // Draft business with nothing in it: empty states + unmet checklist.
  const u = await createUser('OWNER');
  emptyOwnerId = u.id;
  const eb = await db.business.create({
    data: { slug: `e2e-empty-${randomUUID().slice(0, 6)}`, ownerId: u.id, name: 'Empty Draft Studio', category: 'nails', city: 'Paphos', status: 'DRAFT', settings: { autoConfirm: true } },
  });
  emptyBizId = eb.id;
  newOwnerId = (await createUser('OWNER')).id;
});

test.afterAll(async () => {
  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
  await db.business.delete({ where: { id: emptyBizId } }).catch(() => undefined);
  await db.user.deleteMany({ where: { id: { in: [emptyOwnerId, newOwnerId] } } });
  await fx.cleanupAll();
});

async function ctxFor(browser: import('@playwright/test').Browser, scheme: 'light' | 'dark', userId: string | null, extra: { fontScale?: boolean } = {}) {
  const context: BrowserContext = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
  if (userId) await signInAs(context, userId);
  return context;
}

for (const scheme of ['light', 'dark'] as const) {
  test(`rich owner, all pages, ${scheme}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await ctxFor(browser, scheme, fx.ownerId);
    const page = await context.newPage();
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const [name, route] of PAGES) {
        await ready(page, `/en/${route}`);
        await capture(page, `${scheme}-${vp.name}-${name}`, { aria: vp.name === '1440' && scheme === 'light' });
      }
    }
    await context.close();
  });

  test(`empty owner, all pages, ${scheme}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await ctxFor(browser, scheme, emptyOwnerId);
    const page = await context.newPage();
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const [name, route] of PAGES) {
        await ready(page, `/en/${route}`);
        await capture(page, `empty-${scheme}-${vp.name}-${name}`);
      }
    }
    await context.close();
  });

  test(`account, landing, onboarding, ${scheme}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const out = await ctxFor(browser, scheme, null);
    const p1 = await out.newPage();
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      await p1.setViewportSize({ width: vp.width, height: vp.height });
      await ready(p1, '/en/account');
      await capture(p1, `${scheme}-${vp.name}-account-signedout`, { aria: scheme === 'light' });
      await p1.getByLabel(en.account.emailLabel).fill('a@b');
      await p1.getByRole('button', { name: en.account.emailSubmit }).click();
      await p1.getByRole('alert').first().waitFor();
      await capture(p1, `${scheme}-${vp.name}-account-error`);
      await ready(p1, '/en/for-business');
      await capture(p1, `${scheme}-${vp.name}-for-business`, { aria: scheme === 'light' });
    }
    await out.close();

    const inCtx = await ctxFor(browser, scheme, newOwnerId);
    const p2 = await inCtx.newPage();
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      await p2.setViewportSize({ width: vp.width, height: vp.height });
      await ready(p2, '/en/account');
      await capture(p2, `${scheme}-${vp.name}-account-signedin`);
      await ready(p2, '/en/onboarding');
      await capture(p2, `${scheme}-${vp.name}-onboarding-1`, { aria: scheme === 'light' });
      await p2.getByRole('button', { name: en.onboarding.continue }).click();
      await p2.waitForTimeout(600);
      await capture(p2, `${scheme}-${vp.name}-onboarding-1-errors`);
    }
    await inCtx.close();
  });

  test(`states, ${scheme}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await ctxFor(browser, scheme, fx.ownerId);
    const page = await context.newPage();
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const k = `state-${scheme}-${vp.name}`;
      // Form sheet with a validation error.
      await ready(page, '/en/dashboard/services');
      await page.getByRole('button', { name: en.services.add }).first().click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').getByRole('button', { name: en.services.form.add }).click();
      await page.waitForTimeout(500);
      await capture(page, `${k}-service-sheet-error`, { full: false, aria: scheme === 'light' });
      await page.keyboard.press('Escape');
      // Confirm sheet.
      await page.getByRole('button', { name: /^Delete service/ }).first().click();
      await page.getByRole('dialog').waitFor();
      await capture(page, `${k}-confirm-sheet`, { full: false, aria: scheme === 'light' });
      await page.keyboard.press('Escape');
      // Colour picker with a failing value.
      await ready(page, '/en/dashboard/profile');
      const primary = page.getByLabel(en.profile.brand.primary, { exact: false }).first();
      await primary.fill('#ffe066');
      await primary.blur();
      await page.waitForTimeout(300);
      await primary.scrollIntoViewIfNeeded();
      await capture(page, `${k}-colour-fail`, { full: false });
      // Calendar: booking details + add booking sheet.
      await ready(page, '/en/dashboard/calendar');
      await page.getByRole('button', { name: en.calendar.actions.addBooking }).first().click();
      await page.getByRole('dialog').waitFor();
      await capture(page, `${k}-calendar-add`, { full: false });
      await page.keyboard.press('Escape');
    }
    await context.close();
  });
}

test('200% text, key pages', async ({ browser }) => {
  test.setTimeout(400_000);
  const context = await ctxFor(browser, 'light', fx.ownerId, { fontScale: true });
  const page = await context.newPage();
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, route] of PAGES) {
      await ready(page, `/en/${route}`, true);
      await capture(page, `zoom200-${vp.name}-${name}`);
    }
    await ready(page, '/en/dashboard/services', true);
    await page.getByRole('button', { name: en.services.add }).first().click();
    await page.getByRole('dialog').waitFor();
    await capture(page, `zoom200-${vp.name}-service-sheet`, { full: false });
  }
  await context.close();
});
