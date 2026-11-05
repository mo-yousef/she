/**
 * Browser-level owner flow (task 6.10, AC7): the first real browser run of the sign-in
 * page, onboarding wizard and owner dashboard. Sessions are created with e2e/auth.ts
 * (database session row + cookie); the real sign-in page is covered by its own test.
 *
 * Runs under `next dev` like the rest of the suite (see playwright.config.ts). Data is
 * unique per test and removed afterwards.
 */
import { test, expect } from '@playwright/test';
import { db } from '../lib/db';
import { signInAs } from './auth';
import { bookingInput, randomPhone } from './fixtures';
import { createBookingRecord } from '../lib/booking';
import { BUSINESS_TZ, addDaysToKey, localDateKey } from '../lib/time';
import { TINY_PNG, collectBrowserErrors, createOwnerFixture, createUser, gotoReady, type OwnerFx } from './owner-helpers';
import { messages as MSG, en } from './messages';

type L = keyof typeof MSG;

test.describe('sign-in page (email + password)', () => {
  test('signed-out dashboard visit redirects to sign-in; invalid email and wrong credentials', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/signin\?callbackUrl=%2Fen%2Fdashboard/);
    await expect(page.getByRole('heading', { level: 1, name: en.account.signInTitle })).toBeVisible();

    const email = page.getByLabel(en.account.emailLabel);
    await expect(email).toBeVisible();
    // The browser's own type=email check would block "not-an-email" before the server sees
    // it, so use something the browser accepts but the server rejects.
    await email.fill('a@b');
    await page.getByLabel(en.account.passwordLabel).fill('whatever123');
    await page.getByRole('button', { name: en.account.signInSubmit }).click();
    await expect(page.getByRole('alert').filter({ hasText: en.account.error.EmailInvalid })).toBeVisible();

    // A well-formed but unknown account: Supabase rejects with invalid credentials.
    const address = `signin-${Math.random().toString(36).slice(2, 10)}@e2e.test`;
    await page.getByLabel(en.account.emailLabel).fill(address);
    await page.getByLabel(en.account.passwordLabel).fill('wrong-Password-1');
    await page.getByRole('button', { name: en.account.signInSubmit }).click();
    await expect(page.getByRole('alert').filter({ hasText: en.account.error.InvalidCredentials })).toBeVisible();
  });
});

