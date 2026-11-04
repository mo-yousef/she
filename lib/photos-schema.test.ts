import { describe, expect, it } from 'vitest';
import { cloudinaryConfig, signCloudinaryParams } from './cloudinary';
import {
  ALLOWED_PHOTO_FORMATS,
  MAX_ALT_LENGTH,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  addPhotoSchema,
  hasPhotoSlot,
  isTrustedPhotoUrl,
  moveToFront,
  parseAlt,
} from './photos-schema';

describe('signCloudinaryParams', () => {
  it('matches the documented Cloudinary example (sorted keys, secret appended, SHA-1 hex)', () => {
    expect(
      signCloudinaryParams({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: '1315060510' }, 'abcd'),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
  it('matches the documented timestamp-only example, and numbers sign like strings', () => {
    expect(signCloudinaryParams({ timestamp: 1315060510 }, 'abcd')).toBe('a21ad0f63beb4de2e5575204b79ab90bffb02c10');
  });
  it('does not depend on key insertion order', () => {
    expect(signCloudinaryParams({ timestamp: 1, folder: 'a' }, 's')).toBe(signCloudinaryParams({ folder: 'a', timestamp: 1 }, 's'));
  });
});

describe('cloudinaryConfig', () => {
  it('is null unless all three variables are set', () => {
    expect(cloudinaryConfig({})).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: ' ' })).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' })).toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
  });
});

describe('isTrustedPhotoUrl', () => {
  const cloud = 'demo-cloud';
  const biz = 'cmbiz123';
  const base = `https://res.cloudinary.com/${cloud}/image/upload`;
  const ok = (u: string) => isTrustedPhotoUrl(u, cloud, biz);

  it.each([
    [`${base}/she/${biz}/abc_123-X.jpg`],
    [`${base}/v1712345678/she/${biz}/abc.png`],
    [`${base}/c_fill,w_800/she/${biz}/abc.webp`],
    [`${base}/she/${biz}/abc.jpeg`],
  ])('accepts %s', (u) => expect(ok(u)).toBe(true));

  it.each([
    ['other host', `https://evil.example/${cloud}/image/upload/she/${biz}/a.jpg`],
    ['look-alike host', `https://res.cloudinary.com.evil.example/${cloud}/image/upload/she/${biz}/a.jpg`],
    ['http', `http://res.cloudinary.com/${cloud}/image/upload/she/${biz}/a.jpg`],
    ['userinfo trick', `https://res.cloudinary.com@evil.example/${cloud}/image/upload/she/${biz}/a.jpg`],
    ['userinfo prefix', `https://user:pw@res.cloudinary.com/${cloud}/image/upload/she/${biz}/a.jpg`],
    ['port', `https://res.cloudinary.com:8443/${cloud}/image/upload/she/${biz}/a.jpg`],
    ['wrong cloud', `https://res.cloudinary.com/other/image/upload/she/${biz}/a.jpg`],
    ['wrong business folder', `${base}/she/someone-else/a.jpg`],
    ['no she folder', `${base}/${biz}/a.jpg`],
    ['traversal', `${base}/she/${biz}/../other/a.jpg`],
    ['traversal in transformation', `${base}/../she/${biz}/a.jpg`],
    ['encoded dot traversal', `${base}/she/${biz}/%2e%2e/a.jpg`],
    ['encoded slash', `${base}/she%2f${biz}/a.jpg`],
    ['backslash', `${base}/she\\${biz}/a.jpg`],
    ['query', `${base}/she/${biz}/a.jpg?x=1`],
    ['empty query', `${base}/she/${biz}/a.jpg?`],
    ['fragment', `${base}/she/${biz}/a.jpg#x`],
    ['svg', `${base}/she/${biz}/a.svg`],
    ['gif', `${base}/she/${biz}/a.gif`],
    ['no extension', `${base}/she/${biz}/a`],
    ['double extension', `${base}/she/${biz}/a.php.jpg`],
    ['raw upload type', `https://res.cloudinary.com/${cloud}/raw/upload/she/${biz}/a.jpg`],
    ['fetch delivery type', `https://res.cloudinary.com/${cloud}/image/fetch/she/${biz}/a.jpg`],
    ['whitespace', ` ${base}/she/${biz}/a.jpg`],
    ['too long', `${base}/she/${biz}/${'a'.repeat(400)}.jpg`],
    ['empty', ''],
  ])('rejects %s', (_name, u) => expect(ok(u)).toBe(false));

  it('rejects non-strings and a missing cloud name', () => {
    expect(isTrustedPhotoUrl(undefined, cloud, biz)).toBe(false);
    expect(isTrustedPhotoUrl({}, cloud, biz)).toBe(false);
    expect(isTrustedPhotoUrl(`${base}/she/${biz}/a.jpg`, undefined, biz)).toBe(false);
  });

  it('does not treat the cloud name or business id as a regex', () => {
    expect(isTrustedPhotoUrl('https://res.cloudinary.com/x/image/upload/she/b/a.jpg', '.*', 'b')).toBe(false);
    expect(isTrustedPhotoUrl(`${base}/she/${biz}/a.jpg`, cloud, '.*')).toBe(false);
  });
});

describe('photo limits', () => {
  it('has the agreed constants (no svg, no gif)', () => {
    expect(MAX_PHOTOS).toBe(12);
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
    expect([...ALLOWED_PHOTO_FORMATS]).toEqual(['jpg', 'jpeg', 'png', 'webp']);
    expect(MAX_ALT_LENGTH).toBe(160);
  });

  it('quota allows exactly MAX_PHOTOS', () => {
    expect(hasPhotoSlot(MAX_PHOTOS - 1)).toBe(true);
    expect(hasPhotoSlot(MAX_PHOTOS)).toBe(false);
  });

  it('addPhotoSchema checks advisory format and bytes', () => {
    const good = { url: 'u', format: 'JPG', bytes: 1000 };
    expect(addPhotoSchema.parse(good).format).toBe('jpg');
    expect(addPhotoSchema.safeParse({ ...good, format: 'svg' }).success).toBe(false);
    expect(addPhotoSchema.safeParse({ ...good, format: 'gif' }).success).toBe(false);
    expect(addPhotoSchema.safeParse({ ...good, bytes: MAX_PHOTO_BYTES }).success).toBe(true);
    expect(addPhotoSchema.safeParse({ ...good, bytes: MAX_PHOTO_BYTES + 1 }).success).toBe(false);
    expect(addPhotoSchema.safeParse({ ...good, bytes: 0 }).success).toBe(false);
    expect(addPhotoSchema.safeParse({ ...good, bytes: '10' }).success).toBe(false);
  });

  it('parseAlt trims, strips control characters, allows empty and caps at 160', () => {
    expect(parseAlt('  Nails\u0000 up  ')).toEqual({ ok: true, alt: 'Nails  up' });
    expect(parseAlt('')).toEqual({ ok: true, alt: '' });
    expect(parseAlt('a'.repeat(MAX_ALT_LENGTH))).toMatchObject({ ok: true });
    expect(parseAlt('a'.repeat(MAX_ALT_LENGTH + 1))).toEqual({ ok: false, errors: { alt: 'altTooLong' } });
    expect(parseAlt(42)).toMatchObject({ ok: false });
  });

  it('moveToFront keeps the rest in order, and is null for first or unknown ids', () => {
    expect(moveToFront(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'a', 'b', 'd']);
    expect(moveToFront(['a', 'b'], 'a')).toBeNull();
    expect(moveToFront(['a', 'b'], 'zz')).toBeNull();
  });
});
