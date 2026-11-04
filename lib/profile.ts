/**
 * Business profile + brand colour cores (task 6.7 part 1, req 5.1 / 10 / 8). Server-only.
 * `app/actions/profile.ts` holds the thin 'use server' wrappers; everything here takes explicit
 * inputs so Playwright can call it. Every core starts with `assertOwnsBusiness`.
 *
 *  - The slug is never touched (stable URLs): renaming does not change it.
 *  - Editing is allowed in every status (including PENDING / PUBLISHED); the wrapper revalidates.
 *  - Audit meta is field NAMES only (never names, taglines, addresses or hex values).
 *  - Brand colours are validated by `checkBrand` (>= 4.5:1 vs white, and the 35% accent blend).
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { writeAudit } from './audit';
import { assertOwnsBusiness, ownerAuthCode, type OwnedBusiness, type OwnerAuthCode } from './owner-auth';
import { PROFILE_TRANSLATION_LOCALES, parseProfile, type ProfileFieldErrors } from './profile-schema';

type Fail = {
  ok: false;
  code: OwnerAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'UNKNOWN';
  errors?: ProfileFieldErrors;
};
export type ProfileResult<T = object> = ({ ok: true; businessId: string; slug: string } & T) | Fail;
const fail = (code: Fail['code'], extra: Omit<Fail, 'ok' | 'code'> = {}): Fail => ({ ok: false, code, ...extra });

async function run<T>(userId: string | null | undefined, businessId: string, fn: (o: OwnedBusiness) => Promise<ProfileResult<T>>): Promise<ProfileResult<T>> {
  let owned: OwnedBusiness;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  try {
    return await fn(owned);
  } catch (e) {
    console.error('profile failed', e instanceof Error ? e.name : 'unknown'); // name only: no PII
    return fail('UNKNOWN');
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- details ---------------------------------------------------------------------------

export async function saveProfileCore(userId: string | null | undefined, businessId: string, raw: unknown): Promise<ProfileResult<{ fields: string[] }>> {
  return run(userId, businessId, async (o) => {
    const parsed = parseProfile(raw);
    if (!parsed.ok) return fail('VALIDATION', { errors: parsed.errors });
    const { basics: b, location: l, translations } = parsed.data;
    const next = {
      name: b.name,
      category: b.category,
      city: b.city,
      languages: b.languages,
      tagline: b.tagline ?? null,
      about: b.about ?? null,
      address: l.address,
      phone: l.phone ?? null,
      whatsapp: l.whatsapp ?? null,
      instagram: l.instagram ?? null,
      website: l.website ?? null,
      lat: l.lat ?? null,
      lng: l.lng ?? null,
    };
    const fields = await db.$transaction(async (tx) => {
      const existing = await tx.business.findUnique({ where: { id: o.business.id }, include: { translations: true } });
      if (!existing) return null;
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => !same(existing[k], next[k])) as string[];
      await tx.business.update({ where: { id: o.business.id }, data: next }); // slug is never in `next`
      if (await writeTranslations(tx, o.business.id, translations, existing.translations)) changed.push('translations');
      if (changed.length) await writeAudit({ actorId: o.user.id, businessId: o.business.id, action: 'business.profile', meta: { fields: changed } }, tx);
      return changed;
    });
    if (!fields) return fail('NOT_FOUND');
    return { ok: true, businessId: o.business.id, slug: o.business.slug, fields };
  });
}

/** Upsert a locale row when it has text, delete it when both fields are empty. Returns true if anything changed. */
async function writeTranslations(
  tx: Prisma.TransactionClient,
  businessId: string,
  input: Record<string, { tagline?: string; about?: string }>,
  existing: Array<{ locale: string; tagline: string | null; about: string | null }>,
): Promise<boolean> {
  let changed = false;
  for (const locale of PROFILE_TRANSLATION_LOCALES) {
    const t = input[locale];
    const prev = existing.find((r) => r.locale === locale);
    if (t?.tagline || t?.about) {
      const data = { tagline: t.tagline ?? null, about: t.about ?? null };
      if (prev?.tagline !== data.tagline || prev?.about !== data.about) changed = true;
      await tx.businessTranslation.upsert({ where: { businessId_locale: { businessId, locale } }, create: { businessId, locale, ...data }, update: data });
    } else if (prev) {
      changed = true;
      await tx.businessTranslation.deleteMany({ where: { businessId, locale } });
    }
  }
  return changed;
}

// ---- dashboard read --------------------------------------------------------------------

export async function loadProfileForDashboard(businessId: string) {
  const b = await db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      name: true, category: true, city: true, languages: true, tagline: true, about: true,
      address: true, phone: true, whatsapp: true, instagram: true, website: true, lat: true, lng: true,
      brandPrimary: true, brandAccent: true,
      translations: { select: { locale: true, tagline: true, about: true } },
    },
  });
  return b;
}
