import { auth } from './auth';
import { db } from './db';

/** Set of businessIds the signed-in user has favourited (empty if guest). */
export async function getFavouriteIds(): Promise<Set<string>> {
  const session = await auth();
  if (!session?.user?.id) return new Set();
  const rows = await db.favourite.findMany({
    where: { userId: session.user.id },
    select: { businessId: true },
  });
  return new Set(rows.map((r) => r.businessId));
}
