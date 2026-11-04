/**
 * Shared helpers for the browser-level owner specs (task 6.10). Test-only.
 */
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { db } from '../lib/db';
import { createFixture, type Fixture } from './fixtures';

/**
 * 1x1 PNG as a data URI. The Cloudinary upload cannot run offline and next/image would try
 * to fetch res.cloudinary.com, so the Photo row (inserted straight into the DB, which
 * bypasses the upload trust check) uses a data URI: next/image renders it without any
 * network request.
 */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';

export async function addPhoto(businessId: string, alt = 'E2E photo'): Promise<void> {
  await db.photo.create({ data: { businessId, url: TINY_PNG, alt, sortOrder: 0 } });
}

export interface OwnerFx extends Fixture {
  ownerId: string;
  /** Removes everything the fixture and the UI created (audit rows are not FK-linked). */
  cleanupAll: () => Promise<void>;
}

/** A PUBLISHED business with owner, 1 staff, 1 service, hours every day, and a photo. */
export async function createOwnerFixture(staffCount = 1): Promise<OwnerFx> {
  const fx = await createFixture(staffCount);
  const business = await db.business.findUniqueOrThrow({ where: { id: fx.businessId }, select: { ownerId: true } });
  // A published listing always has an address and languages (onboarding); the profile form requires it.
  await db.business.update({ where: { id: fx.businessId }, data: { address: '1 Test Street, Larnaca', languages: ['en'] } });
  await addPhoto(fx.businessId);
  return {
    ...fx,
    ownerId: business.ownerId,
    cleanupAll: async () => {
      await db.auditLog.deleteMany({ where: { businessId: fx.businessId } });
      await fx.cleanup();
    },
  };
}

/** A user with a given role and no business (e.g. a second, unrelated owner or a customer). */
export async function createUser(role: 'CUSTOMER' | 'OWNER' | 'STAFF' = 'CUSTOMER'): Promise<{ id: string; email: string }> {
  const email = `u-${randomUUID().slice(0, 8)}@e2e.test`;
  const u = await db.user.create({ data: { email, name: 'E2E User', role } });
  return { id: u.id, email };
}

/**
 * Navigation/setup only. Next 15 dev mode intermittently throws "frame.join is not a
 * function" (React dev-only buildFakeCallStack) and renders an error page; reload once if
 * the expected heading did not show. Never wrap behaviour assertions in this.
 */
export async function gotoReady(page: Page, url: string, ready: (p: Page) => ReturnType<Page['locator']>): Promise<void> {
  await page.goto(url);
  try {
    await expect(ready(page)).toBeVisible({ timeout: 20_000 });
  } catch {
    await page.goto(url);
    await expect(ready(page)).toBeVisible({ timeout: 20_000 });
  }
}

/**
 * Collects browser console errors and uncaught page errors. Returns a function that yields
 * them after filtering the (investigated, documented) allow-list.
 */
export function collectBrowserErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return () => errors.filter((e) => !ALLOWED_NOISE.some((re) => re.test(e)));
}

/**
 * Known harmless dev noise. Each entry needs a justification and must have been seen and
 * investigated. None has been seen in the owner specs so far, so the list is empty and any
 * console error or uncaught page error fails the test.
 */
const ALLOWED_NOISE: RegExp[] = [];
