/**
 * Browser-level booking race (task 4.7, req 4.1, AC4): two customers, two isolated
 * browser contexts, the same staff + slot, both press "Confirm booking" at about the
 * same time through the real UI and the real createBooking server action.
 *
 * Expected: exactly one reaches the confirmation page; the other sees
 * "That time was just taken. Please pick another." and is returned to the time step.
 *
 * Only 2 contexts on purpose: the per-phone rate limiter (3/hour) is per phone and
 * each context uses its own phone, and there is no x-forwarded-for locally so the
 * per-IP bucket is skipped. The N-parallel guarantee lives in booking-concurrency.spec.ts.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createFixture, randomPhone, type Fixture } from './fixtures';

/**
 * Setup only. Next 15 dev mode intermittently throws "frame.join is not a function"
 * (React dev-only buildFakeCallStack) and shows an error page; retry the whole setup
 * once on a fresh context. Never applied after the confirm click, so it cannot mask
 * the behaviour under test.
 */
async function openReview(browser: Browser, fx: Fixture): Promise<Page> {
  try {
    return await openReviewOnce(browser, fx);
  } catch {
    return await openReviewOnce(browser, fx);
  }
}

async function openReviewOnce(browser: Browser, fx: Fixture): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const qs = new URLSearchParams({
    service: fx.serviceId,
    staff: fx.staffIds[0]!,
    date: fx.dateKey,
    slot: fx.slotIso,
    step: 'details',
  });
  await page.goto(`/en/b/${fx.slug}/book?${qs}`);

  await page.locator('#bk-name').fill('E2E Customer');
  await page.locator('#bk-phone').fill(randomPhone());
  await page.locator('#bk-email').fill(`c-${Math.random().toString(36).slice(2, 10)}@e2e.test`);
  await page.locator('#bk-consentTerms').check();
  await page.locator('#bk-consentMessages').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeVisible();
  return page;
}

test('two customers confirm the same slot: exactly one wins, the other is sent back to pick a time', async ({
  browser,
}) => {
  const fx = await createFixture(1);
  try {
    // Warm up the dev server's on-demand compilation for this route before the two
    // contexts load it at once; otherwise simultaneous first-hits can race Next's
    // cold compile and intermittently 500 (unrelated to the booking race under test).
    await (await openReview(browser, fx)).context().close();

    const [a, b] = await Promise.all([openReview(browser, fx), openReview(browser, fx)]);

    // Fire both confirms together.
    await Promise.all([
      a.getByRole('button', { name: 'Confirm booking' }).click(),
      b.getByRole('button', { name: 'Confirm booking' }).click(),
    ]);

    // Wait until each page has settled on either the confirmation page or the time step.
    const settled = (p: Page) =>
      p.waitForURL(/\/booked\/|step=datetime/, { timeout: 30_000 });
    await Promise.all([settled(a), settled(b)]);

    const won = [a, b].filter((p) => p.url().includes('/booked/'));
    const lost = [a, b].filter((p) => !p.url().includes('/booked/'));
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // Next's route announcer is also role="alert", so match on the message text.
    await expect(
      lost[0]!.getByRole('alert').filter({ hasText: 'That time was just taken. Please pick another.' }),
    ).toBeVisible();
    await expect(lost[0]!.getByRole('heading', { name: 'Pick a date and time' })).toBeVisible();
    await expect(won[0]!.getByRole('heading', { name: "You're booked" })).toBeVisible();
  } finally {
    await fx.cleanup();
  }
});
