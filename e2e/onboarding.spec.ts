/**
 * DB-backed tests for owner onboarding + the publish checklist (task 6.1, req 5.1).
 * Real Postgres; the lib cores behind the 'use server' wrappers are called directly with
 * explicit user ids (same approach as reviews.spec.ts).
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { db } from '../lib/db';
import { assertOwnsBusiness, OwnerAuthError } from '../lib/owner-auth';
import {
  saveBasicsCore,
  saveFirstServiceCore,
  saveHoursCore,
  saveLocationCore,
  startOnboardingCore,
  submitForReviewCore,
} from '../lib/onboarding';

const userIds: string[] = [];

async function makeUser(role: Role = 'CUSTOMER') {
  const u = await db.user.create({ data: { email: `ob-${randomUUID().slice(0, 8)}@e2e.test`, role } });
  userIds.push(u.id);
  return u.id;
}

test.afterEach(async () => {
  const businesses = await db.business.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await db.auditLog.deleteMany({ where: { OR: [{ businessId: { in: ids } }, { actorId: { in: userIds } }] } });
  await db.business.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
});

const basics = (name: string) => ({ name, category: 'nails', city: 'Larnaca', languages: ['en'], tagline: '', about: '' });
const location = { address: '1 Test Street', phone: '99123456', whatsapp: '', instagram: '@studio.cy', website: '', lat: '', lng: '' };
const hours: Record<string, string> = {};
for (let d = 0; d <= 6; d++) {
  hours[`open-${d}`] = '09:00';
  hours[`close-${d}`] = '18:00';
  if (d === 0) hours[`closed-${d}`] = 'on';
}
const service = { serviceName: 'Manicure', serviceCategory: 'nails', durationMin: '60', price: '25.50', staffName: 'Anna' };

async function onboard(userId: string, name = `Studio ${randomUUID().slice(0, 6)}`) {
  const r = await startOnboardingCore(userId, basics(name));
  if (!r.ok) throw new Error(`onboarding failed: ${r.code}`);
  return r.business;
}

test('an owner cannot read or modify another owner’s business', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const bizA = await onboard(a, 'Owner A Studio');
  await onboard(b, 'Owner B Studio');

  await expect(assertOwnsBusiness(b, bizA.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(assertOwnsBusiness(null, bizA.id)).rejects.toBeInstanceOf(OwnerAuthError);
  await expect(assertOwnsBusiness(a, 'does-not-exist')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await assertOwnsBusiness(a, bizA.id)).business.id).toBe(bizA.id);

  const before = await db.business.findUniqueOrThrow({ where: { id: bizA.id } });
  expect(await saveBasicsCore(b, bizA.id, basics('Hijacked'))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await saveLocationCore(b, bizA.id, location)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await saveHoursCore(b, bizA.id, hours)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await saveFirstServiceCore(b, bizA.id, service)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await submitForReviewCore(b, bizA.id)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await saveBasicsCore(null, bizA.id, basics('Anon'))).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

  const after = await db.business.findUniqueOrThrow({ where: { id: bizA.id } });
  expect(after).toEqual(before);
  expect(await db.service.count({ where: { businessId: bizA.id } })).toBe(0);
  expect(await db.openingHours.count({ where: { businessId: bizA.id } })).toBe(0);
});

test('the owner role is re-read from the database on every action', async () => {
  const a = await makeUser();
  const biz = await onboard(a);
  await db.user.update({ where: { id: a }, data: { role: 'CUSTOMER' } }); // demoted after the session was issued
  expect(await saveBasicsCore(a, biz.id, basics('Still me'))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
});

test('publish is rejected server-side until every checklist item is satisfied', async () => {
  const a = await makeUser();
  const biz = await onboard(a);

  let r = await submitForReviewCore(a, biz.id);
  expect(r).toMatchObject({ ok: false, code: 'INCOMPLETE' });
  expect(!r.ok && r.missing).toEqual(['address', 'service', 'staff', 'hours', 'photo']);

  expect((await saveLocationCore(a, biz.id, location)).ok).toBe(true);
  const saved = await db.business.findUniqueOrThrow({ where: { id: biz.id } });
  expect(saved.phone).toBe('+35799123456'); // E.164-normalised
  expect(saved.instagram).toBe('studio.cy');

  expect((await saveHoursCore(a, biz.id, hours)).ok).toBe(true);
  expect((await saveFirstServiceCore(a, biz.id, service)).ok).toBe(true);
  expect(await db.service.findFirstOrThrow({ where: { businessId: biz.id } })).toMatchObject({ priceCents: 2550, durationMin: 60 });
  expect(await db.staffService.count({ where: { service: { businessId: biz.id } } })).toBe(1);

  // Saving the step again edits, not duplicates.
  expect((await saveFirstServiceCore(a, biz.id, { ...service, price: '30' })).ok).toBe(true);
  expect(await db.service.count({ where: { businessId: biz.id } })).toBe(1);
  expect(await db.staffMember.count({ where: { businessId: biz.id } })).toBe(1);

  r = await submitForReviewCore(a, biz.id);
  expect(r).toMatchObject({ ok: false, code: 'INCOMPLETE' });
  expect(!r.ok && r.missing).toEqual(['photo']);
  expect((await db.business.findUniqueOrThrow({ where: { id: biz.id } })).status).toBe('DRAFT');

  await db.photo.create({ data: { businessId: biz.id, url: 'https://example.test/p.jpg', alt: 'Test' } });
  r = await submitForReviewCore(a, biz.id);
  expect(r).toMatchObject({ ok: true, status: 'PENDING' });
  expect((await db.business.findUniqueOrThrow({ where: { id: biz.id } })).status).toBe('PENDING');

  // Only a DRAFT can be submitted.
  expect(await submitForReviewCore(a, biz.id)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
});

test('a service nobody performs does not satisfy the staff item, and invalid input is rejected', async () => {
  const a = await makeUser();
  const biz = await onboard(a);
  expect(await saveHoursCore(a, biz.id, { ...hours, 'close-1': '08:00' })).toMatchObject({
    ok: false,
    code: 'VALIDATION',
    errors: { 'day-1': 'closeBeforeOpen' },
  });
  expect(await saveFirstServiceCore(a, biz.id, { ...service, price: 'abc' })).toMatchObject({
    ok: false,
    errors: { price: 'priceInvalid' },
  });
  expect(await db.openingHours.count({ where: { businessId: biz.id } })).toBe(0);
  // Unlink the staff member: the checklist must flag staff again.
  await saveFirstServiceCore(a, biz.id, service);
  await db.staffService.deleteMany({ where: { staff: { businessId: biz.id } } });
  await saveLocationCore(a, biz.id, location);
  await saveHoursCore(a, biz.id, hours);
  await db.photo.create({ data: { businessId: biz.id, url: 'https://example.test/p.jpg' } });
  const r = await submitForReviewCore(a, biz.id);
  expect(!r.ok && r.missing).toEqual(['staff']);
});

test('onboarding creates a DRAFT business and sets OWNER atomically, never downgrading ADMIN', async () => {
  const customer = await makeUser('CUSTOMER');
  const admin = await makeUser('ADMIN');
  const staff = await makeUser('STAFF');

  const biz = await onboard(customer);
  expect(await db.user.findUniqueOrThrow({ where: { id: customer } })).toMatchObject({ role: 'OWNER' });
  expect(await db.business.findUniqueOrThrow({ where: { id: biz.id } })).toMatchObject({ status: 'DRAFT', ownerId: customer });

  await onboard(admin);
  expect((await db.user.findUniqueOrThrow({ where: { id: admin } })).role).toBe('ADMIN');

  expect(await startOnboardingCore(staff, basics('Staff Studio'))).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  expect(await db.business.count({ where: { ownerId: staff } })).toBe(0);
  expect((await db.user.findUniqueOrThrow({ where: { id: staff } })).role).toBe('STAFF');

  expect(await startOnboardingCore(null, basics('Nobody'))).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  expect(await startOnboardingCore(customer, { ...basics('X'), name: 'a' })).toMatchObject({ ok: false, code: 'VALIDATION', errors: { name: 'nameRequired' } });
});

test('a double submit makes one business; same-name businesses get distinct slugs', async () => {
  const u1 = await makeUser();
  const [r1, r2] = await Promise.all([startOnboardingCore(u1, basics('Twin Studio')), startOnboardingCore(u1, basics('Twin Studio'))]);
  expect(r1.ok && r2.ok).toBe(true);
  expect(await db.business.count({ where: { ownerId: u1 } })).toBe(1);

  const name = `Same Name ${randomUUID().slice(0, 6)}`;
  const others = await Promise.all([makeUser(), makeUser(), makeUser()]);
  const results = await Promise.all(others.map((id) => startOnboardingCore(id, basics(name))));
  const slugs = results.map((r) => (r.ok ? r.business.slug : ''));
  expect(new Set(slugs).size).toBe(3);
  expect(slugs.every((s) => s.startsWith('same-name-'))).toBe(true);
});

test('audit rows hold ids and field names only', async () => {
  const a = await makeUser();
  const biz = await onboard(a, 'Private Name Studio');
  await saveLocationCore(a, biz.id, { ...location, address: '99 Secret Avenue' });
  await saveHoursCore(a, biz.id, hours);
  await saveFirstServiceCore(a, biz.id, service);

  const rows = await db.auditLog.findMany({ where: { businessId: biz.id } });
  const actions = rows.map((r) => r.action).sort();
  expect(actions).toEqual(['business.create', 'business.firstService', 'business.hours', 'business.location', 'user.role.owner']);
  expect(rows.every((r) => r.actorId === a)).toBe(true);
  const dump = JSON.stringify(rows.map((r) => r.meta));
  for (const secret of ['Private Name', 'Secret Avenue', '99123456', 'Anna', 'Manicure', '@e2e.test']) {
    expect(dump).not.toContain(secret);
  }
});
