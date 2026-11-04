/**
 * DB-backed tests for the owner profile + brand colours (task 6.7 part 1, req 5.1 / 10 / 8); brand colours were removed (one platform palette).
 * Real Postgres; the lib cores behind the 'use server' wrappers are called directly with
 * explicit user ids. No browser. The photos describe block at the end covers task 6.7 part 2.
 */
import { test, expect } from '@playwright/test';
import { db } from '../lib/db';
import { saveProfileCore } from '../lib/profile';
import {
  addPhotoCore,
  createUploadSignatureCore,
  deletePhotoCore,
  movePhotoCore,
  setCoverCore,
  updatePhotoAltCore,
} from '../lib/photos';
import { signCloudinaryParams } from '../lib/cloudinary';
import { MAX_ALT_LENGTH, MAX_PHOTOS } from '../lib/photos-schema';
import { saveFirstServiceCore, saveHoursCore, saveLocationCore, startOnboardingCore, submitForReviewCore } from '../lib/onboarding';
import { createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
let otherOwnerId: string;

// Distinctive values so the audit-leak check can search for them.
const SECRET_NAME = 'Secret Studio Name 7731';
const SECRET_TAGLINE = 'Secret tagline 4417';
const SECRET_ABOUT = 'Secret about text 9921';
const SECRET_EL = 'Μυστικό κείμενο 5512';

test.beforeEach(async () => {
  fx = await createFixture(1);
  other = await createFixture(1);
  ownerId = (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).ownerId;
  otherOwnerId = (await db.business.findUniqueOrThrow({ where: { id: other.businessId } })).ownerId;
});
test.afterEach(async () => {
  await db.auditLog.deleteMany({ where: { businessId: { in: [fx.businessId, other.businessId] } } });
  await fx.cleanup();
  await other.cleanup();
});

const validProfile = (over: Record<string, unknown> = {}) => ({
  name: SECRET_NAME,
  category: 'hair',
  city: 'Nicosia',
  languages: ['en', 'el'],
  tagline: SECRET_TAGLINE,
  about: SECRET_ABOUT,
  address: '12 Ledra Street',
  phone: '99 123456',
  whatsapp: '',
  instagram: '@studio.cy',
  website: 'www.example.com',
  lat: '35.17',
  lng: '33.36',
  translations: { el: { tagline: SECRET_EL, about: '' }, ru: { tagline: '', about: '' } },
  ...over,
});

test.describe('profile details', () => {
  test('persists fields and translations; the slug stays put on rename', async () => {
    const res = await saveProfileCore(ownerId, fx.businessId, validProfile());
    expect(res.ok).toBe(true);
    const b = await db.business.findUniqueOrThrow({ where: { id: fx.businessId }, include: { translations: true } });
    expect(b.name).toBe(SECRET_NAME);
    expect(b.slug).toBe(fx.slug);
    expect(b.category).toBe('hair');
    expect(b.city).toBe('Nicosia');
    expect(b.languages).toEqual(['en', 'el']);
    expect(b.phone).toBe('+35799123456');
    expect(b.instagram).toBe('studio.cy');
    expect(b.website).toBe('https://www.example.com');
    expect(b.lat).toBeCloseTo(35.17);
    expect(b.status).toBe('PUBLISHED'); // editing a live listing keeps it live
    expect(b.translations).toHaveLength(1);
    expect(b.translations[0]).toMatchObject({ locale: 'el', tagline: SECRET_EL, about: null });
  });

  test('empty translation deletes the row; a changed one updates it', async () => {
    await saveProfileCore(ownerId, fx.businessId, validProfile());
    await saveProfileCore(ownerId, fx.businessId, validProfile({ translations: { el: { tagline: 'Νέο', about: 'Κείμενο' }, ru: { tagline: 'Новый', about: '' } } }));
    expect(await db.businessTranslation.count({ where: { businessId: fx.businessId } })).toBe(2);
    await saveProfileCore(ownerId, fx.businessId, validProfile({ translations: { el: { tagline: ' ', about: '' }, ru: { tagline: 'Новый', about: '' } } }));
    const rows = await db.businessTranslation.findMany({ where: { businessId: fx.businessId } });
    expect(rows.map((r) => r.locale)).toEqual(['ru']);
  });

  test('invalid input is rejected with field errors and nothing is written', async () => {
    const before = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
    const res = await saveProfileCore(
      ownerId,
      fx.businessId,
      validProfile({ name: 'x', languages: [], phone: '12', lat: '35', lng: '', translations: { el: { tagline: 'a'.repeat(121), about: '' }, ru: {} } }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('VALIDATION');
    expect(Object.keys(res.errors ?? {})).toEqual(expect.arrayContaining(['name', 'languages', 'phone', 'lng', 'translations.el.tagline']));
    const after = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
    expect(after).toEqual(before);
    expect(await db.businessTranslation.count({ where: { businessId: fx.businessId } })).toBe(0);
    expect(await db.auditLog.count({ where: { businessId: fx.businessId } })).toBe(0);
  });

  test('another owner is FORBIDDEN, anonymous is UNAUTHENTICATED, nothing changes', async () => {
    const before = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
    expect(await saveProfileCore(otherOwnerId, fx.businessId, validProfile())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await saveProfileCore(null, fx.businessId, validProfile())).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).toEqual(before);
  });
});

test('audit rows hold ids and field names only (no names, taglines, translations or hex values)', async () => {
  await saveProfileCore(ownerId, fx.businessId, validProfile());
  const rows = await db.auditLog.findMany({ where: { businessId: fx.businessId, action: { in: ['business.profile'] } } });
  expect(rows.map((r) => r.action).sort()).toEqual(['business.profile']);
  const profile = rows.find((r) => r.action === 'business.profile')!;
  expect((profile.meta as { fields: string[] }).fields).toEqual(expect.arrayContaining(['name', 'tagline', 'about', 'translations']));
  const dump = JSON.stringify(rows);
  for (const secret of [SECRET_NAME, SECRET_TAGLINE, SECRET_ABOUT, SECRET_EL, '99123456', 'Ledra', 'example.com']) {
    expect(dump).not.toContain(secret);
  }
});

// ---- photos (task 6.7 part 2) -------------------------------------------------------------
// No real Cloudinary: the cores take the cloud name explicitly and only ever see URLs, so the
// upload round trip itself is NOT covered here (it needs real keys and a browser).

const CLOUD = 'e2e-cloud';
const SECRET_ALT = 'Secret alt text 6613';
const photoUrl = (businessId: string, name: string, ext = 'jpg') => `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/she/${businessId}/${name}.${ext}`;
const body = (businessId: string, name: string) => ({ url: photoUrl(businessId, name), publicId: `she/${businessId}/${name}`, format: 'jpg', bytes: 123_456 });
const add = (user: string | null, businessId: string, name: string) => addPhotoCore(user, businessId, body(businessId, name), CLOUD);

async function addMany(n: number, prefix = 'p') {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await add(ownerId, fx.businessId, `${prefix}${i}`);
    if (!r.ok) throw new Error(`add failed: ${r.code}`);
    ids.push(r.photoId);
  }
  return ids;
}
const order = async (businessId = fx.businessId) =>
  (await db.photo.findMany({ where: { businessId }, orderBy: { sortOrder: 'asc' }, select: { id: true, sortOrder: true } }));
const expectDense = async (expected: string[]) => {
  const rows = await order();
  expect(rows.map((r) => r.id)).toEqual(expected);
  expect(rows.map((r) => r.sortOrder)).toEqual(expected.map((_, i) => i));
};

test.describe('photos: add', () => {
  test('appends at the end with a dense order', async () => {
    const ids = await addMany(3);
    await expectDense(ids);
    const audit = await db.auditLog.findMany({ where: { businessId: fx.businessId, action: 'photo.add' } });
    expect(audit).toHaveLength(3);
  });

  test('untrusted URL, other-business folder, bad extension and bad metadata are rejected with nothing written', async () => {
    const good = body(fx.businessId, 'x');
    const bad = [
      { ...good, url: 'https://evil.example/x.jpg' },
      { ...good, url: `https://res.cloudinary.com/other-cloud/image/upload/she/${fx.businessId}/x.jpg` },
      { ...good, url: photoUrl(other.businessId, 'x') },
      { ...good, url: photoUrl(fx.businessId, 'x', 'svg') },
      { ...good, url: photoUrl(fx.businessId, 'x', 'gif') },
      { ...good, url: `${photoUrl(fx.businessId, 'x')}?x=1` },
      { ...good, url: `https://res.cloudinary.com@evil.example/${CLOUD}/image/upload/she/${fx.businessId}/x.jpg` },
      { ...good, format: 'svg' },
      { ...good, bytes: 6 * 1024 * 1024 },
      { ...good, bytes: 'big' },
      null,
    ];
    for (const raw of bad) {
      expect(await addPhotoCore(ownerId, fx.businessId, raw, CLOUD)).toMatchObject({ ok: false, code: 'VALIDATION' });
    }
    expect(await db.photo.count({ where: { businessId: { in: [fx.businessId, other.businessId] } } })).toBe(0);
    expect(await db.auditLog.count({ where: { businessId: fx.businessId } })).toBe(0);
  });

  test('a duplicate URL for the same business is rejected', async () => {
    await add(ownerId, fx.businessId, 'same');
    expect(await add(ownerId, fx.businessId, 'same')).toMatchObject({ ok: false, code: 'VALIDATION', errors: { url: 'duplicate' } });
    expect(await db.photo.count({ where: { businessId: fx.businessId } })).toBe(1);
  });

  test('not configured: no cloud name answers NOT_CONFIGURED and writes nothing', async () => {
    expect(await addPhotoCore(ownerId, fx.businessId, body(fx.businessId, 'n'), '')).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(await createUploadSignatureCore(ownerId, fx.businessId, null)).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(await db.photo.count({ where: { businessId: fx.businessId } })).toBe(0);
  });

  test('anonymous and other owners cannot add', async () => {
    expect(await add(null, fx.businessId, 'a')).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await add(otherOwnerId, fx.businessId, 'a')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await db.photo.count({ where: { businessId: fx.businessId } })).toBe(0);
  });
});

