import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { routing } from '@/i18n/routing';

/**
 * Identity bridge between Supabase Auth and the app's own Prisma `User` table.
 *
 * Supabase Auth owns authentication (magic link / Google); the Prisma `User`
 * row remains the source of truth for roles and every domain relation
 * (Business.ownerId, Booking.customerId, StaffMember.userId, Favourite.userId).
 * We link the two by email, which is unique on both sides. This preserves the
 * seeded accounts (owner@she.cy / admin@she.cy / customer@she.cy) and their
 * roles: the first time such a user signs in via Supabase, we find the existing
 * row by email rather than creating a new one, so the role is kept.
 */

export interface AppUser {
  id: string;
  email: string;
  role: string;
  locale: string;
  name: string | null;
}

function normaliseLocale(value: unknown): string {
  const v = typeof value === 'string' ? value : '';
  return (routing.locales as readonly string[]).includes(v) ? v : routing.defaultLocale;
}

/**
 * Returns the current app user, syncing the Prisma `User` row with the Supabase
 * session, or null when signed out. Safe to call from Server Components, Server
 * Actions and Route Handlers.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  const email = user.email.toLowerCase();

  // Prefer the name Supabase has (Google profile / metadata); fall back to null.
  const metaName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) ||
    null;

  // Email is verified only once Supabase confirms it; otherwise leave null.
  const emailVerifiedAt = user.email_confirmed_at ? new Date(user.email_confirmed_at) : null;

  // Role the user signed up as. Only CUSTOMER/OWNER are allowed from signup
  // metadata; anything else (incl. a forged ADMIN) falls back to CUSTOMER. This
  // is applied ONLY when the Prisma row is first created, never on update, so an
  // existing role can never be changed or escalated through metadata.
  const intended = user.user_metadata?.intended_role;
  const createRole: 'CUSTOMER' | 'OWNER' = intended === 'OWNER' ? 'OWNER' : 'CUSTOMER';

  const row = await db.user.upsert({
    where: { email },
    // Existing users keep their role; backfill emailVerified + name only.
    update: {
      ...(emailVerifiedAt ? { emailVerified: emailVerifiedAt } : {}),
      ...(metaName ? { name: metaName } : {}),
    },
    // New users: role from signup intent (CUSTOMER default).
    create: {
      email,
      name: metaName,
      role: createRole,
      emailVerified: emailVerifiedAt,
      image: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
    },
    select: { id: true, email: true, role: true, locale: true, name: true },
  });

  return {
    id: row.id,
    email: row.email ?? email,
    role: row.role,
    locale: normaliseLocale(row.locale),
    name: row.name,
  };
});

/**
 * Lightweight signed-in check that does NOT touch the database. Use for UI that
 * only needs to know whether someone is signed in (e.g. the header), to avoid a
 * Prisma upsert on every public page render. Returns the email or null.
 *
 * Uses `getClaims()`, which verifies the JWT locally (no Auth-server round-trip)
 * when the project signs tokens with an asymmetric key; with a symmetric secret
 * it stays correct but still round-trips. A verified claim is sufficient for a
 * read-only "is someone signed in + their email" check.
 */
export async function getSessionEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === 'string' ? email.toLowerCase() : null;
}

/** Signs the current user out of Supabase (clears the session cookies). */
export async function signOutUser(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