test.describe('dashboard routes smoke (en / el / ru)', () => {
  let fx: OwnerFx;
  test.beforeAll(async () => {
    fx = await createOwnerFixture();
  });
  test.afterAll(async () => {
    await fx.cleanupAll();
  });

  const routes: [string, (m: (typeof MSG)[L]) => string][] = [
    ['dashboard', (m) => m.dashboard.overview.title],
    ['dashboard/calendar', (m) => m.calendar.title],
    ['dashboard/bookings', (m) => m.bookings.title],
    ['dashboard/services', (m) => m.services.title],
    ['dashboard/team', (m) => m.team.title],
    ['dashboard/hours', (m) => m.hours.title],
    ['dashboard/profile', (m) => m.profile.title],
    ['dashboard/reviews', (m) => m.reviewsManage.title],
    ['dashboard/settings', (m) => m.settings.title],
  ];

  for (const locale of ['en', 'el', 'ru'] as const) {
    test(`every dashboard route renders cleanly in ${locale}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const context = await browser.newContext();
      await signInAs(context, fx.ownerId);
      const page = await context.newPage();
      const errors = collectBrowserErrors(page);
      for (const [route, title] of routes) {
        const res = await page.goto(`/${locale}/${route}`);
        // gotoReady re-navigates once for the dev-only React flake; status is checked on the first load.
        if (res?.status() !== 200) {
          expect.soft(res?.status(), `${locale}/${route}`).toBe(200);
        }
        await gotoReady(page, `/${locale}/${route}`, (p) =>
          p.getByRole('heading', { level: 1, name: title(MSG[locale]), exact: true }),
        );
      }
      expect(errors()).toEqual([]);
      await context.close();
    });
  }
});

test('A. a new owner goes from the landing page to a pending listing entirely through the UI', async ({ browser }) => {
  test.setTimeout(180_000);
  const user = await createUser('CUSTOMER');
  const slugName = `E2E Onboard ${Math.random().toString(36).slice(2, 8)}`;
  let businessId: string | undefined;
  try {
    const context = await browser.newContext();
    await signInAs(context, user.id);
    const page = await context.newPage();
    const errors = collectBrowserErrors(page);
    const o = en.onboarding;

    // Landing page CTA -> wizard.
    await gotoReady(page, '/en/for-business', (p) => p.locator('#main').getByRole('link', { name: en.forBusiness.cta }));
    await page.locator('#main').getByRole('link', { name: en.forBusiness.cta }).click();
    await expect(page).toHaveURL(/\/en\/onboarding\?step=basics/);
    await expect(page.getByRole('heading', { level: 1, name: o.steps.basics })).toBeVisible();

    // Step 1: basics. Empty submit shows the translated field errors and keeps the page.
    await page.getByRole('button', { name: o.continue }).click();
    await expect(page.getByText(o.validation.nameRequired)).toBeVisible();
    await expect(page).toHaveURL(/step=basics/);
    await page.getByLabel(o.basics.name).fill(slugName);
    await page.getByLabel(o.basics.category).selectOption('nails');
    await page.getByLabel(o.basics.city).selectOption('Larnaca');
    await page.getByLabel(o.basics.tagline).fill('Gel and care');
    await page.getByLabel(o.basics.about).fill('A calm nail studio.');
    await page.getByRole('button', { name: o.continue }).click();

    // Step 2: location.
    await expect(page).toHaveURL(/step=location/);
    await expect(page.getByRole('heading', { level: 1, name: o.steps.location })).toBeVisible();
    await page.getByLabel(o.location.address).fill('12 Ermou Street, Larnaca');
    await page.getByLabel(o.location.phone).fill('+357 99 123456');
    await page.getByRole('button', { name: o.continue }).click();

    // Step 3: hours (defaults: Mon-Fri 09-18, Sat 09-14, Sun closed). Change Monday's opening.
    await expect(page).toHaveURL(/step=hours/);
    await expect(page.getByRole('heading', { level: 1, name: o.steps.hours })).toBeVisible();
    await page.locator('input[name="open-1"]').fill('10:00');
    await page.getByRole('button', { name: o.continue }).click();

    // Step 4: first service + team member.
    await expect(page).toHaveURL(/step=services/);
    await expect(page.getByRole('heading', { level: 1, name: o.steps.services })).toBeVisible();
    await page.getByLabel(o.services.serviceName).fill('Gel manicure');
    await page.getByLabel(o.services.duration).fill('45');
    await page.getByLabel(o.services.price).fill('35.50');
    await page.getByLabel(o.services.staffName).fill('Maria');
    await page.getByRole('button', { name: o.continue }).click();

    // Step 5: review. Only the photo item is unmet; submit is disabled.
    await expect(page).toHaveURL(/step=review/);
    await expect(page.getByRole('heading', { level: 1, name: o.steps.review })).toBeVisible();
    const items = page.getByRole('list').filter({ hasText: o.checklist.photo }).getByRole('listitem');
    await expect(items).toHaveCount(8);
    await expect(items.filter({ hasText: o.checklistNotDone.trim() })).toHaveCount(1);
    await expect(items.filter({ hasText: o.checklist.photo })).toContainText(o.checklistNotDone.trim());
    const fix = page.getByRole('link', { name: o.checklistFix });
    await expect(fix).toHaveAttribute('href', /\/en\/dashboard\/profile#photos$/);
    await expect(page.getByRole('button', { name: o.submit })).toBeDisabled();

    // The "Fix this" link really leads to the photos section (the owner is still DRAFT).
    await fix.click();
    await expect(page).toHaveURL(/\/en\/dashboard\/profile#photos$/);
    await expect(page.getByRole('heading', { name: en.profile.photos.title })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: o.steps.review })).toBeVisible();

    // Back navigation shows the persisted values.
    await page.getByRole('link', { name: new RegExp(`1\\. ${o.steps.basics}`) }).click();
    await expect(page.getByLabel(o.basics.name)).toHaveValue(slugName);
    await expect(page.getByLabel(o.basics.category)).toHaveValue('nails');
    await expect(page.getByLabel(o.basics.city)).toHaveValue('Larnaca');
    await page.goto('/en/onboarding?step=hours');
    await expect(page.locator('input[name="open-1"]')).toHaveValue('10:00');
    await page.goto('/en/onboarding?step=services');
    await expect(page.getByLabel(o.services.price)).toHaveValue('35.50');
    await expect(page.getByLabel(o.services.staffName)).toHaveValue('Maria');

    // DB state so far.
    const biz = await db.business.findFirstOrThrow({
      where: { ownerId: user.id },
      include: { openingHours: true, services: true, staff: { include: { services: true } } },
    });
    businessId = biz.id;
    expect(biz.status).toBe('DRAFT');
    expect(biz.slug).toMatch(/^e2e-onboard-/);
    expect(biz.city).toBe('Larnaca');
    expect(biz.address).toBe('12 Ermou Street, Larnaca');
    expect(biz.openingHours).toHaveLength(7);
    expect(biz.openingHours.find((h) => h.weekday === 1)?.opensMin).toBe(600);
    expect(biz.openingHours.find((h) => h.weekday === 0)?.closed).toBe(true);
    expect(biz.services).toHaveLength(1);
    expect(biz.services[0]).toMatchObject({ durationMin: 45, priceCents: 3550 });
    expect(biz.staff).toHaveLength(1);
    expect(biz.staff[0]!.services).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('OWNER');
    const audit = await db.auditLog.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['business.create', 'business.location', 'business.hours', 'business.firstService']),
    );
    expect(JSON.stringify(audit.map((a) => a.meta))).not.toContain(slugName);

    // Photo upload (Cloudinary) cannot run offline: add the row directly, then submit via the UI.
    await db.photo.create({ data: { businessId, url: TINY_PNG, alt: 'E2E photo' } });
    await gotoReady(page, '/en/onboarding?step=review', (p) => p.getByRole('button', { name: o.submit }));
    await expect(page.getByRole('button', { name: o.submit })).toBeEnabled();
    await page.getByRole('button', { name: o.submit }).click();
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: en.dashboard.overview.pendingTitle })).toBeVisible();
    expect((await db.business.findUniqueOrThrow({ where: { id: businessId } })).status).toBe('PENDING');
    // Pending listings are not public.
    // (Content check, not HTTP status: b/[slug]/loading.tsx streams, so notFound() is a 200
    // "soft 404" in Next. Logged in docs/shortcuts.md for 6.11/8.x.)
    await page.goto(`/en/b/${biz.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: en.errors.studioUnavailableTitle })).toBeVisible();

    // Admin approval is task 7.1 (no admin UI yet): simulate it in the DB.
    await db.business.update({ where: { id: businessId }, data: { status: 'PUBLISHED' } });
    await page.goto(`/en/b/${biz.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: slugName })).toBeVisible();
    expect(errors()).toEqual([]);
    await context.close();
  } finally {
    for (const b of await db.business.findMany({ where: { ownerId: user.id }, select: { id: true } })) {
      await db.auditLog.deleteMany({ where: { businessId: b.id } });
      await db.business.delete({ where: { id: b.id } });
    }
    await db.auditLog.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});

// ---------------------------------------------------------------------------------------
// B. Owner edits are reflected on the public page and the booking stepper (AC7, req 5.1).
// Serial: each step builds on the previous one's state. `next dev` is used on purpose: the
// public page reads the session cookie (favourites), so it is dynamic in production too and
// there is no static/ISR copy to go stale; revalidatePath/Tag only matters for the cached
// next-slot card, which the unit tests cover. See docs/decisions.md.
// ---------------------------------------------------------------------------------------
test.describe('B. owner edits show up publicly', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let fx: OwnerFx;
  let bookingRef = '';
  let manageHref = '';
  const tag = Math.random().toString(36).slice(2, 7);
  const NEW_NAME = `Renamed Studio ${tag}`;
  const NEW_TAGLINE = `Fresh tagline ${tag}`;
  const NEW_ABOUT = `Fresh about text ${tag}`;
  const SERVICE_NEW = `Gel Deluxe ${tag}`;
  const SERVICE_EXTRA = `Extra Service ${tag}`;
  const STAFF_NEW = `Anna ${tag}`;

  const publicUrl = () => `/en/b/${fx.slug}`;
  const bookUrl = (qs = '') => `/en/b/${fx.slug}/book${qs}`;

  test.beforeAll(async () => {
    fx = await createOwnerFixture(2);
  });
  test.afterAll(async () => {
    await fx.cleanupAll();
  });
  let browserErrors: () => string[] = () => [];
  test.beforeEach(async ({ context, page }) => {
    await signInAs(context, fx.ownerId);
    browserErrors = collectBrowserErrors(page);
  });
  test.afterEach(() => {
    expect(browserErrors()).toEqual([]);
  });

  test('B1 profile: name, tagline, about appear on the public page without a restart', async ({ page, browser }) => {
    // A separate anonymous visitor captures the original values first.
    const visitor = await browser.newPage();
    await visitor.goto(publicUrl());
    await expect(visitor.getByRole('heading', { level: 1, name: /E2E Studio/ })).toBeVisible();
    await expect(visitor.getByText('E2E Manicure')).toBeVisible();
    await expect(visitor.getByText('€30', { exact: true }).first()).toBeVisible();

    await gotoReady(page, '/en/dashboard/profile', (p) => p.getByRole('heading', { level: 1, name: en.profile.title }));
    await page.getByLabel(en.onboarding.basics.name, { exact: false }).first().fill(NEW_NAME);
    // Tagline / about labels also exist in the Greek and Russian translation fieldsets; the
    // base-language fields are the ones with the plain ids.
    await page.locator('#pf-tagline').fill(NEW_TAGLINE);
    await page.locator('#pf-about').fill(NEW_ABOUT);
    await page.getByRole('button', { name: en.profile.details.save }).click();
    await expect(page.getByRole('status').filter({ hasText: en.profile.details.saved })).toBeVisible();

    // Same visitor, next load: new values (no server restart, no manual cache clearing).
    await visitor.goto(publicUrl());
    await expect(visitor.getByRole('heading', { level: 1, name: NEW_NAME })).toBeVisible();
    await expect(visitor.getByText(NEW_TAGLINE)).toBeVisible();
    await expect(visitor.getByText(NEW_ABOUT)).toBeVisible();
    await visitor.close();

    // The dashboard shell shows the new name too.
    await page.goto('/en/dashboard');
    await expect(page.locator('aside').getByText(NEW_NAME)).toBeVisible();
  });

  test('B2 brand colour: valid colour changes --b1; low contrast is refused', async ({ page }) => {
    await gotoReady(page, '/en/dashboard/profile', (p) => p.getByRole('heading', { level: 1, name: en.profile.title }));
    const primary = page.getByLabel(en.profile.brand.primary, { exact: true });
    const before = (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).brandPrimary;

    // Low contrast (yellow on white): live readout, Save refused with the translated error.
    await primary.fill('#ffff00');
    await expect(page.getByText(/too low, needs/).first()).toBeVisible();
    await page.getByRole('button', { name: en.profile.brand.save }).click();
    await expect(page.getByRole('alert').filter({ hasText: en.profile.brand.error.fix })).toBeVisible();
    expect((await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).brandPrimary).toBe(before);

    // Valid colour.
    await primary.fill('#1d4e89');
    await expect(page.getByText(/passes/).first()).toBeVisible();
    await page.getByRole('button', { name: en.profile.brand.save }).click();
    await expect(page.getByRole('status').filter({ hasText: en.profile.brand.saved })).toBeVisible();

    await page.goto(publicUrl());
    const b1 = await page.locator('.brand-scope').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--b1').trim());
    expect(b1.toLowerCase()).toBe('#1d4e89');
  });

  test('B3 services: edit, add, hide are reflected on the public page and the stepper', async ({ page }) => {
    await gotoReady(page, '/en/dashboard/services', (p) => p.getByRole('heading', { level: 1, name: en.services.title }));
    await page.getByRole('button', { name: en.services.row.editNamed.replace('{name}', 'E2E Manicure') }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('heading', { name: en.services.form.editTitle })).toBeVisible();
    // (.first(): the Greek/Russian translation fields share the label; the base field is first.)
    await dlg.getByLabel(en.services.form.name, { exact: true }).first().fill(SERVICE_NEW);
    await dlg.getByLabel(en.services.form.price, { exact: true }).fill('42.50');
    await dlg.getByRole('button', { name: en.services.form.save }).click();
    await expect(page.getByRole('status').filter({ hasText: en.services.status.updated })).toBeVisible();
    await expect(dlg).toBeHidden();

    // Add a second service.
    await page.getByRole('button', { name: en.services.add, exact: true }).click();
    // (.first(): the Greek/Russian translation fields share the label; the base field is first.)
    await dlg.getByLabel(en.services.form.name, { exact: true }).first().fill(SERVICE_EXTRA);
    await dlg.getByLabel(en.services.form.price, { exact: true }).fill('15');
    await dlg.getByRole('checkbox', { name: 'E2E Staff 1' }).check();
    await dlg.getByRole('button', { name: en.services.form.add, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: en.services.status.created })).toBeVisible();

    await page.goto(publicUrl());
    await expect(page.getByText(SERVICE_NEW)).toBeVisible();
    await expect(page.getByText('€42.50').first()).toBeVisible();
    await expect(page.getByText(SERVICE_EXTRA)).toBeVisible();
    await expect(page.getByText('E2E Manicure')).toHaveCount(0);

    // Stepper service step lists both.
    await page.goto(bookUrl());
    await expect(page.getByRole('button', { name: new RegExp(SERVICE_NEW) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(SERVICE_EXTRA) })).toBeVisible();

    // Hide the extra service: gone from both.
    await page.goto('/en/dashboard/services');
    await page.getByRole('button', { name: en.services.row.hideNamed.replace('{name}', SERVICE_EXTRA) }).click();
    await expect(page.getByRole('status').filter({ hasText: SERVICE_EXTRA })).toBeVisible();
    await page.goto(publicUrl());
    await expect(page.getByText(SERVICE_NEW)).toBeVisible();
    await expect(page.getByText(SERVICE_EXTRA)).toHaveCount(0);
    await page.goto(bookUrl());
    await expect(page.getByRole('button', { name: new RegExp(SERVICE_NEW) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(SERVICE_EXTRA) })).toHaveCount(0);
  });

  test('B4 hours: closing Monday and adding a closure show on the public page and disable the dates', async ({ page }) => {
    await gotoReady(page, '/en/dashboard/hours', (p) => p.getByRole('heading', { level: 1, name: en.hours.title }));
    await page.getByRole('checkbox', { name: new RegExp(`${en.hours.weekly.closed}\\s*${en.business.weekdayMon}`) }).check();
    await page.getByRole('button', { name: en.hours.weekly.save }).click();
    await expect(page.getByRole('status').filter({ hasText: en.hours.weekly.saved })).toBeVisible();

    // Closure on a date 4 days out (Nicosia calendar).
    const closureKey = addDaysToKey(localDateKey(new Date(), BUSINESS_TZ), 4);
    await page.getByLabel(en.hours.closures.from, { exact: true }).fill(closureKey);
    await page.getByLabel(en.hours.closures.to, { exact: true }).fill(closureKey);
    await page.getByRole('button', { name: en.hours.closures.add, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: en.hours.closures.added })).toBeVisible();

    await page.goto(publicUrl());
    await expect(page.getByRole('listitem').filter({ hasText: en.business.weekdayMon }).filter({ hasText: en.business.closed })).toBeVisible();
    await expect(page.getByText(/^Closed on /)).toBeVisible();

    // Stepper date strip: Mondays and the closure date are disabled.
    const svc = await db.service.findFirstOrThrow({ where: { businessId: fx.businessId, name: SERVICE_NEW } });
    await page.goto(bookUrl(`?service=${svc.id}&staff=any&step=datetime`));
    const strip = page.getByRole('radiogroup', { name: en.booking.dateLabel });
    await expect(strip).toBeVisible();
    const full = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' });
    const label = (key: string) => `${full.format(new Date(`${key}T00:00:00Z`))}, no times available`;
    await expect(strip.getByRole('radio', { name: label(closureKey) })).toHaveAttribute('aria-disabled', 'true');
    const mondays = strip.getByRole('radio', { name: /^Monday/ });
    expect(await mondays.count()).toBeGreaterThan(0);
    for (const m of await mondays.all()) await expect(m).toHaveAttribute('aria-disabled', 'true');
  });

  test('B5 team: new member and a day off reach the public page and the stepper', async ({ page }) => {
    await gotoReady(page, '/en/dashboard/team', (p) => p.getByRole('heading', { level: 1, name: en.team.title }));
    await page.getByRole('button', { name: en.team.add, exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(en.team.form.name, { exact: true }).fill(STAFF_NEW);
    await dlg.getByLabel(en.team.form.role, { exact: true }).fill('Nail technician');
    await dlg.getByRole('checkbox', { name: SERVICE_NEW }).check();
    await dlg.getByRole('button', { name: en.team.form.add, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: en.team.status.created })).toBeVisible();

    await page.goto(publicUrl());
    await expect(page.getByText(STAFF_NEW)).toBeVisible();

    const svc = await db.service.findFirstOrThrow({ where: { businessId: fx.businessId, name: SERVICE_NEW } });
    await page.goto(bookUrl(`?service=${svc.id}&step=team`));
    await expect(page.getByRole('button', { name: new RegExp(STAFF_NEW) })).toBeVisible();

    // Day off for the new member.
    const anna = await db.staffMember.findFirstOrThrow({ where: { businessId: fx.businessId, name: STAFF_NEW } });
    await page.goto('/en/dashboard/team');
    await page.getByRole('button', { name: en.team.row.editNamed.replace('{name}', STAFF_NEW) }).click();
    const offKey = addDaysToKey(localDateKey(new Date(), BUSINESS_TZ), 6);
    await dlg.getByLabel(en.team.daysOff.from, { exact: true }).fill(offKey);
    await dlg.getByLabel(en.team.daysOff.to, { exact: true }).fill(offKey);
    await dlg.getByRole('button', { name: en.team.daysOff.add, exact: true }).click();
    await expect(dlg.getByRole('status').filter({ hasText: en.team.daysOff.added })).toBeVisible();

    await page.goto(bookUrl(`?service=${svc.id}&staff=${anna.id}&step=datetime`));
    const full = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' });
    await expect(
      page.getByRole('radiogroup', { name: en.booking.dateLabel }).getByRole('radio', { name: `${full.format(new Date(`${offKey}T00:00:00Z`))}, no times available` }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  test('B6 settings: manual approval makes a guest booking PENDING; owner confirms it in Bookings', async ({ page, browser }) => {
    await gotoReady(page, '/en/dashboard/settings', (p) => p.getByRole('heading', { level: 1, name: en.settings.title }));
    await page.getByRole('radio', { name: new RegExp(en.settings.rules.autoConfirm.manual) }).check();
    await page.getByRole('button', { name: en.settings.rules.save }).click();
    await expect(page.getByRole('status').filter({ hasText: en.settings.rules.saved })).toBeVisible();

    // Guest books through the real stepper (separate, signed-out context).
    const guest = await browser.newContext();
    const gp = await guest.newPage();
    const svc = await db.service.findFirstOrThrow({ where: { businessId: fx.businessId, name: SERVICE_NEW } });
    await gotoReady(gp, bookUrl(`?service=${svc.id}`), (p) => p.getByRole('button', { name: en.booking.staffAny }));
    await gp.getByRole('button', { name: en.booking.staffAny }).click();
    const strip = gp.getByRole('radiogroup', { name: en.booking.dateLabel });
    await strip.locator('[role="radio"][aria-disabled="false"]').first().click();
    await gp.getByRole('radiogroup', { name: en.booking.timeLabel }).locator('[role="radio"][aria-disabled="false"]').first().click();
    await gp.getByRole('button', { name: en.booking.continue }).click();
    await gp.locator('#bk-name').fill('E2E Guest');
    await gp.locator('#bk-phone').fill(randomPhone());
    await gp.locator('#bk-email').fill(`guest-${tag}@e2e.test`);
    await gp.locator('#bk-consentTerms').check();
    await gp.locator('#bk-consentMessages').check();
    await gp.getByRole('button', { name: en.booking.continue }).click();
    await gp.getByRole('button', { name: en.booking.confirmBooking }).click();
    await expect(gp).toHaveURL(/\/booked\//, { timeout: 30_000 });
    await expect(gp.getByRole('heading', { name: en.booked.headingPending })).toBeVisible();
    manageHref = (await gp.getByRole('link', { name: en.booked.manageBooking }).getAttribute('href'))!;
    expect(manageHref).toContain('/manage/');
    const booking = await db.booking.findFirstOrThrow({ where: { businessId: fx.businessId } });
    bookingRef = booking.reference;
    expect(booking.status).toBe('PENDING');
    await guest.close();

    // Owner confirms in the dashboard.
    await gotoReady(page, '/en/dashboard/bookings', (p) => p.getByRole('heading', { level: 1, name: en.bookings.title }));
    await page.getByRole('button', { name: en.bookings.table.open.replace('{reference}', bookingRef) }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: en.calendar.details.confirmBooking }).click();
    await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED');
    await expect(page.getByRole('status').filter({ hasText: en.calendar.result.statusChanged })).toBeVisible();
  });

  test('B7 unpublish: Escape/Keep change nothing; confirming takes the page offline; manage link still works', async ({ page }) => {
    await gotoReady(page, '/en/dashboard/settings', (p) => p.getByRole('heading', { level: 1, name: en.settings.title }));
    const open = () => page.getByRole('button', { name: en.settings.status.unpublish.button }).click();
    const dlg = page.getByRole('dialog');
    const statusOf = async () => (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).status;

    await open();
    await expect(dlg.getByRole('heading', { name: en.settings.status.unpublish.title })).toBeVisible();
    // Safe default: "Keep online" has initial focus.
    await expect(dlg.getByRole('button', { name: en.settings.status.unpublish.keep })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    expect(await statusOf()).toBe('PUBLISHED');

    await open();
    await dlg.getByRole('button', { name: en.settings.status.unpublish.keep }).click();
    await expect(dlg).toBeHidden();
    expect(await statusOf()).toBe('PUBLISHED');

    await open();
    await dlg.getByRole('button', { name: en.settings.status.unpublish.confirm }).click();
    await expect.poll(statusOf).toBe('DRAFT');

    await page.goto(publicUrl());
    await expect(page.getByRole('heading', { level: 1, name: en.errors.studioUnavailableTitle })).toBeVisible();

    // The customer's manage link still works for the existing booking.
    await page.goto(manageHref);
    await expect(page.getByRole('heading', { level: 1, name: en.manage.heading })).toBeVisible();
    await expect(page.getByText(bookingRef).first()).toBeVisible();
  });

  test('B8 every UI edit left an audit row with ids/field names only', async () => {
    const rows = await db.auditLog.findMany({ where: { businessId: fx.businessId }, orderBy: { createdAt: 'asc' } });
    const actions = new Set(rows.map((r) => r.action));
    for (const a of [
      'business.profile', 'business.brand', 'service.update', 'service.create', 'business.hours', 'closure.add',
      'staff.create', 'staff.dayoff.add', 'business.settings', 'booking.status', 'business.unpublish',
    ]) {
      expect(actions, `audit action ${a}`).toContain(a);
    }
    const allowed = new Set([
      'serviceId', 'staffId', 'staffIds', 'dayOffId', 'closureId', 'photoId', 'bookingId', 'fields', 'status',
      'from', 'to', 'direction',
    ]);
    for (const r of rows) {
      expect(r.actorId).toBe(fx.ownerId);
      for (const k of Object.keys((r.meta ?? {}) as object)) expect(allowed, `${r.action} meta.${k}`).toContain(k);
    }
    const blob = JSON.stringify(rows.map((r) => r.meta));
    for (const secret of [NEW_NAME, NEW_TAGLINE, NEW_ABOUT, SERVICE_NEW, SERVICE_EXTRA, STAFF_NEW, '#1d4e89']) {
      expect(blob).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------------------
// C. Authorisation in the browser.
// ---------------------------------------------------------------------------------------
test.describe('C. dashboard access control', () => {
  test.setTimeout(120_000);
  let a: OwnerFx;
  let b: OwnerFx;
  const created: string[] = [];

  test.beforeAll(async () => {
    a = await createOwnerFixture();
    b = await createOwnerFixture();
    // Make each business's data distinguishable.
    await db.service.updateMany({ where: { businessId: a.businessId }, data: { name: 'Alpha Only Service' } });
    await db.service.updateMany({ where: { businessId: b.businessId }, data: { name: 'Beta Only Service' } });
    await db.business.update({ where: { id: a.businessId }, data: { name: 'Alpha Studio' } });
    await db.business.update({ where: { id: b.businessId }, data: { name: 'Beta Studio' } });
    await createBookingRecord({ input: bookingInput(a, { staffId: a.staffIds[0]! }) });
  });
  test.afterAll(async () => {
    await a.cleanupAll();
    await b.cleanupAll();
    for (const id of created) await db.user.delete({ where: { id } }).catch(() => undefined);
  });

  test('signed-out, customer and business-less owner are redirected; owners only see their own data', async ({ browser }) => {
    // Signed out -> sign-in with callbackUrl.
    const anon = await browser.newPage();
    await anon.goto('/en/dashboard/services');
    await expect(anon).toHaveURL(/\/en\/account\?callbackUrl=/);
    await anon.close();

    // Customer -> owner landing page.
    const customer = await createUser('CUSTOMER');
    created.push(customer.id);
    const cc = await browser.newContext();
    await signInAs(cc, customer.id);
    const cp = await cc.newPage();
    await cp.goto('/en/dashboard/services');
    await expect(cp).toHaveURL(/\/en\/for-business$/);
    await expect(cp.getByRole('heading', { level: 1, name: en.forBusiness.title })).toBeVisible();
    await cc.close();

    // Owner role without a business -> onboarding.
    const bare = await createUser('OWNER');
    created.push(bare.id);
    const bc = await browser.newContext();
    await signInAs(bc, bare.id);
    const bp = await bc.newPage();
    await bp.goto('/en/dashboard');
    await expect(bp).toHaveURL(/\/en\/onboarding$/);
    await bc.close();

    // Owner B sees only Beta data, never Alpha's service, name or booking.
    const oc = await browser.newContext();
    await signInAs(oc, b.ownerId);
    const op = await oc.newPage();
    const errors = collectBrowserErrors(op);
    await gotoReady(op, '/en/dashboard/services', (p) => p.getByRole('heading', { level: 1, name: en.services.title }));
    await expect(op.getByText('Beta Only Service')).toBeVisible();
    await expect(op.locator('aside').getByText('Beta Studio')).toBeVisible();
    await expect(op.getByText('Alpha Only Service')).toHaveCount(0);
    await expect(op.getByText('Alpha Studio')).toHaveCount(0);

    const aBooking = await db.booking.findFirstOrThrow({ where: { businessId: a.businessId } });
    await op.goto('/en/dashboard/bookings?status=all');
    await expect(op.getByRole('heading', { level: 1, name: en.bookings.title })).toBeVisible();
    await expect(op.getByText(aBooking.reference)).toHaveCount(0);

    // Alpha's staff id in the calendar URL must not leak Alpha's data into Beta's calendar.
    await op.goto(`/en/dashboard/calendar?view=day&date=${a.dateKey}&staff=${a.staffIds[0]}`);
    await expect(op.getByRole('heading', { level: 1, name: en.calendar.title })).toBeVisible();
    await expect(op.getByText('E2E Customer')).toHaveCount(0);
    expect(errors()).toEqual([]);
    await oc.close();
  });
});

// ---------------------------------------------------------------------------------------
// D. Calendar basics.
// ---------------------------------------------------------------------------------------
test('D. calendar: seeded booking visible; manual booking and block can be created; block removed', async ({ browser }) => {
  test.setTimeout(120_000);
  const fx = await createOwnerFixture();
  try {
    await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) });
    const context = await browser.newContext();
    await signInAs(context, fx.ownerId);
    const page = await context.newPage();
    const errors = collectBrowserErrors(page);
    const walkIn = `Walk In ${Math.random().toString(36).slice(2, 7)}`;

    await gotoReady(page, `/en/dashboard/calendar?view=day&date=${fx.dateKey}`, (p) =>
      p.getByRole('button', { name: en.calendar.actions.addBooking }),
    );
    const grid = page.getByRole('region', { name: /Schedule for/ });
    await expect(grid.getByRole('button', { name: /E2E Customer/ })).toBeVisible();

    // Manual booking through the form.
    await page.getByRole('button', { name: en.calendar.actions.addBooking }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('heading', { name: en.calendar.bookingForm.title })).toBeVisible();
    await dlg.getByLabel(en.calendar.bookingForm.date, { exact: true }).fill(fx.dateKey);
    await dlg.getByLabel(en.calendar.bookingForm.time, { exact: true }).fill('12:00');
    await dlg.getByLabel(en.calendar.bookingForm.name, { exact: true }).fill(walkIn);
    await dlg.getByRole('button', { name: en.calendar.bookingForm.submit, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Booking SC-[A-Z0-9]+ added\.$/ })).toBeVisible();
    await expect(grid.getByRole('button', { name: new RegExp(walkIn) })).toBeVisible();
    expect(await db.booking.count({ where: { businessId: fx.businessId, source: 'MANUAL' } })).toBe(1);

    // It also appears in the bookings list.
    await page.goto('/en/dashboard/bookings?status=all');
    await expect(page.getByRole('heading', { level: 1, name: en.bookings.title })).toBeVisible();
    await expect(page.getByText(walkIn).first()).toBeVisible();

    // Create a block, then remove it through the confirmation sheet.
    await page.goto(`/en/dashboard/calendar?view=day&date=${fx.dateKey}`);
    await page.getByRole('button', { name: en.calendar.actions.blockTime }).click();
    await dlg.getByLabel(en.calendar.blockForm.date, { exact: true }).fill(fx.dateKey);
    await dlg.getByLabel(en.calendar.blockForm.start, { exact: true }).fill('14:00');
    await dlg.getByLabel(en.calendar.blockForm.end, { exact: true }).fill('15:00');
    await dlg.getByLabel(en.calendar.blockForm.reason, { exact: true }).fill('Lunch');
    await dlg.getByRole('button', { name: en.calendar.blockForm.submit, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /1 block added/ })).toBeVisible();
    const block = grid.getByRole('button', { name: new RegExp(`${en.calendar.grid.blocked}, Lunch`) });
    await expect(block).toBeVisible();
    expect(await db.block.count({ where: { businessId: fx.businessId } })).toBe(1);

    await block.click();
    await dlg.getByRole('button', { name: en.calendar.details.removeBlock }).click();
    // The sheet's accessible name must be its own title (the calendar renders two ConfirmSheets).
    await page.getByRole('dialog', { name: en.calendar.removeSheet.title }).getByRole('button', { name: en.calendar.removeSheet.confirm }).click();
    await expect.poll(() => db.block.count({ where: { businessId: fx.businessId } })).toBe(0);
    await expect(block).toHaveCount(0);
    expect(errors()).toEqual([]);
    await context.close();
  } finally {
    await fx.cleanupAll();
  }
});