test.describe('photos: upload signature and quota', () => {
  const cfg = { cloudName: CLOUD, apiKey: 'key-123', apiSecret: 'super-secret-value' };

  test('signs allowed_formats, folder and timestamp for THIS business; never returns the secret', async () => {
    const now = new Date('2026-11-06T10:00:00Z');
    const res = await createUploadSignatureCore(ownerId, fx.businessId, cfg, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const u = res.upload;
    expect(u).toMatchObject({ cloudName: CLOUD, apiKey: 'key-123', folder: `she/${fx.businessId}`, allowedFormats: 'jpg,jpeg,png,webp', timestamp: 1793959200 });
    expect(u.signature).toBe(signCloudinaryParams({ allowed_formats: u.allowedFormats, folder: u.folder, timestamp: u.timestamp }, cfg.apiSecret));
    expect(JSON.stringify(res)).not.toContain(cfg.apiSecret);
    expect(await createUploadSignatureCore(otherOwnerId, fx.businessId, cfg, now)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await createUploadSignatureCore(null, fx.businessId, cfg, now)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });

  test('sequential adds stop at MAX_PHOTOS; the signature pre-check agrees', async () => {
    await addMany(MAX_PHOTOS);
    expect(await add(ownerId, fx.businessId, 'one-too-many')).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(await createUploadSignatureCore(ownerId, fx.businessId, cfg)).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(await db.photo.count({ where: { businessId: fx.businessId } })).toBe(MAX_PHOTOS);
  });

  test('parallel adds near the limit never exceed MAX_PHOTOS and keep a dense order', async () => {
    await addMany(MAX_PHOTOS - 2);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => add(ownerId, fx.businessId, `race${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.code === 'QUOTA_EXCEEDED')).toHaveLength(6);
    const rows = await order();
    expect(rows).toHaveLength(MAX_PHOTOS);
    expect(rows.map((r) => r.sortOrder)).toEqual(Array.from({ length: MAX_PHOTOS }, (_, i) => i));
  });
});

test.describe('photos: alt text', () => {
  test('persists trimmed text, allows empty, enforces the max length', async () => {
    const [id] = await addMany(1);
    expect(await updatePhotoAltCore(ownerId, fx.businessId, id!, `  ${SECRET_ALT}  `)).toMatchObject({ ok: true });
    expect((await db.photo.findUniqueOrThrow({ where: { id: id! } })).alt).toBe(SECRET_ALT);
    expect(await updatePhotoAltCore(ownerId, fx.businessId, id!, 'a'.repeat(MAX_ALT_LENGTH))).toMatchObject({ ok: true });
    expect(await updatePhotoAltCore(ownerId, fx.businessId, id!, 'a'.repeat(MAX_ALT_LENGTH + 1))).toMatchObject({ ok: false, code: 'VALIDATION', errors: { alt: 'altTooLong' } });
    expect((await db.photo.findUniqueOrThrow({ where: { id: id! } })).alt).toBe('a'.repeat(MAX_ALT_LENGTH));
    expect(await updatePhotoAltCore(ownerId, fx.businessId, id!, '')).toMatchObject({ ok: true });
    expect((await db.photo.findUniqueOrThrow({ where: { id: id! } })).alt).toBe('');
  });

  test('a cross-tenant photo id is NOT_FOUND, another owner FORBIDDEN, anonymous UNAUTHENTICATED; nothing changes', async () => {
    const [mine] = await addMany(1);
    const theirs = await addPhotoCore(otherOwnerId, other.businessId, body(other.businessId, 't'), CLOUD);
    if (!theirs.ok) throw new Error('setup');
    expect(await updatePhotoAltCore(ownerId, fx.businessId, theirs.photoId, 'hijack')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await updatePhotoAltCore(otherOwnerId, fx.businessId, mine!, 'hijack')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await updatePhotoAltCore(null, fx.businessId, mine!, 'hijack')).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    expect((await db.photo.findUniqueOrThrow({ where: { id: theirs.photoId } })).alt).toBe('');
    expect((await db.photo.findUniqueOrThrow({ where: { id: mine! } })).alt).toBe('');
  });
});

test.describe('photos: order and cover', () => {
  test('move earlier/later swaps neighbours, stays dense and is a no-op at the edges', async () => {
    const [a, b, c] = await addMany(3);
    expect(await movePhotoCore(ownerId, fx.businessId, c!, 'up')).toMatchObject({ ok: true, moved: true });
    await expectDense([a!, c!, b!]);
    expect(await movePhotoCore(ownerId, fx.businessId, a!, 'down')).toMatchObject({ ok: true, moved: true });
    await expectDense([c!, a!, b!]);
    expect(await movePhotoCore(ownerId, fx.businessId, c!, 'up')).toMatchObject({ ok: true, moved: false });
    expect(await movePhotoCore(ownerId, fx.businessId, b!, 'down')).toMatchObject({ ok: true, moved: false });
    await expectDense([c!, a!, b!]);
    expect(await db.auditLog.count({ where: { businessId: fx.businessId, action: 'photo.move' } })).toBe(2); // no-ops are not audited
    expect(await movePhotoCore(ownerId, fx.businessId, a!, 'sideways' as 'up')).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  test('set as cover moves to position 0, and the card and public page query shapes show it first', async () => {
    const [a, b, c] = await addMany(3);
    expect(await setCoverCore(ownerId, fx.businessId, c!)).toMatchObject({ ok: true, moved: true });
    await expectDense([c!, a!, b!]);
    expect(await setCoverCore(ownerId, fx.businessId, c!)).toMatchObject({ ok: true, moved: false }); // already the cover
    const cover = await db.photo.findUniqueOrThrow({ where: { id: c! } });
    // lib/search.ts (cards) and favourites read `photos: { orderBy: { sortOrder: 'asc' }, take: 1 }` and use [0]
    // as the cover. searchBusinesses itself imports next/cache and cannot load under Playwright, so
    // the same query shape is run here.
    const card = await db.business.findUniqueOrThrow({ where: { slug: fx.slug }, include: { photos: { orderBy: { sortOrder: 'asc' }, take: 1 } } });
    expect(card.photos[0]?.url).toBe(cover.url);
    // The public business page reads `photos: { orderBy: { sortOrder: 'asc' } }`.
    const page = await db.business.findUniqueOrThrow({ where: { slug: fx.slug }, include: { photos: { orderBy: { sortOrder: 'asc' } } } });
    expect(page.photos[0]!.id).toBe(c);
  });

  test('cross-tenant ids are NOT_FOUND and other owners FORBIDDEN for move and cover', async () => {
    const [mine] = await addMany(2);
    const theirs = await addPhotoCore(otherOwnerId, other.businessId, body(other.businessId, 't'), CLOUD);
    if (!theirs.ok) throw new Error('setup');
    expect(await movePhotoCore(ownerId, fx.businessId, theirs.photoId, 'up')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await setCoverCore(ownerId, fx.businessId, theirs.photoId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await setCoverCore(otherOwnerId, fx.businessId, mine!)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await setCoverCore(null, fx.businessId, mine!)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });
});

test.describe('photos: delete', () => {
  test('removes the photo and re-densifies the order', async () => {
    const [a, b, c] = await addMany(3);
    expect(await deletePhotoCore(ownerId, fx.businessId, a!)).toMatchObject({ ok: true, warnings: [] });
    await expectDense([b!, c!]);
    expect(await db.photo.count({ where: { id: a! } })).toBe(0);
  });

  test('cross-tenant NOT_FOUND, other owner FORBIDDEN, anonymous UNAUTHENTICATED', async () => {
    const [mine] = await addMany(1);
    const theirs = await addPhotoCore(otherOwnerId, other.businessId, body(other.businessId, 't'), CLOUD);
    if (!theirs.ok) throw new Error('setup');
    expect(await deletePhotoCore(ownerId, fx.businessId, theirs.photoId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await deletePhotoCore(otherOwnerId, fx.businessId, mine!)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await deletePhotoCore(null, fx.businessId, mine!)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await db.photo.count({ where: { businessId: { in: [fx.businessId, other.businessId] } } })).toBe(2);
  });

  test('deleting the last photo of a PUBLISHED listing is allowed with a NO_PHOTOS warning; a DRAFT gets none', async () => {
    const [only] = await addMany(1);
    expect(await deletePhotoCore(ownerId, fx.businessId, only!)).toMatchObject({ ok: true, warnings: ['NO_PHOTOS'] });
    await db.business.update({ where: { id: fx.businessId }, data: { status: 'DRAFT' } });
    const [again] = await addMany(1, 'q');
    expect(await deletePhotoCore(ownerId, fx.businessId, again!)).toMatchObject({ ok: true, warnings: [] });
  });
});

test('6.1 dependency: a fully set-up DRAFT is blocked only by the photo, then submits after addPhotoCore', async () => {
  const user = await db.user.create({ data: { email: `ph-${Date.now()}@e2e.test`, role: 'OWNER' } });
  try {
    const hours: Record<string, string> = {};
    for (let d = 0; d <= 6; d++) {
      hours[`open-${d}`] = '09:00';
      hours[`close-${d}`] = '18:00';
    }
    const started = await startOnboardingCore(user.id, { name: 'Photo Studio', category: 'nails', city: 'Larnaca', languages: ['en'], tagline: '', about: '' });
    if (!started.ok) throw new Error(`onboarding failed: ${started.code}`);
    const id = started.business.id;
    await saveLocationCore(user.id, id, { address: '1 Test Street', phone: '99123456', whatsapp: '', instagram: '', website: '', lat: '', lng: '' });
    await saveHoursCore(user.id, id, hours);
    await saveFirstServiceCore(user.id, id, { serviceName: 'Manicure', serviceCategory: 'nails', durationMin: '60', price: '25.50', staffName: 'Anna' });

    const blocked = await submitForReviewCore(user.id, id);
    expect(blocked).toMatchObject({ ok: false, code: 'INCOMPLETE' });
    expect(!blocked.ok && blocked.missing).toEqual(['photo']);
    expect((await db.business.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');

    expect(await addPhotoCore(user.id, id, body(id, 'first'), CLOUD)).toMatchObject({ ok: true });
    expect(await submitForReviewCore(user.id, id)).toMatchObject({ ok: true, status: 'PENDING' });

    // Deleting the last photo of the now-PENDING listing is allowed, with a warning.
    const photo = await db.photo.findFirstOrThrow({ where: { businessId: id } });
    expect(await deletePhotoCore(user.id, id, photo.id)).toMatchObject({ ok: true, warnings: ['NO_PHOTOS'] });
  } finally {
    const biz = await db.business.findMany({ where: { ownerId: user.id }, select: { id: true } });
    await db.auditLog.deleteMany({ where: { OR: [{ businessId: { in: biz.map((b) => b.id) } }, { actorId: user.id }] } });
    await db.business.deleteMany({ where: { ownerId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});

test('photo audit rows hold ids and field names only (no URLs, alt text or public ids)', async () => {
  const [a, b] = await addMany(2);
  await updatePhotoAltCore(ownerId, fx.businessId, a!, SECRET_ALT);
  await movePhotoCore(ownerId, fx.businessId, b!, 'up');
  await setCoverCore(ownerId, fx.businessId, a!);
  await deletePhotoCore(ownerId, fx.businessId, b!);
  const rows = await db.auditLog.findMany({ where: { businessId: fx.businessId, action: { startsWith: 'photo.' } } });
  expect([...new Set(rows.map((r) => r.action))].sort()).toEqual(['photo.add', 'photo.alt', 'photo.cover', 'photo.delete', 'photo.move']);
  expect(rows.find((r) => r.action === 'photo.alt')!.meta).toEqual({ photoId: a, fields: ['alt'] });
  expect(rows.find((r) => r.action === 'photo.move')!.meta).toEqual({ photoId: b, direction: 'up' });
  const dump = JSON.stringify(rows);
  for (const leak of [SECRET_ALT, 'res.cloudinary.com', 'https://', `she/${fx.businessId}`, CLOUD]) expect(dump).not.toContain(leak);
});
