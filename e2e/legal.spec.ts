import { test, expect } from '@playwright/test';
import { LEGAL_PAGES } from '../lib/legal';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Msgs = { legal: { pages: Record<(typeof LEGAL_PAGES)[number], { title: string }> } };
const load = (l: string): Msgs =>
  JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8'));
const messages = { en: load('en'), el: load('el'), ru: load('ru') };

for (const locale of ['en', 'el', 'ru'] as const) {
  for (const page of LEGAL_PAGES) {
    test(`legal ${locale}/${page} renders`, async ({ page: pw }) => {
      const res = await pw.goto(`/${locale}/legal/${page}`);
      expect(res?.status()).toBe(200);
      await expect(pw.getByRole('heading', { level: 1 })).toHaveText(
        messages[locale].legal.pages[page].title,
      );
    });
  }
}

test('unknown legal page is a 404', async ({ page }) => {
  const res = await page.goto('/en/legal/nope');
  expect(res?.status()).toBe(404);
});
