'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({ businessId: z.string().min(1) });

export type FavouriteResult =
  | { ok: true; favourited: boolean }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID' };

/**
 * Toggle a favourite for the signed-in user (requirement §1). Server-side auth
 * is mandatory: an unauthenticated caller is rejected, never silently ignored.
 */
export async function toggleFavourite(input: unknown): Promise<FavouriteResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };

  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'UNAUTHENTICATED' };

  const userId = session.user.id;
  const { businessId } = parsed.data;

  // deleteMany is idempotent: a double-click or second tab can't throw P2002/P2025.
  const removed = await db.favourite.deleteMany({ where: { userId, businessId } });
  if (removed.count > 0) {
    revalidatePath('/favourites');
    return { ok: true, favourited: false };
  }

  // Only published businesses can be favourited.
  const exists = await db.business.findFirst({
    where: { id: businessId, status: 'PUBLISHED' },
    select: { id: true },
  });
  if (!exists) return { ok: false, error: 'INVALID' };

  // upsert tolerates a concurrent create of the same (userId, businessId).
  await db.favourite.upsert({
    where: { userId_businessId: { userId, businessId } },
    create: { userId, businessId },
    update: {},
  });
  revalidatePath('/favourites');
  return { ok: true, favourited: true };
}
