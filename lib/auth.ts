import 'server-only';
import { getCurrentUser, signOutUser } from './current-user';

/**
 * Compatibility layer over Supabase Auth (replaces Auth.js / NextAuth v5).
 *
 * The app previously used NextAuth's `auth()` which returned a session shaped as
 * `{ user: { id, email, role, locale } } | null`. We preserve that exact shape
 * here, backed by Supabase Auth + the Prisma `User` bridge (see current-user.ts),
 * so every existing call site keeps working. Roles still come from the Prisma
 * `User` row, which remains the source of truth.
 */

export interface AppSession {
  user: {
    id: string;
    email: string;
    role: string;
    locale: string;
    name: string | null;
  };
}

/** Returns the current session (NextAuth-compatible shape) or null when signed out. */
export async function auth(): Promise<AppSession | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      locale: user.locale,
      name: user.name,
    },
  };
}

/** Signs the current user out of Supabase. */
export async function signOut(): Promise<void> {
  await signOutUser();
}
