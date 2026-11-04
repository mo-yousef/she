import { expect, test } from '@playwright/test';

test('unknown studio shows the studio-specific not-found', async ({ page }) => {
  // Content check, not status: b/[slug]/loading.tsx streams, so this is a 200 soft 404.
  await page.goto('/en/b/no-such-studio-xyz');
  await expect(page.getByRole('heading', { name: 'This studio isn’t available' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse studios' })).toBeVisible();
});

test('unknown route shows the generic not-found', async ({ page }) => {
  const res = await page.goto('/en/no-such-page-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'We couldn’t find that page.' })).toBeVisible();
});
